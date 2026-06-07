/**
 * Voting Power — Stake, reputation, dynamics at scope
 *
 * Eligible voters determined by membership events on chain.
 * Contribution is credits earned within the scope's path prefix.
 */

import type { Scope } from '../../control/dynamics/types.js';
import { scopeId } from '../../control/dynamics/types.js';
import { parent as getParentScope } from '../../identity/scoped-paths.js';
import type { VotingPower } from './types.js';
import { getChain } from '../channels/chain.js';
import { getReputation } from '../resources/pool.js';
import { getAggregatePrecision, getDynamicsState } from '../../control/dynamics/index.js';
import { loadIdentityAtScope } from '../../identity/contract.js';

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

/**
 * Get eligible voters for a scope.
 * Strategy: find all nodes that have earned credits within this scope's path.
 */
async function getEligibleVoters(scope: Scope): Promise<string[]> {
  const scopePath = scope.root();

  // Query credit events that match this scope or are within it
  const events = await getChain().recall({ type: 'credit:earned' });

  const voters = new Set<string>();

  for (const e of events) {
    const payload = e.payload as { scopePath?: string; nodeId?: string };

    // Match if credit is at or within this scope
    if (payload.scopePath?.startsWith(scopePath)) {
      if (payload.nodeId) {
        voters.add(payload.nodeId);
      } else {
        voters.add(e.subject);
      }
    } else if (!payload.scopePath) {
      // Legacy event without scopePath — include at root scope
      voters.add(e.subject);
    }
  }

  // Also include membership events for this scope
  const memberEvents = await getChain().recall({ type: 'membership:joined' });
  for (const e of memberEvents) {
    const payload = e.payload as { hub?: string; scopePath?: string };
    const id = scopeId(scope);

    if (payload.scopePath?.startsWith(scopePath) || payload.hub === id) {
      voters.add(e.subject);
    }
  }

  return Array.from(voters);
}

/**
 * Get contribution (credits earned) for an identity within a scope.
 */
async function getContribution(identity: string, scope: Scope): Promise<number> {
  const events = await getChain().recall({ subject: identity, type: 'credit:earned' });
  const scopePath = scope.root();

  const earned = events
    .filter(e => {
      const payload = e.payload as { scopePath?: string };
      // Match if scopePath is within this scope
      if (payload.scopePath) {
        return payload.scopePath.startsWith(scopePath);
      }
      // Legacy: include all if at root, otherwise exclude
      return scopePath === require('../../identity/scoped-paths.js').dao.root();
    })
    .reduce((sum, e) => {
      const p = e.payload as { bits?: number };
      return sum + (p.bits ?? 0);
    }, 0);

  return earned;
}

async function computeτ(identity: string, scope: Scope): Promise<number> {
  const τ_aggregate = await getAggregatePrecision(scope);
  const reputation = await getReputation(identity);
  const completionRate = reputation.completionRate;

  return 0.5 * τ_aggregate + 0.5 * completionRate;
}

/**
 * Get resources at a scope.
 * Reads from identity.md if present, otherwise sums credits.
 */
export async function getResourcesAtScope(scope: Scope): Promise<number> {
  // Try to read from identity at this scope
  const identity = loadIdentityAtScope(scope);
  if (identity?.resources['Budget']) {
    const budget = parseFloat(identity.resources['Budget']);
    if (!isNaN(budget)) return budget;
  }

  // Fall back to summing credits earned at this scope
  const events = await getChain().recall({ type: 'credit:earned' });
  const scopePath = scope.root();

  return events
    .filter(e => {
      const p = e.payload as { scopePath?: string };
      return !p.scopePath || p.scopePath.startsWith(scopePath);
    })
    .reduce((sum, e) => {
      const p = e.payload as { bits?: number };
      return sum + (p.bits ?? 0);
    }, 0);
}
