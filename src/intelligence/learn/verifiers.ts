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
  hubId: string;
  verifiers: LearnedVerifier[];
}

const stores = new Map<string, VerifierStore>();

export async function loadLearnedVerifiers(hubId: string): Promise<LearnedVerifier[]> {
  if (stores.has(hubId)) {
    return stores.get(hubId)!.verifiers;
  }

  const events = await getChain().recall({ type: 'learning:verifier:recorded' });
  const fpEvents = await getChain().recall({ type: 'learning:verifier:false-positive' });
  const proposedEvents = await getChain().recall({ type: 'learning:verifier:proposed' });

  const contextEvents = events.filter(e => {
    const p = e.payload as { hubId: string };
    return p.hubId === hubId;
  });

  const fpPatterns = new Set(
    fpEvents
      .filter(e => (e.payload as { hubId: string }).hubId === hubId)
      .map(e => (e.payload as { pattern: string }).pattern)
  );

  const proposedPatterns = new Set(
    proposedEvents
      .filter(e => (e.payload as { hubId: string }).hubId === hubId)
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
  stores.set(hubId, { hubId, verifiers });

  return verifiers;
}

export async function recordPainSignal(
  hubId: string,
  workId: string,
  failureDescription: string,
  suggestedVerifier: string
): Promise<void> {
  await getChain().append('learning:verifier:recorded', 'intelligence', workId, {
    hubId,
    pattern: suggestedVerifier,
    failureDescription,
  });

  stores.delete(hubId);

  const verifiers = await loadLearnedVerifiers(hubId);
  const verifier = verifiers.find(v => v.pattern === suggestedVerifier);

  if (verifier && verifier.catchCount >= 3 && verifier.falsePositives === 0 && !verifier.proposedToGlobal) {
    await proposeToGlobalRegistry(hubId, verifier);
  }

  console.log(`[Intelligence/Learn] Recorded pain signal: ${suggestedVerifier} (catches: ${verifier?.catchCount || 1})`);
}

export async function recordFalsePositive(
  hubId: string,
  workId: string,
  pattern: string,
  reason: string
): Promise<void> {
  await getChain().append('learning:verifier:false-positive', 'intelligence', workId, {
    hubId,
    pattern,
    reason,
  });

  stores.delete(hubId);

  console.log(`[Intelligence/Learn] False positive recorded: ${pattern}`);
}

async function proposeToGlobalRegistry(
  hubId: string,
  verifier: LearnedVerifier
): Promise<void> {
  await getChain().append('learning:verifier:proposed', 'intelligence', hubId, {
    hubId,
    pattern: verifier.pattern,
    catchCount: verifier.catchCount,
  });

  stores.delete(hubId);

  console.log(`[Intelligence/Learn] Proposed to global registry: ${verifier.pattern}`);
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

export async function suggestVerifiers(hubId: string): Promise<string[]> {
  const learned = await loadLearnedVerifiers(hubId);
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
