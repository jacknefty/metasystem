/**
 * Circulatory Probe
 *
 * Checks variety flow health: stagnation, pooling, flow imbalance.
 */

import { at } from '../../identity/scoped-paths.js';
import { loadSpine, getAllPorts, TIME_SCALES, type Port } from '../../identity/spine.js';
import type { ProbeResult, ProbeFinding } from './types.js';

export async function probeCirculatory(scopePath: string): Promise<ProbeResult> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const findings: ProbeFinding[] = [];
  const now = Date.now();

  if (!spine) {
    return {
      probeType: 'circulatory',
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

  const ports = getAllPorts(spine);

  for (const port of ports) {
    const expectedCycle = TIME_SCALES[port.id];
    if (expectedCycle <= 0 || expectedCycle === Infinity) continue;

    const timeSinceFired = now - port.lastFired;

    // Stagnant: should have fired but hasn't
    if (timeSinceFired > expectedCycle * 3 && port.currentLoad > 0) {
      findings.push({
        severity: 1,
        category: 'stagnant',
        message: `Port ${port.id} has load ${port.currentLoad} but hasn't fired in ${Math.round(timeSinceFired / 1000)}s`,
        evidence: { portId: port.id, load: port.currentLoad, lastFired: port.lastFired },
      });
    }

    // Pooling: variety accumulating without flow
    if (port.overflow > port.capacity * 0.5) {
      findings.push({
        severity: 2,
        category: 'pooling',
        message: `Port ${port.id} overflow at ${Math.round(port.overflow / port.capacity * 100)}% of capacity`,
        evidence: { portId: port.id, overflow: port.overflow, capacity: port.capacity },
      });
    }
  }

  // Check flow balance: ingress should roughly match egress over time
  const ingressTimeDelta = Math.max(1, now - spine.ingress.lastFired);
  const egressTimeDelta = Math.max(1, now - spine.egress.lastFired);
  const ingressRate = spine.ingress.currentLoad / ingressTimeDelta;
  const egressRate = spine.egress.currentLoad / egressTimeDelta;
  const maxRate = Math.max(ingressRate, egressRate, 0.001);
  const flowImbalance = Math.abs(ingressRate - egressRate) / maxRate;

  if (flowImbalance > 0.5 && spine.ingress.currentLoad > 10) {
    findings.push({
      severity: 1,
      category: 'flow_imbalance',
      message: `Ingress/egress flow imbalance: ${(flowImbalance * 100).toFixed(0)}%`,
      evidence: { ingressRate, egressRate },
    });
  }

  return {
    probeType: 'circulatory',
    scopeId: spine.scopeId,
    timestamp: now,
    healthy: findings.filter(f => f.severity >= 2).length === 0,
    findings,
    metrics: { ingressRate, egressRate, flowImbalance },
  };
}
