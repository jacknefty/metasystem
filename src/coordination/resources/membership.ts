/**
 * Membership — Nodes joining and leaving contexts
 *
 * A "context" is just another node that other nodes can be members of.
 * This is how recursion works — projects have members, swarms have members.
 */

import { getChain } from '../channels/chain.js';
import { deriveAllNodes } from './derive.js';

export interface MemberInfo {
  nodeId: string;
  role?: string;
  joinedAt: number;
}

export interface MembershipInfo {
  contextId: string;
  role?: string;
  joinedAt: number;
}

export async function joinContext(
  nodeId: string,
  contextId: string,
  role?: string
): Promise<void> {
  const chain = getChain();
  const events = await chain.recall({});
  const nodes = deriveAllNodes(events);

  if (!nodes.has(nodeId)) {
    throw new Error(`Node ${nodeId} not found`);
  }
  if (!nodes.has(contextId)) {
    throw new Error(`Context ${contextId} not found`);
  }

  if (await isMember(nodeId, contextId)) {
    throw new Error(`${nodeId} is already a member of ${contextId}`);
  }

  await chain.append('membership:joined', nodeId, nodeId, {
    context: contextId,
    role,
  });
}

export async function leaveContext(
  nodeId: string,
  contextId: string,
  reason?: string
): Promise<void> {
  if (!(await isMember(nodeId, contextId))) {
    throw new Error(`${nodeId} is not a member of ${contextId}`);
  }

  await getChain().append('membership:left', nodeId, nodeId, {
    context: contextId,
    reason,
  });
}

export async function getMembers(contextId: string): Promise<MemberInfo[]> {
  const events = await getChain().recall({});
  const nodes = deriveAllNodes(events);
  const members: MemberInfo[] = [];

  for (const [nodeId, node] of nodes) {
    const membership = node.memberships.find(m => m.context === contextId);
    if (membership) {
      members.push({
        nodeId,
        role: membership.role,
        joinedAt: membership.joinedAt,
      });
    }
  }

  return members;
}

export async function getMemberships(nodeId: string): Promise<MembershipInfo[]> {
  const events = await getChain().recall({});
  const nodes = deriveAllNodes(events);
  const node = nodes.get(nodeId);

  if (!node) return [];

  return node.memberships.map(m => ({
    contextId: m.context,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

export async function isMember(
  nodeId: string,
  contextId: string
): Promise<boolean> {
  const memberships = await getMemberships(nodeId);
  return memberships.some(m => m.contextId === contextId);
}
