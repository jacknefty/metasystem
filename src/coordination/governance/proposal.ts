/**
 * Proposal — Create and manage proposals at any scope
 *
 * Same logic at DAO, context, node levels.
 */

import { randomUUID } from 'crypto';
import type { Scope } from '../../control/dynamics/types.js';
import type { Proposal, ProposalType, ProposalStatus, ProposalFilter } from './types.js';
import { DEFAULT_VOTING_PERIODS } from './types.js';
import { getChain } from '../channels/chain.js';
import { checkApproval } from './threshold.js';
import { loadIdentity } from '../../identity/contract.js';
import { createContext } from '../../identity/context.js';
import { createWork, postBounty, claimWork as claimWorkFromPool } from '../resources/work.js';
import { autoVote } from './vote.js';
import { getVotersAtScope } from './power.js';
import { getNode } from '../../identity/node.js';

export interface CreateProposalInput {
  type: ProposalType;
  scope: Scope;
  proposer: string;
  target: string;
  resourcesRequested: number;
}

function getScopeId(scope: Scope): string {
  if ('id' in scope) return scope.id;
  if ('address' in scope) return scope.address;
  return 'network';
}

export async function createProposal(input: CreateProposalInput): Promise<string> {
  const id = `prop_${randomUUID().slice(0, 8)}`;
  const votingPeriod = getVotingPeriod(input.scope);

  const proposal: Proposal = {
    id,
    type: input.type,
    scope: input.scope,
    proposer: input.proposer,
    target: input.target,
    resourcesRequested: input.resourcesRequested,
    deadline: Date.now() + votingPeriod,
    status: 'open',
    createdAt: Date.now(),
  };

  await getChain().append(
    'proposal:created',
    input.proposer,
    id,
    proposal as unknown as import('../channels/events.js').EventPayloads['proposal:created']
  );

  triggerAutoVoting(proposal);

  return id;
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const events = await getChain().recall({ type: 'proposal:created' });
  const event = events.find(e => e.subject === id);

  if (!event) return null;

  const proposal = event.payload as unknown as Proposal;
  return await refreshStatus(proposal);
}

export async function listProposals(filter?: ProposalFilter): Promise<Proposal[]> {
  const events = await getChain().recall({ type: 'proposal:created' });
  let proposals = events.map(e => e.payload as unknown as Proposal);

  if (filter?.scope) {
    const filterId = getScopeId(filter.scope);
    proposals = proposals.filter(p =>
      p.scope.level === filter.scope!.level && getScopeId(p.scope) === filterId
    );
  }

  if (filter?.status) {
    proposals = proposals.filter(p => p.status === filter.status);
  }

  if (filter?.type) {
    proposals = proposals.filter(p => p.type === filter.type);
  }

  if (filter?.proposer) {
    proposals = proposals.filter(p => p.proposer === filter.proposer);
  }

  const refreshed: Proposal[] = [];
  for (const p of proposals) {
    refreshed.push(await refreshStatus(p));
  }

  return refreshed;
}

async function refreshStatus(proposal: Proposal): Promise<Proposal> {
  if (proposal.status !== 'open') {
    return proposal;
  }

  const now = Date.now();
  if (now >= proposal.deadline) {
    const result = await checkApproval(proposal);
    const newStatus: ProposalStatus = result.passed ? 'passed' : 'rejected';

    await updateStatus(proposal.id, newStatus);
    proposal.status = newStatus;

    if (newStatus === 'passed') {
      await executeProposal(proposal);
    }
  }

  return proposal;
}

async function updateStatus(id: string, status: ProposalStatus): Promise<void> {
  await getChain().append('proposal:status', 'system', id, { status });
}

async function executeProposal(proposal: Proposal): Promise<void> {
  try {
    switch (proposal.type) {
      case 'context': {
        const input = JSON.parse(proposal.target);
        await createContext(input);
        break;
      }
      case 'work': {
        const input = JSON.parse(proposal.target);
        const workId = await createWork(input);
        await postBounty(workId, proposal.resourcesRequested);
        break;
      }
      case 'claim': {
        await claimWorkFromPool(proposal.target, proposal.proposer);
        break;
      }
      case 'amendment': {
        await applyAmendment(getScopeId(proposal.scope), JSON.parse(proposal.target));
        break;
      }
    }

    await getChain().append('proposal:executed', 'system', proposal.id, { success: true });
  } catch (error) {
    await getChain().append('proposal:executed', 'system', proposal.id, {
      success: false,
      error: String(error),
    });
  }
}

async function applyAmendment(
  identityId: string,
  changes: Record<string, unknown>
): Promise<void> {
  await getChain().append('identity:amended', 'system', identityId, changes);
}

function getVotingPeriod(scope: Scope): number {
  const defaultPeriod = DEFAULT_VOTING_PERIODS[scope.level];

  if (scope.level === 'node' || scope.level === 'work' || scope.level === 'condition') {
    return defaultPeriod;
  }

  if (!('id' in scope)) {
    return defaultPeriod;
  }

  const identity = loadIdentity(scope.id);
  if (!identity) return defaultPeriod;

  const override = identity.resources['VotingPeriod'];
  if (override) {
    const parsed = parseDuration(override);
    if (parsed > 0) return parsed;
  }

  return defaultPeriod;
}

function parseDuration(str: string): number {
  const match = str.match(/^(\d+)\s*(d|h|m|s)?$/i);
  if (!match) return 0;

  const value = parseInt(match[1], 10);
  const unit = (match[2] ?? 'd').toLowerCase();

  switch (unit) {
    case 'd': return value * 24 * 60 * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'm': return value * 60 * 1000;
    case 's': return value * 1000;
    default: return value * 24 * 60 * 60 * 1000;
  }
}

async function triggerAutoVoting(proposal: Proposal): Promise<void> {
  const voters = await getVotersAtScope(proposal.scope);

  for (const voter of voters) {
    try {
      const node = await getNode(voter.identity);
      if (node?.settings.autonomyLevel === 'autonomous') {
        autoVote(voter.identity, proposal.id).catch(() => {});
      }
    } catch {
      // Skip voters without settings
    }
  }
}

export async function finalizeProposal(id: string): Promise<Proposal | null> {
  const proposal = await getProposal(id);
  if (!proposal) return null;

  if (proposal.status !== 'open') {
    return proposal;
  }

  const result = await checkApproval(proposal);
  const newStatus: ProposalStatus = result.passed ? 'passed' : 'rejected';

  await updateStatus(id, newStatus);
  proposal.status = newStatus;

  if (newStatus === 'passed') {
    await executeProposal(proposal);
  }

  return proposal;
}
