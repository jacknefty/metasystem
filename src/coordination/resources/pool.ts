/**
 * Coordination — Pool, Claims, Reputation (S2)
 *
 * Manages work distribution, claim rules, and reputation tracking.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { listWork, listAvailableWork } from '../../coordination/resources/work.js';
import type { DerivedWork } from '../../coordination/resources/derive.js';
import { getNode, listNodes, DEFAULT_SETTINGS } from '../../identity/node.js';

export interface PooledWork {
  work: DerivedWork;
  claimable: boolean;
  blockedBy: string[];
}

export interface PoolStats {
  total: number;
  claimable: number;
  claimed: number;
  blocked: number;
  totalBountyValue: number;
}

export interface ClaimabilityResult {
  claimable: boolean;
  reasons: string[];
}

export interface NodeReputation {
  nodeId: string;
  completedCount: number;
  releasedCount: number;
  failedCount: number;
  totalEarned: number;
  completionRate: number;
  maxConcurrentClaims: number;
}

export async function getBountyPool(): Promise<PooledWork[]> {
  const allWork = await listWork({});
  const posted = allWork.filter(w => w.bountyStatus === 'posted' || w.status === 'active');

  const result: PooledWork[] = [];

  for (const work of posted) {
    const blockedBy: string[] = [];

    for (const depId of work.dependsOn) {
      const dep = allWork.find(w => w.id === depId);
      if (!dep || dep.status !== 'fulfilled') {
        blockedBy.push(depId);
      }
    }

    result.push({
      work,
      claimable: blockedBy.length === 0 && !work.claim,
      blockedBy,
    });
  }

  return result;
}

export async function getPoolStats(): Promise<PoolStats> {
  const pool = await getBountyPool();

  return {
    total: pool.length,
    claimable: pool.filter(p => p.claimable).length,
    claimed: pool.filter(p => p.work.claim).length,
    blocked: pool.filter(p => p.blockedBy.length > 0).length,
    totalBountyValue: pool.reduce((sum, p) => sum + (p.work.bounty?.amount ?? 0), 0),
  };
}

export async function checkClaimability(
  workId: string,
  nodeId: string
): Promise<ClaimabilityResult> {
  const reasons: string[] = [];

  const allWork = await listWork({});
  const work = allWork.find(w => w.id === workId);

  if (!work) {
    return { claimable: false, reasons: ['Work not found'] };
  }

  if (work.bountyStatus !== 'posted') {
    reasons.push(`Work status is ${work.bountyStatus}, not posted`);
  }

  if (work.claim) {
    reasons.push(`Already claimed by ${work.claim.nodeId}`);
  }

  for (const depId of work.dependsOn) {
    const dep = allWork.find(w => w.id === depId);
    if (!dep || dep.status !== 'fulfilled') {
      reasons.push(`Dependency ${depId} not fulfilled`);
    }
  }

  const node = await getNode(nodeId);
  if (!node) {
    reasons.push('Node not found');
  } else {
    const available = node.settings.availableForWork ?? DEFAULT_SETTINGS.availableForWork;
    if (!available) {
      reasons.push('Node not available for work');
    }

    const reputation = await getReputation(nodeId);
    const currentClaims = await getNodeClaims(nodeId);

    if (currentClaims.length >= reputation.maxConcurrentClaims) {
      reasons.push(`At claim capacity (${currentClaims.length}/${reputation.maxConcurrentClaims})`);
    }
  }

  return {
    claimable: reasons.length === 0,
    reasons,
  };
}

export async function findClaimableWork(nodeId: string): Promise<PooledWork[]> {
  const pool = await getBountyPool();
  const result: PooledWork[] = [];

  for (const item of pool) {
    if (!item.claimable) continue;

    const { claimable } = await checkClaimability(item.work.id, nodeId);
    if (claimable) {
      result.push(item);
    }
  }

  return result;
}

export async function getReputation(nodeId: string): Promise<NodeReputation> {
  const events = await getChain().recall({});

  let completedCount = 0;
  let releasedCount = 0;
  let failedCount = 0;
  let totalEarned = 0;

  for (const event of events) {
    if (event.type === 'work:completed') {
      const p = event.payload as { nodeId: string; bountyAmount: number };
      if (p.nodeId === nodeId) {
        completedCount++;
        totalEarned += p.bountyAmount;
      }
    } else if (event.type === 'work:released') {
      const p = event.payload as { nodeId: string };
      if (p.nodeId === nodeId) {
        releasedCount++;
      }
    } else if (event.type === 'work:failed') {
      const allWork = await listWork({});
      const work = allWork.find(w => w.id === event.subject);
      if (work?.claim?.nodeId === nodeId) {
        failedCount++;
      }
    }
  }

  const total = completedCount + releasedCount + failedCount;
  const completionRate = total === 0 ? 1.0 : completedCount / total;

  let maxConcurrentClaims = 1;
  if (completionRate >= 0.9) maxConcurrentClaims = 3;
  else if (completionRate >= 0.7) maxConcurrentClaims = 2;

  return {
    nodeId,
    completedCount,
    releasedCount,
    failedCount,
    totalEarned,
    completionRate,
    maxConcurrentClaims,
  };
}

export async function getNodeClaims(nodeId: string): Promise<DerivedWork[]> {
  const allWork = await listWork({});
  return allWork.filter(w =>
    w.claim?.nodeId === nodeId &&
    (w.bountyStatus === 'claimed' || w.bountyStatus === 'submitted')
  );
}
