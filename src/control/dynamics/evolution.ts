/**
 * Evolution — Guiding Equation
 *
 * dQ/dt = v(Q, S) = -∇G(Q, S) / m
 *
 * Agents move down the expected free energy gradient (G = F + γH).
 * Mass provides inertia (scope-specific).
 * Quantum potential modulates exploration vs exploitation.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { listWork } from '../../coordination/resources/work.js';
import { getReputation } from '../../coordination/resources/pool.js';
import { dao, at } from '../../identity/scoped-paths.js';
import { getEffectiveGovernance } from '../../identity/contract.js';
import type {
  Scope,
  Configuration,
  Vector,
  DynamicsState,
  DynamicsParameters,
} from './types.js';
import { scopeKey, clampConfig, ZERO_CONFIG, ZERO_VECTOR, DEFAULT_PARAMETERS, scopeId } from './types.js';
import { getExpectedFreeEnergy, gradientG, listChildScopes } from './free-energy.js';
import { getAggregatePrecision } from './precision.js';
import { buildWaveFunction } from './wave.js';

// State store (rebuilt from chain on startup)
const stateStore = new Map<string, DynamicsState>();

// =============================================================================
// State Retrieval
// =============================================================================

export async function rebuildAgentState(nodeId: string): Promise<DynamicsState | null> {
  const events = await getChain().recall({
    subject: nodeId,
    type: 'dynamics:evolved',
  });

  if (events.length === 0) return null;

  const latest = events[events.length - 1];
  const payload = latest.payload as {
    scopePath?: string;
    scope?: Scope;
    Q: Configuration;
    velocity: Vector;
    G: number;
    quantumPotential: number;
    mass: number;
    τ_aggregate: number;
    β: number;
  };

  // Support both old (scope object) and new (scopePath string) formats
  const scope: Scope = payload.scopePath
    ? at(payload.scopePath)
    : payload.scope ?? dao.node(nodeId);

  const state: DynamicsState = {
    nodeId,
    scope,
    Q: payload.Q,
    velocity: payload.velocity,
    mass: payload.mass,
    G: payload.G,
    gradG: ZERO_VECTOR,
    quantumPotential: payload.quantumPotential,
    τ_aggregate: payload.τ_aggregate,
    β: payload.β,
    uncertainty: 1 - payload.τ_aggregate,
    lastEvolved: latest.timestamp,
  };

  const key = `${nodeId}:${scopeKey(scope)}`;
  stateStore.set(key, state);

  return state;
}

export async function getDynamicsState(
  nodeId: string,
  scope?: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<DynamicsState> {
  const effectiveScope: Scope = scope ?? dao.node(nodeId);
  const key = `${nodeId}:${scopeKey(effectiveScope)}`;

  const cached = stateStore.get(key);
  if (cached) return cached;

  // Try rebuilding from chain events
  const rebuilt = await rebuildAgentState(nodeId);
  if (rebuilt && scopeKey(rebuilt.scope) === scopeKey(effectiveScope)) {
    return rebuilt;
  }

  // Build initial state
  const Q = await computeConfiguration(nodeId, effectiveScope);
  const mass = await computeMass(nodeId, effectiveScope);
  const G = await getExpectedFreeEnergy(effectiveScope, params);
  const gradGVec = await gradientG(effectiveScope, Q, params);
  const τ_aggregate = await getAggregatePrecision(effectiveScope);
  const β = params.β_base * τ_aggregate;

  const state: DynamicsState = {
    nodeId,
    scope: effectiveScope,
    Q,
    velocity: ZERO_VECTOR,
    mass,
    G,
    gradG: gradGVec,
    quantumPotential: 0,
    τ_aggregate,
    β,
    uncertainty: 1 - τ_aggregate,
    lastEvolved: 0,
  };

  stateStore.set(key, state);
  return state;
}

// =============================================================================
// Evolution
// =============================================================================

export async function evolveAgent(
  nodeId: string,
  dt: number,
  scope?: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<DynamicsState> {
  const effectiveScope: Scope = scope ?? dao.node(nodeId);
  const currentState = await getDynamicsState(nodeId, effectiveScope, params);

  // Recompute configuration from current reality
  const Q = await computeConfiguration(nodeId, effectiveScope);
  const mass = await computeMass(nodeId, effectiveScope);

  // Build wave function from G landscape
  const wave = await buildWaveFunction(effectiveScope, mass, params);

  // Get velocity from guidance equation: v = -∇G / m
  const velocity = wave.velocity(Q);

  // Get G (expected free energy) and gradient
  const G = await getExpectedFreeEnergy(effectiveScope, params);
  const gradGVec = await gradientG(effectiveScope, Q, params);

  // Get precision for quantum potential
  const τ_aggregate = await getAggregatePrecision(effectiveScope);
  const β = params.β_base * τ_aggregate;
  const quantumPotential = wave.potential(Q);

  // Evolve position: Q' = Q + v × dt
  const newQ = clampConfig({
    verified: Q.verified + velocity.verified * dt,
    active: Q.active + velocity.active * dt,
    resources: Q.resources + velocity.resources * dt,
  });

  const newState: DynamicsState = {
    nodeId,
    scope: effectiveScope,
    Q: newQ,
    velocity,
    mass,
    G,
    gradG: gradGVec,
    quantumPotential,
    τ_aggregate,
    β,
    uncertainty: 1 - τ_aggregate,
    lastEvolved: Date.now(),
  };

  // Store updated state
  const key = `${nodeId}:${scopeKey(effectiveScope)}`;
  stateStore.set(key, newState);

  // Emit evolution event with scopePath
  await getChain().append('dynamics:evolved', nodeId, nodeId, {
    scopePath: effectiveScope.root(),
    Q: newQ,
    velocity,
    G,
    quantumPotential,
    mass,
    τ_aggregate,
    β,
  });

  return newState;
}

export async function evolveAllAgents(
  dt: number,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<DynamicsState[]> {
  const { listNodes } = await import('../../identity/node.js');
  const nodes = await listNodes({ status: 'active' });

  const states: DynamicsState[] = [];

  for (const node of nodes) {
    const state = await evolveAgent(node.id, dt, undefined, params);
    states.push(state);
  }

  return states;
}

// =============================================================================
// Configuration Computation — Unified Recursive
// =============================================================================

/**
 * Compute configuration at any scope level using the same recursive logic.
 *
 * verified = fulfilled_children / total_children
 * active = active_children / capacity (from identity.md)
 * resources = 1 - (earnings / budget) (from identity.md)
 *
 * This is scale-free: same computation at DAO, context, story, task levels.
 */
