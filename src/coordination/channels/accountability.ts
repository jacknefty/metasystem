/**
 * Accountability Flow
 *
 * Periodic reports from child to parent via observe port.
 * Child summarizes state, parent receives.
 */

import {
  loadSpine,
  saveSpine,
  sumLoad,
  sumOverflow,
  sumLoadByDirection,
  detectPortAnomalies,
  measureVariety,
  type AccountabilityReport,
} from '../../identity/spine.js';
import { at, parent as getParent } from '../../identity/scoped-paths.js';
import { getChain } from './chain.js';

/**
 * Emit accountability report to parent.
 * Child summarizes own state, parent receives via observe port.
 */
export async function emitReport(scopePath: string): Promise<AccountabilityReport> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);

  if (!spine) {
    throw new Error('Cannot emit report: no spine');
  }

  const now = Date.now();
  const lastReportTime = spine.report.lastFired || spine.createdAt || now - 3600000;

  const report: AccountabilityReport = {
    period: {
      start: lastReportTime,
      end: now,
    },
    varietyIn: sumLoadByDirection(spine, 'in'),
    varietyOut: sumLoadByDirection(spine, 'out'),
    F: sumOverflow(spine),
    anomalies: detectPortAnomalies(spine).map(a => `${a.portId}:${a.type}`),
  };

  // Fire report port
  spine.report.currentLoad = measureReportVariety(report);
  spine.report.lastFired = now;
  saveSpine(scope, spine);

  // Send to parent's observe port
  const parentScope = getParent(scope);
  if (parentScope) {
    const parentSpine = loadSpine(parentScope);
    if (parentSpine) {
      parentSpine.observe.currentLoad += measureReportVariety(report);
      parentSpine.observe.lastFired = now;
      saveSpine(parentScope, parentSpine);
    }
  }

  // Emit chain event
  await getChain().append('report:submitted', scopePath, parentScope?.root() ?? 'root', {
    report,
    scopeId: spine.scopeId,
  });

  return report;
}

function measureReportVariety(report: AccountabilityReport): number {
  // Variety of report = uncertainty it resolves for parent
  // More anomalies = more information
  return 10 + report.anomalies.length * 5 + (report.F > 0 ? 10 : 0);
}

/**
 * Schedule periodic reports.
 * Called during runtime startup.
 */
export function startPeriodicReporting(
  scopePath: string,
  intervalMs: number = 3600000 // 1 hour default
): () => void {
  const interval = setInterval(async () => {
    try {
      await emitReport(scopePath);
    } catch (err) {
      console.error(`[Accountability] Report failed for ${scopePath}:`, err);
    }
  }, intervalMs);

  return () => clearInterval(interval);
}

/**
 * Emit report on significant events (work completion, escalation).
 * More responsive than pure periodic.
 */
export async function emitReportOnEvent(
  scopePath: string,
  trigger: 'work_completed' | 'escalation' | 'alarm' | 'threshold'
): Promise<void> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);

  if (!spine) return;

  // Check if enough time has passed since last report
  const minReportGap = 60000; // 1 minute minimum
  if (Date.now() - spine.report.lastFired < minReportGap) {
    return;
  }

  // Check if state has changed enough to warrant report
  const lastF = spine.lastReportedF ?? 0;
  const currentF = sumOverflow(spine);
  const fChange = Math.abs(currentF - lastF) / Math.max(lastF, 1);

  if (fChange > 0.2 || trigger === 'escalation' || trigger === 'alarm') {
    const report = await emitReport(scopePath);
    spine.lastReportedF = report.F;
    saveSpine(scope, spine);
  }
}
