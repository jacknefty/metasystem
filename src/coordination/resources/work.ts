/**
 * Work Lifecycle
 *
 * Full lifecycle: create → post → claim → submit → verify → complete.
 * Also handles release, expiry, failure.
 */

import { randomUUID } from 'crypto';
import { getChain } from '../channels/chain.js';
import { deriveAllWork, deriveWork, deriveAllNodes, type DerivedWork, type WorkStatus } from './derive.js';
import { emitPerceived } from './variety.js';
import type { Condition } from '../channels/events.js';
import { resolveContextSettings, checkAutonomy } from '../../identity/node.js';
import { getDefaultDAO, type DAOAddress } from '../../network/registry.js';

export interface CreateWorkInput {
  name: string;
  contextId: string;
  contextPath?: string;
  ownerId: string;
  conditions: Condition[];
  dependsOn?: string[];
  daoAddress?: DAOAddress;  // defaults to first registered DAO
}

export interface WorkFilter {
  contextId?: string;
  status?: WorkStatus;
  ownerId?: string;
  claimedBy?: string;
}

export type ReleaseReason = 'quit' | 'timeout' | 'blocked' | 'max_attempts';

export interface WorkGraphNode {
  id: string;
  name: string;
  status: WorkStatus;
  dependencyCount: number;
  dependentCount: number;
}

export interface WorkGraphEdge {
  from: string;
  to: string;
}

export interface WorkGraph {
  nodes: WorkGraphNode[];
  edges: WorkGraphEdge[];
  leveragePoint?: string;
  stats: {
    total: number;
    fulfilled: number;
    active: number;
    blocked: number;
  };
}

function generateWorkId(): string {
  return `work_${randomUUID().slice(0, 8)}`;
}

export async function createWork(input: CreateWorkInput): Promise<string> {
  const chain = getChain();
  const workId = generateWorkId();

  let contextPath = input.contextPath;
  if (!contextPath) {
    const events = await chain.recall({ subject: input.contextId });
    const nodes = deriveAllNodes(events);
    const context = nodes.get(input.contextId);
    contextPath = context?.settings.path;
  }

  // Default to first registered DAO
  const daoAddress = input.daoAddress ?? getDefaultDAO()?.address;

  await chain.append('work:created', input.ownerId, workId, {
    name: input.name,
    contextId: input.contextId,
    contextPath,
    conditions: input.conditions,
    dependsOn: input.dependsOn,
    daoAddress,
  });

  return workId;
}

export async function postBounty(
  workId: string,
  amount?: number,
  expiresAt?: number
): Promise<void> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);

  const bountyAmount = amount ?? work.conditions.reduce(
    (sum, c) => sum + (c.varietyWeight ?? 10),
    0
  );

  await getChain().append('work:posted', work.ownerId, workId, {
    bounty: {
      amount: bountyAmount,
      currency: 'variety',
      postedAt: Date.now(),
      expiresAt,
    },
  });

  // Emit perceived variety — work posted = uncertainty perceived
  await emitPerceived(work.ownerId, workId, bountyAmount, 'work posted');
}

export async function getActiveWorkCount(nodeId: string): Promise<number> {
  const allWork = await listWork({});
  return allWork.filter(w =>
    w.claim?.nodeId === nodeId &&
    (w.status === 'executing' || w.bountyStatus === 'claimed')
  ).length;
}

export async function claimWork(
  workId: string,
  nodeId: string,
  deadlineMs: number = 4 * 60 * 60 * 1000
): Promise<void> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);

  if (work.bountyStatus !== 'posted') {
    throw new Error(`Work ${workId} is not available (status: ${work.bountyStatus})`);
  }

  if (work.claim) {
    throw new Error(`Work ${workId} is already claimed by ${work.claim.nodeId}`);
  }

  // S5 policy checks
  const settings = await resolveContextSettings(nodeId);

  // Check autonomy level
  const isNetwork = !!(work as { networkOrigin?: unknown }).networkOrigin;
  const action = isNetwork ? 'network' : 'claim';
  const autonomy = checkAutonomy(settings.autonomyLevel, action);
  if (!autonomy.allowed) {
    throw new Error(`Node ${nodeId} is locked — cannot claim work`);
  }

  // Check concurrent work limit
  if (settings.maxConcurrentWork > 0) {
    const activeCount = await getActiveWorkCount(nodeId);
    if (activeCount >= settings.maxConcurrentWork) {
      throw new Error(`Node ${nodeId} at max concurrent work (${settings.maxConcurrentWork})`);
    }
  }

  // Check min bounty for network work
  if (isNetwork && work.bounty?.amount !== undefined) {
    if (work.bounty.amount < settings.minBounty) {
      throw new Error(`Bounty ${work.bounty.amount} below minimum ${settings.minBounty}`);
    }
  }

  // Check dependencies
  if (work.dependsOn.length > 0) {
    const allWork = await listWork({});
    for (const depId of work.dependsOn) {
      const dep = allWork.find(w => w.id === depId);
      if (!dep || dep.status !== 'fulfilled') {
        throw new Error(`Dependency ${depId} not fulfilled`);
      }
    }
  }

  const now = Date.now();
  await getChain().append('work:claimed', nodeId, workId, {
    nodeId,
    claimedAt: now,
    deadline: now + deadlineMs,
  });
}

export async function releaseWork(
  workId: string,
  reason: ReleaseReason
): Promise<void> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);
  if (!work.claim) throw new Error(`Work ${workId} is not claimed`);

  await getChain().append('work:released', work.claim.nodeId, workId, {
    nodeId: work.claim.nodeId,
    reason,
  });
}

