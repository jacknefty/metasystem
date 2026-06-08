/**
 * Spine Integrity Probe
 *
 * Verifies spine state matches chain events.
 * Detects F discrepancy, suspicious resets, neglected essential variables.
 */

import { at } from '../../identity/scoped-paths.js';
import { loadSpine, sumOverflow } from '../../identity/spine.js';
import { getChain } from '../../coordination/channels/chain.js';
import type { ProbeResult, ProbeFinding } from './types.js';

export async function probeSpine(scopePath: string): Promise<ProbeResult> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const findings: ProbeFinding[] = [];
  const now = Date.now();

  if (!spine) {
    return {
      probeType: 'spine',
      scopeId: scopePath,
      timestamp: now,
      healthy: false,
      findings: [{
        severity: 3,
        category: 'missing_spine',
        message: 'No spine.json found at scope',
      }],
      metrics: {},
    };
  }

  // 1. Compute F independently from chain events
  const chainF = await computeFreeEnergyFromChain(scopePath);
  const spineF = sumOverflow(spine);
  const fDrift = Math.abs(chainF - spineF) / Math.max(chainF, 1);

  if (fDrift > 0.1) {
    findings.push({
      severity: 2,
      category: 'f_discrepancy',
      message: `Reported F (${spineF}) differs from computed F (${chainF}) by ${(fDrift * 100).toFixed(1)}%`,
      evidence: { chainF, spineF, drift: fDrift },
    });
  }

  // 2. Detect suspicious resets (overflow cleared without work completion)
  const resets = await detectSuspiciousResets(scopePath, spine.scopeId);
  for (const reset of resets) {
    findings.push({
      severity: 3,
      category: 'suspicious_reset',
      message: `Port ${reset.portId} overflow cleared without corresponding resolution`,
      evidence: reset,
    });
  }

  // 3. Verify essential variables are being checked
  const lastEssentialCheck = spine.essentialVariables
    .map(v => v.lastChecked ?? 0)
    .reduce((a, b) => Math.min(a, b), now);

  const checkGap = now - lastEssentialCheck;
  if (checkGap > 300000) { // 5 minutes
    findings.push({
      severity: 1,
      category: 'essential_neglected',
      message: `Essential variables not checked for ${Math.round(checkGap / 60000)} minutes`,
    });
  }

  return {
    probeType: 'spine',
    scopeId: spine.scopeId,
    timestamp: now,
    healthy: findings.filter(f => f.severity >= 2).length === 0,
    findings,
    metrics: { fDrift, checkGap, resetCount: resets.length },
  };
}

async function computeFreeEnergyFromChain(scopePath: string): Promise<number> {
  const events = await getChain().recall({});
  let varietyIn = 0;
  let varietyOut = 0;

  for (const event of events) {
    const payload = event.payload as { bits?: number; scopePath?: string };
    if (payload.scopePath !== scopePath) continue;

    if (event.type.startsWith('variety:') && event.type.endsWith(':in')) {
      varietyIn += payload.bits ?? 0;
    }
    if (event.type.startsWith('variety:') && event.type.endsWith(':out')) {
      varietyOut += payload.bits ?? 0;
    }
  }

  return Math.max(0, varietyIn - varietyOut);
}

async function detectSuspiciousResets(
  scopePath: string,
  scopeId: string
): Promise<Array<{ portId: string; resetAt: number; priorLoad: number }>> {
  const resets: Array<{ portId: string; resetAt: number; priorLoad: number }> = [];

  // Look for patterns where alarm fires but no corresponding work completion
  const events = await getChain().recall({
    type: ['algedonic:pain', 'algedonic:acknowledged', 'work:completed'],
  });

  const painEvents = events.filter(e =>
    e.type === 'algedonic:pain' &&
    (e.payload as { hubId?: string }).hubId === scopeId
  );

  const ackEvents = events.filter(e => e.type === 'algedonic:acknowledged');
  const completionEvents = events.filter(e => e.type === 'work:completed');

  const acknowledged = new Set(ackEvents.map(e => e.subject));

  for (const pain of painEvents) {
    if (acknowledged.has(pain.id)) {
      // Check if there was a completion around the same time
      const ackTime = ackEvents.find(a => a.subject === pain.id)?.timestamp ?? 0;
      const nearbyCompletion = completionEvents.some(c =>
        Math.abs(c.timestamp - ackTime) < 60000
      );

      if (!nearbyCompletion && (pain.payload as { severity: number }).severity >= 2) {
        resets.push({
          portId: 'alarm',
          resetAt: ackTime,
          priorLoad: (pain.payload as { severity: number }).severity * 10,
        });
      }
    }
  }

  return resets;
}
