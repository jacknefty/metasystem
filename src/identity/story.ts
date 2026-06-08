/**
 * Story — The bounty level (contract boundary)
 *
 * Stories are created by PM, claimed by agents, and verified by the system.
 * Story.conditions = the external contract.
 * Tasks are the agent's internal decomposition.
 */

import { randomUUID } from 'crypto';
import { getChain } from '../coordination/channels/chain.js';
import { dao } from './scoped-paths.js';
import { scaffoldScope } from './scaffold.js';
import { updateScopeProgress } from './contract.js';
import type { Condition, Bounty } from '../coordination/channels/events.js';

export interface CreateStoryInput {
  name: string;
  outcome: string;
  epicId: string;
  hubId: string;
  conditions: Condition[];
  leverage?: number;
  uncertainty?: number;
  dependsOn?: string[];
  coupledTo?: string[];
}

function generateStoryId(): string {
  return `story_${randomUUID().slice(0, 8)}`;
}

export async function createStory(input: CreateStoryInput): Promise<string> {
  const id = generateStoryId();
  const epicScope = dao.hub(input.hubId).epic(input.epicId);
  const storyScope = epicScope.story(id);
  const scopePath = storyScope.root();
  const parentPath = epicScope.root();

  scaffoldScope(scopePath, {
    type: 'story',
    id,
    name: input.name,
    purpose: input.outcome,
    parentId: input.epicId,
    parentType: 'epic',
    conditions: input.conditions,
  });

  await getChain().append('story:created', 'system', id, {
    name: input.name,
    outcome: input.outcome,
    epicId: input.epicId,
    hubId: input.hubId,
    conditions: input.conditions,
    leverage: input.leverage,
    uncertainty: input.uncertainty,
    dependsOn: input.dependsOn || [],
    coupledTo: input.coupledTo || [],
    scopePath,
    parentPath,
  });

  return id;
}

export async function postStoryBounty(
  storyId: string,
  amount: number = 100,
  expiresIn: number = 7 * 24 * 60 * 60 * 1000
): Promise<void> {
  const bounty: Bounty = {
    amount,
    currency: 'variety',
    postedAt: Date.now(),
    expiresAt: Date.now() + expiresIn,
  };

  await getChain().append('story:posted', 'system', storyId, {
    bounty,
  });
}

export async function claimStory(
  storyId: string,
  nodeId: string,
  deadlineMs: number = 4 * 60 * 60 * 1000
): Promise<void> {
  await getChain().append('story:claimed', nodeId, storyId, {
    nodeId,
    claimedAt: Date.now(),
    deadline: Date.now() + deadlineMs,
  });
}

export async function submitStory(storyId: string, branch: string): Promise<void> {
  await getChain().append('story:submitted', 'system', storyId, {
    branch,
    submittedAt: Date.now(),
  });
}

export async function verifyStory(
  storyId: string,
  epicId: string,
  hubId: string,
  results: Array<{ conditionId: string; description: string; passed: boolean; evidence: string }>
): Promise<void> {
  const passed = results.every(r => r.passed);

  // Update identity.md with verification results
  const storyScope = dao.hub(hubId).epic(epicId).story(storyId);
  updateScopeProgress(storyScope, {
    conditionResults: results.map(r => ({ description: r.description, passed: r.passed })),
    status: passed ? 'completed' : 'active',
  });

  await getChain().append('story:verified', 'system', storyId, {
    passed,
    results,
    verifiedAt: Date.now(),
  });
}

export async function completeStory(
  storyId: string,
  epicId: string,
  hubId: string,
  success: boolean
): Promise<void> {
  // Update identity.md status
  const storyScope = dao.hub(hubId).epic(epicId).story(storyId);
  updateScopeProgress(storyScope, {
    status: success ? 'completed' : 'failed',
  });

  await getChain().append('story:completed', 'system', storyId, {
    success,
    completedAt: Date.now(),
  });
}
