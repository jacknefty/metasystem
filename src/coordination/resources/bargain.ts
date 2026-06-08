/**
 * Bargain Primitives
 *
 * Bidirectional resource negotiation between child and parent.
 * request port (child → parent), bargain port (bidirectional).
 */

import { randomUUID } from 'crypto';
import { loadSpine, saveSpine, measureVariety, getAllPorts } from '../../identity/spine.js';
import { at, getParentPath } from '../../identity/scoped-paths.js';
import { loadIdentityAtScope, saveIdentityAtScope } from '../../identity/contract.js';
import { getChain } from '../channels/chain.js';
import { emitVariety } from './token.js';

export type NegotiationDirection = 'request' | 'offer' | 'counter' | 'accept' | 'reject';

export interface ResourceBundle {
  variety?: number;
  capacity?: number;
  time?: number;
  scope?: string[];
  budget?: number;
}

export interface Negotiation {
  id: string;
  scopePath: string;
  parentPath: string;
  status: 'pending' | 'active' | 'accepted' | 'rejected' | 'expired';
  rounds: NegotiationRound[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface NegotiationRound {
  direction: NegotiationDirection;
  from: 'child' | 'parent';
  resources: ResourceBundle;
  conditions: string[];
  justification?: string;
  timestamp: number;
}

export interface NegotiationResult {
  negotiationId: string;
  accepted: boolean;
  finalResources: ResourceBundle;
  appliedAt?: number;
}

const activeNegotiations = new Map<string, Negotiation>();

/**
 * Child initiates resource request.
 * Fires request port, creates negotiation.
 */
export async function requestResources(
  scopePath: string,
  resources: ResourceBundle,
  justification: string
): Promise<Negotiation> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const parentPath = getParentPath(scopePath);

  if (!spine || !parentPath) {
    throw new Error('Cannot negotiate: no spine or parent');
  }

  const negotiation: Negotiation = {
    id: `neg_${randomUUID().slice(0, 8)}`,
    scopePath,
    parentPath,
    status: 'pending',
    rounds: [{
      direction: 'request',
      from: 'child',
      resources,
      conditions: [],
      justification,
      timestamp: Date.now(),
    }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    expiresAt: Date.now() + 3600000, // 1 hour default
  };

  activeNegotiations.set(negotiation.id, negotiation);

  // Fire request port
  spine.request.currentLoad += measureVariety(resources);
  spine.request.lastFired = Date.now();
  saveSpine(scope, spine);

  // Notify parent via chain event
  await getChain().append('bargain:requested', scopePath, parentPath, {
    negotiationId: negotiation.id,
    resources,
    justification,
  });

  return negotiation;
}

/**
 * Parent responds with offer or counter.
 */
export async function respondToRequest(
  negotiationId: string,
  direction: 'offer' | 'counter' | 'accept' | 'reject',
  resources?: ResourceBundle,
  conditions?: string[]
): Promise<Negotiation> {
  const negotiation = activeNegotiations.get(negotiationId);
  if (!negotiation) throw new Error('Negotiation not found');
  if (negotiation.status !== 'pending' && negotiation.status !== 'active') {
    throw new Error(`Negotiation ${negotiation.status}`);
  }

  const parentScope = at(negotiation.parentPath);
  const parentSpine = loadSpine(parentScope);

  negotiation.status = 'active';
  negotiation.rounds.push({
    direction,
    from: 'parent',
    resources: resources ?? {},
    conditions: conditions ?? [],
    timestamp: Date.now(),
  });
  negotiation.updatedAt = Date.now();

  // Fire bargain port
  if (parentSpine) {
    parentSpine.bargain.currentLoad += 10;
    parentSpine.bargain.lastFired = Date.now();
    saveSpine(parentScope, parentSpine);
  }

  // Emit chain event
  await getChain().append('bargain:responded', negotiation.parentPath, negotiation.scopePath, {
    negotiationId,
    direction,
    resources,
    conditions,
  });

  if (direction === 'accept') {
    return await finalizeNegotiation(negotiationId, true);
  }
  if (direction === 'reject') {
    return await finalizeNegotiation(negotiationId, false);
  }

  return negotiation;
}

/**
 * Child responds to parent's offer.
 */
export async function respondToOffer(
  negotiationId: string,
  direction: 'counter' | 'accept' | 'reject',
  resources?: ResourceBundle,
  conditions?: string[]
): Promise<Negotiation> {
  const negotiation = activeNegotiations.get(negotiationId);
  if (!negotiation) throw new Error('Negotiation not found');

  const childScope = at(negotiation.scopePath);
  const childSpine = loadSpine(childScope);

  negotiation.rounds.push({
    direction,
    from: 'child',
    resources: resources ?? {},
    conditions: conditions ?? [],
    timestamp: Date.now(),
  });
  negotiation.updatedAt = Date.now();

  // Fire bargain port on child
  if (childSpine) {
    childSpine.bargain.currentLoad += 10;
    childSpine.bargain.lastFired = Date.now();
    saveSpine(childScope, childSpine);
  }

  await getChain().append('bargain:responded', negotiation.scopePath, negotiation.parentPath, {
    negotiationId,
    direction,
    resources,
    conditions,
  });

  if (direction === 'accept') {
    return await finalizeNegotiation(negotiationId, true);
  }
  if (direction === 'reject') {
    return await finalizeNegotiation(negotiationId, false);
  }

  return negotiation;
}

/**
 * Finalize negotiation and apply resources.
 */
async function finalizeNegotiation(
  negotiationId: string,
  accepted: boolean
): Promise<Negotiation> {
  const negotiation = activeNegotiations.get(negotiationId);
  if (!negotiation) throw new Error('Negotiation not found');

  negotiation.status = accepted ? 'accepted' : 'rejected';
  negotiation.updatedAt = Date.now();

  if (accepted) {
    // Compute final resources from last accepted round
    const finalResources = computeFinalResources(negotiation);

    // Apply to child scope
    await applyResources(negotiation.scopePath, finalResources);

    await getChain().append('bargain:finalized', negotiation.parentPath, negotiation.scopePath, {
      negotiationId,
      accepted: true,
      finalResources,
    });
  } else {
    await getChain().append('bargain:finalized', negotiation.parentPath, negotiation.scopePath, {
      negotiationId,
      accepted: false,
    });
  }

  return negotiation;
}

function computeFinalResources(negotiation: Negotiation): ResourceBundle {
  // Find the last offer/counter that was accepted
  const rounds = negotiation.rounds;
  for (let i = rounds.length - 1; i >= 0; i--) {
    if (rounds[i].direction === 'accept') {
      // The previous round contains the accepted offer
      if (i > 0) {
        return rounds[i - 1].resources;
      }
    }
  }
  // If first request was accepted directly
  return rounds[0].resources;
}

/**
 * Apply negotiated resources to scope.
 */
async function applyResources(scopePath: string, resources: ResourceBundle): Promise<void> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const identity = loadIdentityAtScope(scope);

  if (resources.variety && spine) {
    const ports = getAllPorts(spine);
    for (const port of ports) {
      port.capacity += resources.variety;
    }
  }

  if (resources.capacity && spine) {
    const ports = getAllPorts(spine);
    for (const port of ports) {
      port.capacity += resources.capacity;
    }
  }

  if (resources.scope && identity) {
    const newScope = [...new Set([...identity.scope, ...resources.scope])];
    identity.scope = newScope;
    saveIdentityAtScope(scope, identity);
  }

  if (spine) {
    saveSpine(scope, spine);
  }

  // Emit variety event for Intelligence to perceive
  await emitVariety('coord', 'in', 'bargain', scopePath,
    measureVariety(resources), {
      context: 'resources_allocated',
      scopePath,
    }
  );
}

// Query functions
export function getNegotiation(id: string): Negotiation | null {
  return activeNegotiations.get(id) ?? null;
}

export function getPendingNegotiations(scopePath: string): Negotiation[] {
  return Array.from(activeNegotiations.values())
    .filter(n => n.scopePath === scopePath || n.parentPath === scopePath)
    .filter(n => n.status === 'pending' || n.status === 'active');
}

export function getAllNegotiations(): Negotiation[] {
  return Array.from(activeNegotiations.values());
}

export function expireNegotiations(): number {
  const now = Date.now();
  let expired = 0;

  for (const [id, negotiation] of activeNegotiations) {
    if (negotiation.expiresAt < now && negotiation.status === 'pending') {
      negotiation.status = 'expired';
      expired++;
    }
  }

  return expired;
}
