/**
 * Learning Recorder
 *
 * Record outcomes for completed/failed work.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { getWork } from '../../coordination/resources/work.js';
import { getNode } from '../../identity/node.js';
import type { LearningRecord, ConditionOutcome } from './types.js';

export async function recordOutcome(workId: string): Promise<LearningRecord | null> {
  const work = await getWork(workId);
  if (!work) return null;

  if (!['fulfilled', 'terminated'].includes(work.status)) {
    return null;
  }

  const nodeId = work.claim?.nodeId || 'unknown';

  let outcome: 'success' | 'failure' | 'partial';
  const metCount = work.conditions.filter(c => c.met).length;

  if (work.status === 'fulfilled') {
    outcome = 'success';
  } else if (metCount === 0) {
    outcome = 'failure';
  } else {
    outcome = 'partial';
  }

  const events = await getChain().recall({ subject: workId });
  const claimedEvent = events.find(e => e.type === 'work:claimed');
  const completedEvent = events.find(e => e.type === 'work:completed' || e.type === 'work:failed');

  const durationMs = claimedEvent && completedEvent
    ? completedEvent.timestamp - claimedEvent.timestamp
    : 0;

  const attempts = events.filter(e => e.type === 'work:submitted').length;

  let executorUsed = 'claude';
  if (nodeId !== 'unknown') {
    const node = await getNode(nodeId);
    if (node?.settings.executor) {
      executorUsed = node.settings.executor;
    }
  }

  const conditions: ConditionOutcome[] = work.conditions.map(c => ({
    id: c.id,
    description: c.description,
    met: c.met,
    confidence: c.confidence,
    verifier: c.verifier,
    varietyWeight: c.varietyWeight ?? 10,
  }));

  const record: LearningRecord = {
    workId,
    nodeId,
    hubId: work.hubId,
    outcome,
    conditions,
    executorUsed,
    durationMs,
    attempts,
    recordedAt: Date.now(),
  };

  await getChain().append('learning:recorded', 'intelligence', workId, {
    workId,
    nodeId,
    outcome,
    conditions: conditions.map(c => ({
      id: c.id,
      met: c.met,
      confidence: c.confidence,
      verifier: c.verifier,
    })),
    executorUsed,
    durationMs,
    attempts,
  });

  return record;
}
