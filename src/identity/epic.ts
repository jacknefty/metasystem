/**
 * Epic — Major outcome grouping within a Hub
 *
 * Epics are created by PM during decomposition.
 * They contain Stories (the bounty level).
 */

import { randomUUID } from 'crypto';
import { getChain } from '../coordination/channels/chain.js';
import { dao } from './scoped-paths.js';
import { scaffoldScope } from './scaffold.js';

export interface CreateEpicInput {
  name: string;
  outcome: string;
  hubId: string;
}

function generateEpicId(): string {
  return `epic_${randomUUID().slice(0, 8)}`;
}

export async function createEpic(input: CreateEpicInput): Promise<string> {
  const id = generateEpicId();
  const hubScope = dao.hub(input.hubId);
  const epicScope = hubScope.epic(id);
  const scopePath = epicScope.root();
  const parentPath = hubScope.root();

  scaffoldScope(scopePath, {
    type: 'epic',
    id,
    name: input.name,
    purpose: input.outcome,
    parentId: input.hubId,
    parentType: 'hub',
  });

  await getChain().append('epic:created', 'system', id, {
    name: input.name,
    outcome: input.outcome,
    hubId: input.hubId,
    scopePath,
    parentPath,
  });

  return id;
}

export async function completeEpic(id: string): Promise<void> {
  await getChain().append('epic:completed', 'system', id, {
    completedAt: Date.now(),
  });
}
