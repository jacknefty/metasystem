/**
 * Voting Power — Stake, reputation, dynamics at scope
 *
 * Same computation at every level.
 */

import type { Scope } from '../../control/dynamics/types.js';
import type { VotingPower } from './types.js';
import { getChain } from '../channels/chain.js';
import { getReputation } from '../resources/pool.js';
import { getAggregatePrecision, getDynamicsState } from '../../control/dynamics/index.js';
import { getMembers } from '../resources/membership.js';
import { loadIdentity } from '../../identity/contract.js';

export async function getVotingPower(
  identity: string,
  scope: Scope
): Promise<VotingPower> {
  const contribution = await getContribution(identity, scope);
  const τ = await computeτ(identity, scope);
  const state = await getDynamicsState(identity, scope);
  const β = state.β;

  return { identity, contribution, τ, β };
}

export async function getVotersAtScope(scope: Scope): Promise<VotingPower[]> {
  const identities = await getEligibleVoters(scope);
  const powers: VotingPower[] = [];

  for (const identity of identities) {
    const power = await getVotingPower(identity, scope);
    if (power.contribution > 0) {
      powers.push(power);
    }
  }

  return powers;
}

export async function getTotalContribution(scope: Scope): Promise<number> {
  const voters = await getVotersAtScope(scope);
  return voters.reduce((sum, v) => sum + v.contribution, 0);
}

async function getEligibleVoters(scope: Scope): Promise<string[]> {
  switch (scope.level) {
    case 'dao': {
      const events = await getChain().recall({ type: 'credit:earned' });
      const voters = new Set<string>();
      for (const e of events) {
        voters.add(e.subject);
      }
      return Array.from(voters);
    }
    case 'context': {
      const members = await getMembers(scope.id);
      return members.map(m => m.nodeId);
    }
    case 'node': {
      const identity = loadIdentity(scope.id);
      if (!identity?.frontmatter.memberships) return [scope.id];
      return identity.frontmatter.memberships
        .filter(m => m.context)
        .map(m => m.context);
    }
    case 'work': {
      if (scope.contextId) {
        const members = await getMembers(scope.contextId);
        return members.map(m => m.nodeId);
      }
      return [];
    }
    default:
      return [];
  }
}

async function getContribution(identity: string, scope: Scope): Promise<number> {
  const events = await getChain().recall({ subject: identity, type: 'credit:earned' });

  const earned = events
    .filter(e => matchesScope(e.payload as { contextId?: string; workId?: string }, scope))
    .reduce((sum, e) => {
      const p = e.payload as { bits?: number };
      return sum + (p.bits ?? 0);
    }, 0);

  return earned;
}

function matchesScope(
  payload: { contextId?: string; workId?: string },
  scope: Scope
): boolean {
  switch (scope.level) {
    case 'dao':
    case 'network':
      return true;
    case 'context':
      return payload.contextId === scope.id;
    case 'work':
      return payload.workId === scope.id;
    case 'node':
      return true;
    default:
      return true;
  }
}

async function computeτ(identity: string, scope: Scope): Promise<number> {
  const τ_aggregate = await getAggregatePrecision(scope);
  const reputation = await getReputation(identity);
  const completionRate = reputation.completionRate;

  return 0.5 * τ_aggregate + 0.5 * completionRate;
}

export async function getResourcesAtScope(scope: Scope): Promise<number> {
  switch (scope.level) {
    case 'dao':
    case 'network': {
      const events = await getChain().recall({ type: 'credit:earned' });
      return events.reduce((sum, e) => {
        const p = e.payload as { bits?: number };
        return sum + (p.bits ?? 0);
      }, 0);
    }
    case 'context': {
      const events = await getChain().recall({ subject: scope.id, type: 'context:created' });
      if (events.length > 0) {
        const p = events[0].payload as { resourcesRequested?: number };
        return p.resourcesRequested ?? 1000;
      }
      return 1000;
    }
    case 'node': {
      const identity = loadIdentity(scope.id);
      if (!identity?.frontmatter.memberships) return 1.0;
      return identity.frontmatter.memberships.reduce(
        (sum, m) => sum + (m.capacity ?? 1.0),
        0
      );
    }
    default:
      return 1000;
  }
}
