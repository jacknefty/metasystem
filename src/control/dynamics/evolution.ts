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
import { getReputation, getNodeClaims } from '../../coordination/resources/pool.js';
import type {
  Scope,
  Configuration,
  Vector,
  DynamicsState,
  DynamicsParameters,
} from './types.js';
import { scopeKey, clampConfig, ZERO_CONFIG, ZERO_VECTOR, DEFAULT_PARAMETERS } from './types.js';
import { getExpectedFreeEnergy, gradientG } from './free-energy.js';
import { getAggregatePrecision } from './precision.js';
import { buildWaveFunction } from './wave.js';

const AGENT_CAPACITY = 5;

// State store (would be persisted)
const stateStore = new Map<string, DynamicsState>();

// =============================================================================
// State Retrieval
// =============================================================================

export async function getDynamicsState(
  nodeId: string,
  scope?: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<DynamicsState> {
  const effectiveScope: Scope = scope ?? { level: 'node', id: nodeId };
  const key = `${nodeId}:${scopeKey(effectiveScope)}`;

  const cached = stateStore.get(key);
  if (cached) return cached;

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
  const effectiveScope: Scope = scope ?? { level: 'node', id: nodeId };
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

  // Emit evolution event
  await getChain().append('dynamics:evolved', nodeId, nodeId, {
    scope: effectiveScope,
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
// Configuration Computation
// =============================================================================

async function computeConfiguration(
  nodeId: string,
  scope: Scope
): Promise<Configuration> {
  // Configuration depends on scope level
  switch (scope.level) {
    case 'node': {
      return computeNodeConfiguration(nodeId);
    }
    case 'context': {
      return computeContextConfiguration(nodeId, scope.id);
    }
    case 'work': {
      return computeWorkConfiguration(scope.id);
    }
    default: {
      return computeNodeConfiguration(nodeId);
    }
  }
}

async function computeNodeConfiguration(nodeId: string): Promise<Configuration> {
  const allWork = await listWork({});
  const nodeWork = allWork.filter(w =>
    w.claim?.nodeId === nodeId || w.ownerId === nodeId
  );

  const fulfilled = nodeWork.filter(w => w.status === 'fulfilled').length;
  const active = nodeWork.filter(w =>
    w.status === 'active' || w.status === 'executing'
  ).length;
  const total = nodeWork.length || 1;

  const reputation = await getReputation(nodeId);

  return {
    verified: fulfilled / total,
    active: Math.min(1, active / AGENT_CAPACITY),
    resources: Math.max(0, 1.0 - (reputation.totalEarned / 10000)),
  };
}

async function computeContextConfiguration(
  nodeId: string,
  contextId: string
): Promise<Configuration> {
  const contextWork = await listWork({ contextId });
  const nodeWork = contextWork.filter(w =>
    w.claim?.nodeId === nodeId || w.ownerId === nodeId
  );

  const fulfilled = nodeWork.filter(w => w.status === 'fulfilled').length;
  const active = nodeWork.filter(w =>
    w.status === 'active' || w.status === 'executing'
  ).length;
  const total = nodeWork.length || 1;

  // Context-specific earnings (simplified)
  const events = await getChain().recall({ subject: nodeId, type: 'credit:earned' });
  const contextEarnings = events
    .filter(e => {
      const p = e.payload as { contextId?: string };
      return p.contextId === contextId;
    })
    .reduce((sum, e) => {
      const p = e.payload as { bits?: number };
      return sum + (p.bits ?? 0);
    }, 0);

  return {
    verified: fulfilled / total,
    active: Math.min(1, active / AGENT_CAPACITY),
    resources: Math.max(0, 1.0 - (contextEarnings / 1000)),
  };
}

async function computeWorkConfiguration(workId: string): Promise<Configuration> {
  const work = await listWork({}).then(all => all.find(w => w.id === workId));
  if (!work) return ZERO_CONFIG;

  const totalConditions = work.conditions.length || 1;
  const metConditions = work.conditions.filter(c => c.met).length;

  const isActive = work.status === 'active' || work.status === 'executing';

  return {
    verified: metConditions / totalConditions,
    active: isActive ? 1 : 0,
    resources: work.bounty ? 1 : 0,
  };
}

// =============================================================================
// Mass Computation — Scope-Specific
// =============================================================================

async function computeMass(
  nodeId: string,
  scope: Scope
): Promise<number> {
  const baseMass = 1;

  // Get scope-specific earnings
  const earnings = await getScopeEarnings(nodeId, scope);

  // mass = baseMass + earnings × 0.001
  return baseMass + earnings * 0.001;
}

async function getScopeEarnings(
  nodeId: string,
  scope: Scope
): Promise<number> {
  const events = await getChain().recall({ subject: nodeId, type: 'credit:earned' });

  switch (scope.level) {
    case 'node': {
      // All earnings for this node
      return events.reduce((sum, e) => {
        const p = e.payload as { bits?: number };
        return sum + (p.bits ?? 0);
      }, 0);
    }
    case 'context': {
      // Earnings in this context only
      return events
        .filter(e => {
          const p = e.payload as { contextId?: string };
          return p.contextId === scope.id;
        })
        .reduce((sum, e) => {
          const p = e.payload as { bits?: number };
          return sum + (p.bits ?? 0);
        }, 0);
    }
    case 'work': {
      // Earnings from this specific work
      return events
        .filter(e => {
          const p = e.payload as { workId?: string };
          return p.workId === scope.id;
        })
        .reduce((sum, e) => {
          const p = e.payload as { bits?: number };
          return sum + (p.bits ?? 0);
        }, 0);
    }
    default: {
      return 0;
    }
  }
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