async function computeConfiguration(
  nodeId: string,
  scope: Scope
): Promise<Configuration> {
  // Get governance params (capacity, budget) from identity.md with inheritance
  const governance = getEffectiveGovernance(scope);
  const capacity = governance.capacity ?? 5;
  const budget = governance.budget ?? 10000;

  // Get children of this scope
  const children = await listChildScopes(scope);

  // If no children, check if this is a leaf (work item with conditions)
  if (children.length === 0) {
    return computeLeafConfiguration(scope, capacity, budget);
  }

  // Count child statuses
  const statuses = await Promise.all(children.map(getChildStatus));
  const fulfilled = statuses.filter(s => s === 'fulfilled').length;
  const active = statuses.filter(s => s === 'active').length;
  const total = children.length;

  // Get earnings at this scope
  const earnings = await getScopeEarnings(nodeId, scope);

  return {
    verified: fulfilled / total,
    active: Math.min(1, active / capacity),
    resources: Math.max(0, 1 - (earnings / budget)),
  };
}

/**
 * Get the status of a child scope (fulfilled, active, or pending).
 */
async function getChildStatus(child: Scope): Promise<'fulfilled' | 'active' | 'pending'> {
  const childId = scopeId(child);

  // Check if this child is a work item
  const allWork = await listWork({});
  const work = allWork.find(w => w.id === childId);

  if (work) {
    if (work.status === 'fulfilled') return 'fulfilled';
    if (work.status === 'active' || work.status === 'executing') return 'active';
    return 'pending';
  }

  // For non-work scopes (contexts, etc.), check chain events
  const events = await getChain().recall({ subject: childId });
  const closedEvent = events.find(e => e.type === 'identity:closed');
  if (closedEvent) return 'fulfilled';

  const activeEvents = events.filter(e =>
    e.type === 'work:created' || e.type === 'hub:created'
  );
  if (activeEvents.length > 0) return 'active';

  return 'pending';
}

/**
 * Compute configuration for a leaf scope (no children).
 * For work items, children are conditions.
 */
async function computeLeafConfiguration(
  scope: Scope,
  capacity: number,
  budget: number
): Promise<Configuration> {
  const id = scopeId(scope);

  // Check if this is a work item with conditions
  const allWork = await listWork({});
  const work = allWork.find(w => w.id === id);

  if (work) {
    const totalConditions = work.conditions.length || 1;
    const metConditions = work.conditions.filter(c => c.met).length;
    const isActive = work.status === 'active' || work.status === 'executing';

    return {
      verified: metConditions / totalConditions,
      active: isActive ? 1 : 0,
      resources: work.bounty ? 1 : 0,
    };
  }

  // Empty scope with no work
  return ZERO_CONFIG;
}

// =============================================================================
// Mass Computation — Path-Based
// =============================================================================

async function computeMass(
  nodeId: string,
  scope: Scope
): Promise<number> {
  const baseMass = 1;
  const earnings = await getScopeEarnings(nodeId, scope);
  return baseMass + earnings * 0.001;
}

async function getScopeEarnings(
  nodeId: string,
  scope: Scope
): Promise<number> {
  const events = await getChain().recall({ subject: nodeId, type: 'credit:earned' });
  const scopePath = scope.root();
  const { dao } = await import('../../identity/scoped-paths.js');
  const isRoot = scopePath === dao.root();

  return events
    .filter(e => {
      const p = e.payload as { scopePath?: string };

      // New format: match scopePath prefix
      if (p.scopePath) {
        return p.scopePath.startsWith(scopePath);
      }

      // Legacy format without scopePath: include only at root
      return isRoot;
    })
    .reduce((sum, e) => {
      const p = e.payload as { bits?: number };
      return sum + (p.bits ?? 0);
    }, 0);
}

// =============================================================================
// Model Uncertainty
// =============================================================================

export async function getModelUncertainty(scope: Scope): Promise<number> {
  const τ = await getAggregatePrecision(scope);
  return 1 - τ;
}

// =============================================================================
// Reset (for testing)
// =============================================================================

export function resetDynamicsState(): void {
  stateStore.clear();
}
