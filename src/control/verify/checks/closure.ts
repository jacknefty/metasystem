/**
 * Closure Progress Check (Control)
 *
 * Are closure conditions actually progressing, or stalled?
 */

import type { CheckFinding } from './types.js';
import { loadIdentity } from '../../../identity/contract.js';
import { getChain } from '../../../coordination/channels/chain.js';

const STALL_THRESHOLD_DAYS = 14;

export async function checkClosureProgress(
  nodeId: string,
  _workId?: string
): Promise<CheckFinding | null> {
  const identity = loadIdentity(nodeId);
  if (!identity) return null;

  if (identity.frontmatter.closes === 'never') return null;
  if (identity.frontmatter.closed) return null;

  const conditions = identity.closureConditions;
  if (conditions.length === 0) return null;

  const completed = conditions.filter(c => c.completed).length;
  const total = conditions.length;

  if (completed === total) return null;

  const recentWork = await getChain().recall({ emitter: nodeId, type: 'work:completed' });
  const lastWorkAt = recentWork.length > 0
    ? Math.max(...recentWork.map(e => e.timestamp))
    : 0;

  const daysSinceWork = lastWorkAt > 0
    ? (Date.now() - lastWorkAt) / (1000 * 60 * 60 * 24)
    : Infinity;

  if (daysSinceWork > STALL_THRESHOLD_DAYS) {
    const daysStr = daysSinceWork === Infinity
      ? 'no recorded work'
      : `${Math.floor(daysSinceWork)} days`;

    return {
      check: 'closure-progress',
      evidence: `${completed}/${total} conditions met, ${daysStr} since last work`,
    };
  }

  return null;
}
