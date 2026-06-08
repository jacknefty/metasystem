/**
 * Informational Probe
 *
 * Checks signal-to-noise ratio on alarm port, coordination signal presence,
 * attenuation effectiveness.
 */

import { at } from '../../identity/scoped-paths.js';
import { loadSpine } from '../../identity/spine.js';
import { getChain } from '../../coordination/channels/chain.js';
import type { ProbeResult, ProbeFinding } from './types.js';

export async function probeInformational(scopePath: string): Promise<ProbeResult> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const findings: ProbeFinding[] = [];
  const now = Date.now();

  if (!spine) {
    return {
      probeType: 'informational',
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

  // 1. Check signal-to-noise on alarm port
  const alarmEvents = await getChain().recall({ type: ['algedonic:pain'] });
  const scopeAlarms = alarmEvents.filter(e =>
    (e.payload as { hubId?: string }).hubId === spine.scopeId
  );

  const lowSeverityCount = scopeAlarms.filter(e =>
    (e.payload as { severity: number }).severity === 1
  ).length;

  if (lowSeverityCount > 10 && scopeAlarms.length > 0 && lowSeverityCount / scopeAlarms.length > 0.8) {
    findings.push({
      severity: 1,
      category: 'alarm_noise',
      message: `${lowSeverityCount} low-severity alarms (${Math.round(lowSeverityCount / scopeAlarms.length * 100)}%) — alarm fatigue risk`,
    });
  }

  // 2. Check if coordinate port is carrying signal
  const coordinateEvents = await getChain().recall({
    type: ['variety:coord:in', 'variety:coord:out'],
  });
  const scopeCoordinate = coordinateEvents.filter(e =>
    (e.payload as { scopePath?: string }).scopePath === scopePath
  );

  if (scopeCoordinate.length === 0 && spine.coordinate.currentLoad > 0) {
    findings.push({
      severity: 1,
      category: 'silent_coordination',
      message: 'Coordinate port has load but no coordination events in chain',
    });
  }

  // 3. Attenuation check: is variety being properly filtered?
  const rawVariety = spine.ingress.currentLoad;
  const processedVariety = spine.egress.currentLoad;
  const attenuationRatio = rawVariety > 0 ? processedVariety / rawVariety : 1;

  // No attenuation = passing through everything = not filtering
  if (attenuationRatio > 0.9 && rawVariety > 100) {
    findings.push({
      severity: 1,
      category: 'no_attenuation',
      message: `Attenuation ratio ${(attenuationRatio * 100).toFixed(0)}% — system may be overwhelmed`,
    });
  }

  return {
    probeType: 'informational',
    scopeId: spine.scopeId,
    timestamp: now,
    healthy: findings.filter(f => f.severity >= 2).length === 0,
    findings,
    metrics: { lowSeverityCount, attenuationRatio, alarmCount: scopeAlarms.length },
  };
}
