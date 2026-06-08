/**
 * Identity Drift Evaluator
 *
 * Detects when actual work scope deviates from declared scope.
 * Triggers policy updates or alarms when drift exceeds threshold.
 */

import { loadIdentityAtScope } from './contract.js';
import { loadSpine, saveSpine } from './spine.js';
import { at } from './scoped-paths.js';
import { getChain } from '../coordination/channels/chain.js';
import { emitPolicy, type PolicyChange } from './policy.js';
import { emitPain } from '../coordination/channels/algedonic.js';

export interface DriftAnalysis {
  scopeId: string;
  declaredScope: string[];
  actualScope: string[];
  overlap: number;        // 0-1, how much actual is within declared
  drift: number;          // 0-1, how much actual exceeds declared
  driftingFiles: string[];
}

/**
 * Evaluate identity drift for a scope.
 * Compares declared scope to actual work activity.
 */
export async function evaluateIdentityDrift(
  scopePath: string
): Promise<DriftAnalysis> {
  const scope = at(scopePath);
  const identity = loadIdentityAtScope(scope);

  if (!identity) {
    return {
      scopeId: scopePath,
      declaredScope: [],
      actualScope: [],
      overlap: 1,
      drift: 0,
      driftingFiles: [],
    };
  }

  const declaredScope = identity.scope;

  // Query chain for actual file activity
  const events = await getChain().recall({
    type: ['work:completed', 'work:merged', 'tool:invoked'],
  });

  const actualFiles = new Set<string>();

  for (const event of events) {
    const payload = event.payload as {
      hubId?: string;
      changedFiles?: string[];
      file?: string;
    };

    if (payload.hubId !== identity.frontmatter.id) continue;

    if (payload.changedFiles) {
      payload.changedFiles.forEach(f => actualFiles.add(f));
    }
    if (payload.file) {
      actualFiles.add(payload.file);
    }
  }

  const actualScope = Array.from(actualFiles);

  // Compute overlap and drift
  let inScope = 0;
  let outOfScope = 0;
  const driftingFiles: string[] = [];

  for (const file of actualScope) {
    if (matchesScope(file, declaredScope)) {
      inScope++;
    } else {
      outOfScope++;
      driftingFiles.push(file);
    }
  }

  const total = inScope + outOfScope;
  const overlap = total > 0 ? inScope / total : 1;
  const drift = total > 0 ? outOfScope / total : 0;

  return {
    scopeId: identity.frontmatter.id,
    declaredScope,
    actualScope,
    overlap,
    drift,
    driftingFiles,
  };
}

function matchesScope(file: string, scopePatterns: string[]): boolean {
  for (const pattern of scopePatterns) {
    if (pattern === '**' || pattern === '*') return true;

    // Convert glob to regex
    const regex = new RegExp(
      '^' + pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\//g, '\\/')
      + '$'
    );

    if (regex.test(file)) return true;
  }
  return false;
}

/**
 * Check drift and take action if threshold exceeded.
 */
export async function checkAndHandleDrift(
  scopePath: string,
  threshold: number = 0.1
): Promise<{
  driftDetected: boolean;
  action: 'none' | 'alarm' | 'policy_proposed';
}> {
  const analysis = await evaluateIdentityDrift(scopePath);
  const scope = at(scopePath);
  const spine = loadSpine(scope);

  if (!spine) {
    return { driftDetected: false, action: 'none' };
  }

  // Update essential variable
  const driftVar = spine.essentialVariables.find(v => v.id === 'identity_drift');
  if (driftVar) {
    driftVar.currentValue = analysis.drift;
    driftVar.lastChecked = Date.now();
  }

  saveSpine(scope, spine);

  if (analysis.drift <= threshold) {
    return { driftDetected: false, action: 'none' };
  }

  // Drift detected
  await getChain().append('identity:drift:detected', scopePath, scopePath, {
    drift: analysis.drift,
    driftingFiles: analysis.driftingFiles,
  });

  // Decide action based on drift severity
  if (analysis.drift > 0.3) {
    // Severe drift — alarm + propose scope expansion
    await emitPain(
      'identity_drift',
      scopePath,
      `Identity drift at ${(analysis.drift * 100).toFixed(0)}%: work outside declared scope`,
      2
    );

    // Propose policy change to expand scope
    const policyChange: PolicyChange = {
      type: 'scope_expand',
      payload: { scope: analysis.driftingFiles.map(f => extractPattern(f)) },
      reason: `Detected ${analysis.driftingFiles.length} files outside declared scope`,
      source: 'intelligence',
    };

    await emitPolicy(scopePath, policyChange);

    return { driftDetected: true, action: 'policy_proposed' };
  } else {
    // Moderate drift — just alarm
    await emitPain(
      'identity_drift',
      scopePath,
      `Identity drift at ${(analysis.drift * 100).toFixed(0)}%: consider scope update`,
      1
    );

    return { driftDetected: true, action: 'alarm' };
  }
}

function extractPattern(file: string): string {
  // Convert file path to scope pattern
  // src/api/users.ts -> src/api/**
  const parts = file.split('/');
  if (parts.length > 2) {
    return parts.slice(0, 2).join('/') + '/**';
  }
  return file;
}

/**
 * Integrate with probe framework.
 */
export async function probeIdentityDrift(scopePath: string): Promise<{
  healthy: boolean;
  drift: number;
  analysis: DriftAnalysis;
}> {
  const analysis = await evaluateIdentityDrift(scopePath);
  const threshold = 0.1; // From essential variable

  return {
    healthy: analysis.drift <= threshold,
    drift: analysis.drift,
    analysis,
  };
}
