/**
 * Membership — Nodes joining and leaving hubs
 *
 * A "hub" is a project/DAO container that other nodes can be members of.
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
  hubId: string;
  role?: string;
  joinedAt: number;
}

export async function joinHub(
  nodeId: string,
  hubId: string,
  role?: string
): Promise<void> {
  const chain = getChain();
  const events = await chain.recall({});
  const nodes = deriveAllNodes(events);

  if (!nodes.has(nodeId)) {
    throw new Error(`Node ${nodeId} not found`);
  }
  if (!nodes.has(hubId)) {
    throw new Error(`Hub ${hubId} not found`);
  }

  if (await isMember(nodeId, hubId)) {
    throw new Error(`${nodeId} is already a member of ${hubId}`);
  }

  await chain.append('membership:joined', nodeId, nodeId, {
    hub: hubId,
    role,
  });
}

export async function leaveHub(
  nodeId: string,
  hubId: string,
  reason?: string
): Promise<void> {
  if (!(await isMember(nodeId, hubId))) {
    throw new Error(`${nodeId} is not a member of ${hubId}`);
  }

  await getChain().append('membership:left', nodeId, nodeId, {
    hub: hubId,
    reason,
  });
}

export async function getMembers(hubId: string): Promise<MemberInfo[]> {
  const events = await getChain().recall({});
  const nodes = deriveAllNodes(events);
  const members: MemberInfo[] = [];

  for (const [nodeId, node] of nodes) {
    const membership = node.memberships.find(m => m.hub === hubId);
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
    hubId: m.hub,
    role: m.role,
    joinedAt: m.joinedAt,
  }));
}

export async function isMember(
  nodeId: string,
  hubId: string
): Promise<boolean> {
  const memberships = await getMemberships(nodeId);
  return memberships.some(m => m.hubId === hubId);
}
