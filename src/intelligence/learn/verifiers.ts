/**
 * Learned Verifiers
 *
 * Accumulates verifier patterns that catch failures.
 * After 3+ catches with no false positives, proposes to global registry.
 */

import { getChain } from '../../coordination/channels/chain.js';

export interface LearnedVerifier {
  pattern: string;
  catchCount: number;
  falsePositives: number;
  addedAt: number;
  lastUsed: number;
  proposedToGlobal: boolean;
}

interface VerifierStore {
  contextId: string;
  verifiers: LearnedVerifier[];
}

const stores = new Map<string, VerifierStore>();

export async function loadLearnedVerifiers(contextId: string): Promise<LearnedVerifier[]> {
  if (stores.has(contextId)) {
    return stores.get(contextId)!.verifiers;
  }

  const events = await getChain().recall({ type: 'learning:verifier:recorded' });
  const fpEvents = await getChain().recall({ type: 'learning:verifier:false-positive' });
  const proposedEvents = await getChain().recall({ type: 'learning:verifier:proposed' });

  const contextEvents = events.filter(e => {
    const p = e.payload as { contextId: string };
    return p.contextId === contextId;
  });

  const fpPatterns = new Set(
    fpEvents
      .filter(e => (e.payload as { contextId: string }).contextId === contextId)
      .map(e => (e.payload as { pattern: string }).pattern)
  );

  const proposedPatterns = new Set(
    proposedEvents
      .filter(e => (e.payload as { contextId: string }).contextId === contextId)
      .map(e => (e.payload as { pattern: string }).pattern)
  );

  const patternMap = new Map<string, LearnedVerifier>();

  for (const event of contextEvents) {
    const p = event.payload as { pattern: string };
    const existing = patternMap.get(p.pattern);

    if (existing) {
      existing.catchCount++;
      existing.lastUsed = event.timestamp;
    } else {
      patternMap.set(p.pattern, {
        pattern: p.pattern,
        catchCount: 1,
        falsePositives: fpPatterns.has(p.pattern) ? 1 : 0,
        addedAt: event.timestamp,
        lastUsed: event.timestamp,
        proposedToGlobal: proposedPatterns.has(p.pattern),
      });
    }
  }

  const verifiers = Array.from(patternMap.values());
  stores.set(contextId, { contextId, verifiers });

  return verifiers;
}

export async function recordPainSignal(
  contextId: string,
  workId: string,
  failureDescription: string,
  suggestedVerifier: string
): Promise<void> {
  await getChain().append('learning:verifier:recorded', 's4', workId, {
    contextId,
    pattern: suggestedVerifier,
    failureDescription,
  });

  stores.delete(contextId);

  const verifiers = await loadLearnedVerifiers(contextId);
  const verifier = verifiers.find(v => v.pattern === suggestedVerifier);

  if (verifier && verifier.catchCount >= 3 && verifier.falsePositives === 0 && !verifier.proposedToGlobal) {
    await proposeToGlobalRegistry(contextId, verifier);
  }

  console.log(`[S4/Learn] Recorded pain signal: ${suggestedVerifier} (catches: ${verifier?.catchCount || 1})`);
}

export async function recordFalsePositive(
  contextId: string,
  workId: string,
  pattern: string,
  reason: string
): Promise<void> {
  await getChain().append('learning:verifier:false-positive', 's4', workId, {
    contextId,
    pattern,
    reason,
  });

  stores.delete(contextId);

  console.log(`[S4/Learn] False positive recorded: ${pattern}`);
}

async function proposeToGlobalRegistry(
  contextId: string,
  verifier: LearnedVerifier
): Promise<void> {
  await getChain().append('learning:verifier:proposed', 's4', contextId, {
    contextId,
    pattern: verifier.pattern,
    catchCount: verifier.catchCount,
  });

  stores.delete(contextId);

  console.log(`[S4/Learn] Proposed to global registry: ${verifier.pattern}`);
}

export async function getGlobalVerifiers(): Promise<LearnedVerifier[]> {
  const events = await getChain().recall({ type: 'learning:verifier:proposed' });

  const patternMap = new Map<string, LearnedVerifier>();

  for (const event of events) {
    const p = event.payload as { pattern: string; catchCount: number };
    const existing = patternMap.get(p.pattern);

    if (existing) {
      existing.catchCount += p.catchCount;
      existing.lastUsed = Math.max(existing.lastUsed, event.timestamp);
    } else {
      patternMap.set(p.pattern, {
        pattern: p.pattern,
        catchCount: p.catchCount,
        falsePositives: 0,
        addedAt: event.timestamp,
        lastUsed: event.timestamp,
        proposedToGlobal: true,
      });
    }
  }

  return Array.from(patternMap.values())
    .sort((a, b) => b.catchCount - a.catchCount);
}

export async function suggestVerifiers(contextId: string): Promise<string[]> {
  const learned = await loadLearnedVerifiers(contextId);
  const global = await getGlobalVerifiers();

  const localSuggestions = learned
    .filter(v => v.catchCount >= 2 && v.falsePositives === 0)
    .map(v => v.pattern);

  const globalSuggestions = global
    .filter(v => v.catchCount >= 5 && !localSuggestions.includes(v.pattern))
    .slice(0, 3)
    .map(v => v.pattern);

  return [...localSuggestions, ...globalSuggestions];
}
