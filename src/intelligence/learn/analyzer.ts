/**
 * Learning Analyzer
 *
 * Analyze patterns from recorded outcomes.
 */

import { getChain } from '../../coordination/channels/chain.js';
import type { LearningStats, NodeLearning } from './types.js';
import { parseVerifier } from '../../control/verify/registry.js';

export async function getLearningStats(): Promise<LearningStats> {
  const events = await getChain().recall({ type: 'learning:recorded' });

  if (events.length === 0) {
    return {
      totalRecords: 0,
      successRate: 0,
      avgDuration: 0,
      avgAttempts: 0,
      verifierAccuracy: {},
      executorPerformance: {},
      commonFailurePatterns: [],
    };
  }

  let successCount = 0;
  let totalDuration = 0;
  let totalAttempts = 0;

  const verifierResults: Record<string, { success: number; total: number }> = {};
  const executorResults: Record<string, { success: number; total: number; duration: number }> = {};
  const failureReasons: Record<string, number> = {};

  for (const event of events) {
    const p = event.payload as any;

    if (p.outcome === 'success') successCount++;
    totalDuration += p.durationMs || 0;
    totalAttempts += p.attempts || 1;

    const executor = p.executorUsed || 'unknown';
    if (!executorResults[executor]) {
      executorResults[executor] = { success: 0, total: 0, duration: 0 };
    }
    executorResults[executor].total++;
    executorResults[executor].duration += p.durationMs || 0;
    if (p.outcome === 'success') executorResults[executor].success++;

    for (const cond of p.conditions || []) {
      const { type } = parseVerifier(cond.verifier);
      if (!verifierResults[type]) {
        verifierResults[type] = { success: 0, total: 0 };
      }
      verifierResults[type].total++;
      if (cond.met) verifierResults[type].success++;

      if (!cond.met && p.outcome === 'failure') {
        const reason = `${type}:${cond.verifier.split(':').slice(1).join(':')}`;
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      }
    }
  }

  const verifierAccuracy: Record<string, number> = {};
  for (const [type, results] of Object.entries(verifierResults)) {
    verifierAccuracy[type] = results.total > 0 ? results.success / results.total : 0;
  }

  const executorPerformance: Record<string, { successRate: number; avgDuration: number }> = {};
  for (const [executor, results] of Object.entries(executorResults)) {
    executorPerformance[executor] = {
      successRate: results.total > 0 ? results.success / results.total : 0,
      avgDuration: results.total > 0 ? results.duration / results.total : 0,
    };
  }

  const commonFailurePatterns = Object.entries(failureReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason]) => reason);

  return {
    totalRecords: events.length,
    successRate: events.length > 0 ? successCount / events.length : 0,
    avgDuration: events.length > 0 ? totalDuration / events.length : 0,
    avgAttempts: events.length > 0 ? totalAttempts / events.length : 0,
    verifierAccuracy,
    executorPerformance,
    commonFailurePatterns,
  };
}

export async function getNodeLearning(nodeId: string): Promise<NodeLearning> {
  const events = await getChain().recall({ type: 'learning:recorded' });
  const nodeEvents = events.filter(e => (e.payload as any).nodeId === nodeId);

  let completedCount = 0;
  let failedCount = 0;
  let totalDuration = 0;

  const verifierSuccess: Record<string, number> = {};
  const verifierTotal: Record<string, number> = {};

  for (const event of nodeEvents) {
    const p = event.payload as any;

    if (p.outcome === 'success') completedCount++;
    else failedCount++;

    totalDuration += p.durationMs || 0;

    for (const cond of p.conditions || []) {
      const { type } = parseVerifier(cond.verifier);
      verifierTotal[type] = (verifierTotal[type] || 0) + 1;
      if (cond.met) verifierSuccess[type] = (verifierSuccess[type] || 0) + 1;
    }
  }

  const strongVerifiers: string[] = [];
  const weakVerifiers: string[] = [];

  for (const [type, total] of Object.entries(verifierTotal)) {
    const rate = (verifierSuccess[type] || 0) / total;
    if (rate >= 0.8) strongVerifiers.push(type);
    else if (rate < 0.5) weakVerifiers.push(type);
  }

  return {
    nodeId,
    completedCount,
    failedCount,
    successRate: nodeEvents.length > 0 ? completedCount / nodeEvents.length : 0,
    avgDuration: nodeEvents.length > 0 ? totalDuration / nodeEvents.length : 0,
    strongVerifiers,
    weakVerifiers,
  };
}
