/**
 * Delegation — Liquid democracy at any scope
 *
 * Nodes can delegate their voting power to other nodes.
 * Delegations can be scoped (context-specific) or global.
 */

import type { Scope } from '../../control/dynamics/types.js';
import { getChain } from '../channels/chain.js';

export interface Delegation {
  from: string;
  to: string;
  scope: Scope | null;
  weight: number;
  createdAt: number;
}

export async function delegate(
  from: string,
  to: string,
  scope: Scope | null = null,
  weight: number = 1.0
): Promise<void> {
  if (from === to) {
    throw new Error('Cannot delegate to self');
  }

  if (weight <= 0 || weight > 1) {
    throw new Error('Weight must be between 0 and 1');
  }

  const existing = await getDelegations(from);
  const totalWeight = existing
    .filter(d => d.to !== to || !scopesMatch(d.scope, scope))
    .reduce((sum, d) => sum + d.weight, 0);

  if (totalWeight + weight > 1) {
    throw new Error('Total delegation weight cannot exceed 1');
  }

  const delegation: Delegation = {
    from,
    to,
    scope,
    weight,
    createdAt: Date.now(),
  };

  await getChain().append(
    'delegation:created',
    from,
    to,
    delegation as unknown as import('../channels/events.js').EventPayloads['delegation:created']
  );
}

export async function revoke(
  from: string,
  to: string,
  scope: Scope | null = null
): Promise<void> {
  await getChain().append(
    'delegation:revoked',
    from,
    to,
    { scope: scope as import('../channels/events.js').EventPayloads['delegation:revoked']['scope'] }
  );
}

export async function getDelegations(identity: string): Promise<Delegation[]> {
  const created = await getChain().recall({
    type: 'delegation:created',
    emitter: identity,
  });

  const revoked = await getChain().recall({
    type: 'delegation:revoked',
    emitter: identity,
  });

  const revokedSet = new Set(
    revoked.map(r => {
      const p = r.payload as { scope: Scope | null };
      return `${r.subject}:${scopeKey(p.scope)}`;
    })
  );

  return created
    .map(e => e.payload as unknown as Delegation)
    .filter(d => !revokedSet.has(`${d.to}:${scopeKey(d.scope)}`));
}

export async function getDelegators(identity: string): Promise<Delegation[]> {
  const events = await getChain().recall({
    type: 'delegation:created',
    subject: identity,
  });

  const delegations = events.map(e => e.payload as unknown as Delegation);
  const active: Delegation[] = [];

  for (const d of delegations) {
    const stillActive = await isDelegationActive(d);
    if (stillActive) {
      active.push(d);
    }
  }

  return active;
}

async function isDelegationActive(delegation: Delegation): Promise<boolean> {
  const revoked = await getChain().recall({
    type: 'delegation:revoked',
    emitter: delegation.from,
    subject: delegation.to,
  });

  return !revoked.some(r => {
    const p = r.payload as { scope: Scope | null };
    return scopesMatch(p.scope, delegation.scope);
  });
}

export async function getEffectiveWeight(
  identity: string,
  scope: Scope
): Promise<number> {
  const delegators = await getDelegators(identity);

  const relevant = delegators.filter(d =>
    d.scope === null || scopesMatch(d.scope, scope)
  );

  return relevant.reduce((sum, d) => sum + d.weight, 1.0);
}

function scopesMatch(a: Scope | null, b: Scope | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;

  if (a.level !== b.level) return false;

  if ('id' in a && 'id' in b) return a.id === b.id;
  if ('address' in a && 'address' in b) return a.address === b.address;

  return a.level === 'network' && b.level === 'network';
}

function scopeKey(scope: Scope | null): string {
  if (scope === null) return 'global';
  if ('id' in scope) return `${scope.level}:${scope.id}`;
  if ('address' in scope) return `${scope.level}:${scope.address}`;
  return scope.level;
}
