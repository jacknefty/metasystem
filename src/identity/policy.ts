/**
 * Policy Port Activation
 *
 * Identity updates at runtime.
 * Propagates scope/boundary changes to children.
 */

import { loadSpine, saveSpine, type IdentityConstraint } from './spine.js';
import { loadIdentityAtScope, saveIdentityAtScope, type IdentityContract } from './contract.js';
import { at, listChildren } from './scoped-paths.js';
import { getChain } from '../coordination/channels/chain.js';

export type PolicyChangeType =
  | 'scope_expand'
  | 'scope_narrow'
  | 'boundary_add'
  | 'boundary_remove'
  | 'obligation_add'
  | 'obligation_remove'
  | 'purpose_update'
  | 'closure_initiate';

export interface PolicyChange {
  type: PolicyChangeType;
  payload: Record<string, unknown>;
  reason: string;
  source: 'intelligence' | 'identity' | 'escalation' | 'governance';
}

/**
 * Emit policy change from Identity to self and children.
 */
export async function emitPolicy(
  scopePath: string,
  change: PolicyChange
): Promise<void> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const identity = loadIdentityAtScope(scope);

  if (!spine || !identity) {
    throw new Error('Cannot emit policy: no spine or identity');
  }

  // Apply change to identity
  const updatedIdentity = applyPolicyChange(identity, change);
  saveIdentityAtScope(scope, updatedIdentity);

  // Fire policy port
  const constraint: IdentityConstraint = {
    constraintType: mapChangeToConstraintType(change.type),
    rule: JSON.stringify(change.payload),
    enforcedAt: Date.now(),
  };

  spine.policy.currentLoad += 10;
  spine.policy.lastFired = Date.now();
  saveSpine(scope, spine);

  // Emit chain event
  await getChain().append('policy:updated', change.source, scopePath, {
    changeType: change.type,
    payload: change.payload,
    reason: change.reason,
  });

  // Propagate to children if scope change affects them
  if (change.type === 'scope_narrow' || change.type === 'boundary_add') {
    await propagatePolicyToChildren(scopePath, change);
  }
}

function applyPolicyChange(
  identity: IdentityContract,
  change: PolicyChange
): IdentityContract {
  const updated = { ...identity };

  switch (change.type) {
    case 'scope_expand':
      updated.scope = [...new Set([...identity.scope, ...(change.payload.scope as string[])])];
      break;

    case 'scope_narrow':
      const removeScope = change.payload.scope as string[];
      updated.scope = identity.scope.filter(s => !removeScope.includes(s));
      break;

    case 'boundary_add':
      updated.boundaries = [...identity.boundaries, change.payload.boundary as string];
      break;

    case 'boundary_remove':
      updated.boundaries = identity.boundaries.filter(b => b !== change.payload.boundary);
      break;

    case 'obligation_add':
      updated.obligations = [...identity.obligations, change.payload.obligation as string];
      break;

    case 'obligation_remove':
      updated.obligations = identity.obligations.filter(o => o !== change.payload.obligation);
      break;

    case 'purpose_update':
      updated.purpose = change.payload.purpose as string;
      break;

    case 'closure_initiate':
      updated.frontmatter = {
        ...identity.frontmatter,
        closes: 'conditions',
      };
      break;
  }

  return updated;
}

function mapChangeToConstraintType(
  changeType: PolicyChangeType
): 'scope' | 'boundary' | 'obligation' {
  if (changeType.startsWith('scope')) return 'scope';
  if (changeType.startsWith('boundary')) return 'boundary';
  return 'obligation';
}

async function propagatePolicyToChildren(
  scopePath: string,
  change: PolicyChange
): Promise<void> {
  const children = await listChildren(at(scopePath));

  for (const child of children) {
    const childSpine = loadSpine(child);
    if (childSpine) {
      // Fire child's policy port (receiving)
      childSpine.policy.currentLoad += 5;
      childSpine.policy.lastFired = Date.now();
      saveSpine(child, childSpine);
    }

    await getChain().append('policy:received', scopePath, child.root(), {
      changeType: change.type,
      fromParent: scopePath,
    });
  }
}

/**
 * Request policy change via governance (for significant changes).
 */
export async function proposePolicyChange(
  scopePath: string,
  change: PolicyChange
): Promise<string> {
  // Significant changes go through governance
  const significantChanges: PolicyChangeType[] = [
    'purpose_update',
    'closure_initiate',
    'scope_narrow',
  ];

  if (significantChanges.includes(change.type)) {
    // Create governance proposal
    const { createProposal } = await import('../coordination/governance/index.js');

    const scope = at(scopePath);
    const proposal = await createProposal({
      type: 'policy_change',
      scope,
      target: scopePath,
      resourcesRequested: 0,
      metadata: {
        change,
      },
    });

    return proposal.id;
  }

  // Non-significant changes can be applied directly
  await emitPolicy(scopePath, change);
  return 'applied';
}

/**
 * Receive policy change from parent.
 * Called when parent narrows scope or adds boundary.
 */
export async function receivePolicyFromParent(
  scopePath: string,
  change: PolicyChange
): Promise<void> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const identity = loadIdentityAtScope(scope);

  if (!spine || !identity) return;

  // Check if change affects this scope
  if (change.type === 'scope_narrow') {
    const removedScopes = change.payload.scope as string[];
    const affected = identity.scope.some(s =>
      removedScopes.some(r => s.startsWith(r) || r.startsWith(s))
    );

    if (affected) {
      // Apply scope narrowing
      const narrowedScope = identity.scope.filter(s =>
        !removedScopes.some(r => s.startsWith(r))
      );
      identity.scope = narrowedScope;
      saveIdentityAtScope(scope, identity);
    }
  }

  if (change.type === 'boundary_add') {
    const newBoundary = change.payload.boundary as string;
    if (!identity.boundaries.includes(newBoundary)) {
      identity.boundaries.push(newBoundary);
      saveIdentityAtScope(scope, identity);
    }
  }

  // Update policy port
  spine.policy.currentLoad += 5;
  spine.policy.lastFired = Date.now();
  saveSpine(scope, spine);
}