export async function submitWork(
  workId: string,
  branch: string
): Promise<void> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);
  if (!work.claim) throw new Error(`Work ${workId} is not claimed`);

  await getChain().append('work:submitted', work.claim.nodeId, workId, {
    nodeId: work.claim.nodeId,
    branch,
    submittedAt: Date.now(),
  });
}

export async function verifyWork(
  workId: string,
  passed: boolean,
  confidence: number,
  evidence: string
): Promise<void> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);

  await getChain().append('work:verified', 'system', workId, {
    passed,
    confidence,
    evidence,
    verifiedAt: Date.now(),
  });
}

export async function completeWork(workId: string): Promise<void> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);
  if (!work.claim) throw new Error(`Work ${workId} has no claim`);

  await getChain().append('work:completed', 'system', workId, {
    nodeId: work.claim.nodeId,
    bountyAmount: work.bounty?.amount ?? 0,
    completedAt: Date.now(),
  });

  runVerificationAsync(workId, work.claim.nodeId);
}

function runVerificationAsync(workId: string, nodeId: string): void {
  import('../../control/verify/completion.js').then(({ verifyCompletion }) => {
    verifyCompletion(workId, nodeId).catch(() => {});
  }).catch(() => {});
}

export async function failWork(workId: string, reason: string): Promise<void> {
  await getChain().append('work:failed', 'system', workId, { reason });
}

export async function expireWork(workId: string): Promise<void> {
  await getChain().append('work:expired', 'system', workId, {
    expiredAt: Date.now(),
  });
}

export async function markConditionMet(
  workId: string,
  conditionId: string,
  evidence: string
): Promise<void> {
  await getChain().append('condition:met', 'system', workId, {
    conditionId,
    evidence,
  });
}

export async function updateConditionConfidence(
  workId: string,
  conditionId: string,
  confidence: number,
  evidence: string
): Promise<void> {
  await getChain().append('condition:confidence', 'system', workId, {
    conditionId,
    confidence,
    evidence,
  });
}

export async function getWork(workId: string): Promise<DerivedWork | null> {
  const events = await getChain().recall({ subject: workId });
  return deriveWork(events);
}

export async function listWork(filter?: WorkFilter): Promise<DerivedWork[]> {
  const events = await getChain().recall({});
  const allWork = deriveAllWork(events);
  let results = Array.from(allWork.values());

  if (filter?.contextId) {
    results = results.filter(w => w.contextId === filter.contextId);
  }
  if (filter?.status) {
    results = results.filter(w => w.status === filter.status);
  }
  if (filter?.ownerId) {
    results = results.filter(w => w.ownerId === filter.ownerId);
  }
  if (filter?.claimedBy) {
    results = results.filter(w => w.claim?.nodeId === filter.claimedBy);
  }

  return results;
}

export async function listAvailableWork(contextId?: string): Promise<DerivedWork[]> {
  const work = await listWork({ contextId });
  return work.filter(w =>
    w.bountyStatus === 'posted' &&
    !w.claim &&
    w.dependsOn.length === 0
  );
}

export async function getWorkGraph(contextId: string): Promise<WorkGraph & { stats: { pending: number; complete: number; varietyTotal: number; varietyResolved: number; progress: number } }> {
  const work = await listWork({ contextId });

  const dependentCounts = new Map<string, number>();
  const edges: WorkGraphEdge[] = [];

  const workIds = new Set(work.map(w => w.id));
  for (const w of work) {
    for (const depId of w.dependsOn) {
      // Only create edge if dependency exists in this context
      if (workIds.has(depId)) {
        edges.push({ from: depId, to: w.id });
        dependentCounts.set(depId, (dependentCounts.get(depId) ?? 0) + 1);
      }
    }
  }

  const nodes = work.map(w => {
    const varietyTotal = w.conditions.reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);
    const varietyResolved = w.conditions.filter(c => c.met).reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);

    return {
      id: w.id,
      name: w.name,
      status: w.status,
      dependsOn: w.dependsOn,
      dependencyCount: w.dependsOn.length,
      dependentCount: dependentCounts.get(w.id) ?? 0,
      conditions: w.conditions,
      executorId: w.claim?.nodeId,
      varietyTotal,
      varietyResolved,
      leverage: 5,
      uncertainty: 5,
    };
  });

  let leveragePoint: string | undefined;
  let maxDependents = 0;
  for (const node of nodes) {
    if (node.dependentCount > maxDependents && node.status !== 'fulfilled') {
      maxDependents = node.dependentCount;
      leveragePoint = node.id;
    }
  }

  const fulfilled = work.filter(w => w.status === 'fulfilled').length;
  const active = work.filter(w => w.status === 'active' || w.status === 'executing').length;
  const pending = work.filter(w => w.status === 'pending' || w.status === 'blocked').length;
  const varietyTotal = nodes.reduce((sum, n) => sum + n.varietyTotal, 0);
  const varietyResolved = nodes.reduce((sum, n) => sum + n.varietyResolved, 0);
  const progress = varietyTotal > 0 ? Math.round((varietyResolved / varietyTotal) * 100) : 0;

  const stats = {
    total: work.length,
    fulfilled,
    active,
    blocked: work.filter(w => w.status === 'blocked').length,
    pending,
    complete: fulfilled,
    varietyTotal,
    varietyResolved,
    progress,
  };

  return { nodes, edges, leveragePoint, stats };
}
