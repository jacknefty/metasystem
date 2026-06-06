/**
 * Free Energy Computation
 *
 * F(S) = Σ variety:in(S) - Σ variety:out(S)
 * H(S) = Σ (1 - confidence(τ)) × weight   (epistemic uncertainty)
 * G(S) = F(S) + γ × H(S)                  (expected free energy)
 *
 * Scale-free: works at condition, work, context, node, dao, network levels.
 * Aggregates upward through scope hierarchy.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { getWork, listWork } from '../../coordination/resources/work.js';
import { getSystemBalance } from '../../coordination/resources/token.js';
import { parseVerifier } from '../verify/registry.js';
import type { Scope, FreeEnergyState, Configuration, Vector, DynamicsParameters } from './types.js';
import { scopeKey, DEFAULT_PARAMETERS } from './types.js';
import { getPrecision } from './precision.js';

// Cache for computed F values (short TTL)
const fCache = new Map<string, { F: number; computedAt: number }>();
const CACHE_TTL = 5000; // 5 seconds

export async function getFreeEnergy(scope: Scope): Promise<number> {
  const key = scopeKey(scope);
  const cached = fCache.get(key);

  if (cached && Date.now() - cached.computedAt < CACHE_TTL) {
    return cached.F;
  }

  const F = await computeFreeEnergy(scope);
  fCache.set(key, { F, computedAt: Date.now() });

  return F;
}

export async function getFreeEnergyState(
  scope: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<FreeEnergyState> {
  const { perceived, resolved } = await getVarietyBalance(scope);
  const F = perceived - resolved;
  const H = await computeEpistemicValue(scope, params);
  const G = F + params.γ * H;

  return {
    scope,
    perceived,
    resolved,
    F,
    H,
    G,
    computedAt: Date.now(),
  };
}

/**
 * Get expected free energy G = F + γH
 */
export async function getExpectedFreeEnergy(
  scope: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<number> {
  const F = await getFreeEnergy(scope);
  const H = await computeEpistemicValue(scope, params);
  return F + params.γ * H;
}

/**
 * Get epistemic value H at a scope
 * H(S) = Σ (1 - confidence(τ)) × weight
 */
export async function getEpistemicValue(
  scope: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<number> {
  return computeEpistemicValue(scope, params);
}

async function computeEpistemicValue(
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  switch (scope.level) {
    case 'condition':
      return computeConditionH(scope.id, scope.workId, scope, params);
    case 'work':
      return computeWorkH(scope.id, scope, params);
    case 'context':
      return computeContextH(scope.id, scope, params);
    case 'node':
    case 'dao':
    case 'network':
      return computeAggregateH(scope, params);
  }
}

async function computeConditionH(
  conditionId: string,
  workId: string,
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  const work = await getWork(workId);
  if (!work) return 0;

  const condition = work.conditions.find(c => c.id === conditionId);
  if (!condition) return 0;
  if (condition.met) return 0; // No uncertainty about resolved conditions

  const { type: verifierType } = parseVerifier(condition.verifier);
  const precision = await getPrecision(verifierType, scope);
  const confidence = Math.min(precision.samples / params.learningThreshold, 1);
  const weight = condition.varietyWeight ?? 10;

  return (1 - confidence) * weight;
}

async function computeWorkH(
  workId: string,
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  const work = await getWork(workId);
  if (!work) return 0;

  let H = 0;
  for (const condition of work.conditions) {
    if (condition.met) continue;
    H += await computeConditionH(condition.id, workId, scope, params);
  }
  return H;
}

async function computeContextH(
  contextId: string,
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  const workItems = await listWork({ contextId });

  let H = 0;
  for (const work of workItems) {
    if (work.status === 'fulfilled') continue;
    const workScope: Scope = { level: 'work', id: work.id, contextId };
    H += await computeWorkH(work.id, workScope, params);
  }
  return H;
}

async function computeAggregateH(
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  // For node/dao/network, aggregate H from all active work
  const workItems = await listWork({});

  let H = 0;
  for (const work of workItems) {
    if (work.status === 'fulfilled') continue;
    const workScope: Scope = { level: 'work', id: work.id, contextId: work.contextId };
    H += await computeWorkH(work.id, workScope, params);
  }
  return H;
}

async function computeFreeEnergy(scope: Scope): Promise<number> {
  switch (scope.level) {
    case 'condition':
      return computeConditionF(scope.id, scope.workId);
    case 'work':
      return computeWorkF(scope.id, scope.contextId);
    case 'context':
      return computeContextF(scope.id);
    case 'node':
      return computeNodeF(scope.id);
    case 'dao':
      return computeDaoF(scope.address);
    case 'network':
      return computeNetworkF();
  }
}

async function computeConditionF(conditionId: string, workId: string): Promise<number> {
  const work = await getWork(workId);
  if (!work) return 0;

  const condition = work.conditions.find(c => c.id === conditionId);
  if (!condition) return 0;

  const weight = condition.varietyWeight ?? 10;
  return condition.met ? 0 : weight;
}

async function computeWorkF(workId: string, contextId: string): Promise<number> {
  const work = await getWork(workId);
  if (!work) return 0;

  let F = 0;
  for (const condition of work.conditions) {
    F += await computeConditionF(condition.id, workId);
  }
  return F;
}

async function computeContextF(contextId: string): Promise<number> {
  const workItems = await listWork({ contextId });

  let F = 0;
  for (const work of workItems) {
    if (work.status === 'fulfilled') continue;
    F += await computeWorkF(work.id, contextId);
  }
  return F;
}

async function computeNodeF(nodeId: string): Promise<number> {
  // Node F = sum of F for all contexts the node is responsible for
  // For now, use system balance scoped to node
  const events = await getChain().recall({ subject: nodeId });

  let perceived = 0;
  let resolved = 0;

  for (const event of events) {
    if (event.type.startsWith('variety:') && event.type.includes(':in')) {
      const payload = event.payload as { bits: number };
      perceived += payload.bits;
    } else if (event.type.startsWith('variety:') && event.type.includes(':out')) {
      const payload = event.payload as { bits: number };
      resolved += payload.bits;
    }
  }

  return perceived - resolved;
}

async function computeDaoF(daoAddress: string): Promise<number> {
  // DAO scope not implemented yet — requires on-chain integration
  throw new Error(`DAO scope not implemented: ${daoAddress}. Requires network backend.`);
}

/**
 * Stub: List all DAOs in the network
 * Returns empty until network integration is complete
 */
export async function listDAOs(): Promise<Array<{ address: string }>> {
  return [];
}

async function computeNetworkF(): Promise<number> {
  const balance = await getSystemBalance();
  return balance.perceived - balance.resolved;
}

async function getVarietyBalance(scope: Scope): Promise<{ perceived: number; resolved: number }> {
  switch (scope.level) {
    case 'condition': {
      const work = await getWork(scope.workId);
      const condition = work?.conditions.find(c => c.id === scope.id);
      if (!condition) return { perceived: 0, resolved: 0 };
      const weight = condition.varietyWeight ?? 10;
      return condition.met
        ? { perceived: weight, resolved: weight }
        : { perceived: weight, resolved: 0 };
    }
    case 'work': {
      const work = await getWork(scope.id);
      if (!work) return { perceived: 0, resolved: 0 };
      let perceived = 0;
      let resolved = 0;
      for (const c of work.conditions) {
        const weight = c.varietyWeight ?? 10;
        perceived += weight;
        if (c.met) resolved += weight;
      }
      return { perceived, resolved };
    }
    case 'network': {
      const balance = await getSystemBalance();
      return { perceived: balance.perceived, resolved: balance.resolved };
    }
    default: {
      // For context, node, dao — aggregate from children
      const F = await computeFreeEnergy(scope);
      // Approximate: assume half is perceived, other half is F
      const resolved = Math.max(0, -F);
      const perceived = resolved + F;
      return { perceived, resolved };
    }
  }
}

// =============================================================================
// Gradient Computation (G, not F)
// =============================================================================

export async function gradientG(
  scope: Scope,
  Q: Configuration,
  params: DynamicsParameters = DEFAULT_PARAMETERS,
  epsilon: number = 0.1
): Promise<Vector> {
  // Sample G landscape and compute numerical gradient
  const landscape = await sampleGLandscape(scope, 5, params);
  return gradientFromLandscape(landscape, Q, epsilon);
}

function gradientFromLandscape(
  landscape: Map<string, number>,
  Q: Configuration,
  epsilon: number = 0.1
): Vector {
  const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

  const dG_dV = (
    interpolateG(landscape, { ...Q, verified: clamp01(Q.verified + epsilon) }) -
    interpolateG(landscape, { ...Q, verified: clamp01(Q.verified - epsilon) })
  ) / (2 * epsilon);

  const dG_dA = (
    interpolateG(landscape, { ...Q, active: clamp01(Q.active + epsilon) }) -
    interpolateG(landscape, { ...Q, active: clamp01(Q.active - epsilon) })
  ) / (2 * epsilon);

  const dG_dR = (
    interpolateG(landscape, { ...Q, resources: clamp01(Q.resources + epsilon) }) -
    interpolateG(landscape, { ...Q, resources: clamp01(Q.resources - epsilon) })
  ) / (2 * epsilon);

  return { verified: dG_dV, active: dG_dA, resources: dG_dR };
}

// =============================================================================
// G Landscape Sampling (G = F + γH)
// =============================================================================

export interface LandscapeSample {
  Q: Configuration;
  G: number;
}

/**
 * Sample the expected free energy G across configuration space
 */
export async function sampleGLandscape(
  scope: Scope,
  resolution: number = 5,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<Map<string, number>> {
  const landscape = new Map<string, number>();
  const state = await getFreeEnergyState(scope, params);
  const baseG = state.G;

  // G(Q) models how expected free energy varies with agent configuration
  // G decreases as verified increases (more resolved = lower F)
  // G increases with active (more WIP = higher uncertainty = higher H)

  for (let v = 0; v <= 1; v += 1 / resolution) {
    for (let a = 0; a <= 1; a += 1 / resolution) {
      for (let r = 0; r <= 1; r += 1 / resolution) {
        // G decreases with verified, increases slightly with active
        const G = baseG * (1 - v * 0.8) * (1 + a * 0.1);
        landscape.set(`${v.toFixed(2)}:${a.toFixed(2)}:${r.toFixed(2)}`, G);
      }
    }
  }

  return landscape;
}

/**
 * Interpolate G value from sampled landscape
 */
export function interpolateG(
  landscape: Map<string, number>,
  Q: Configuration
): number {
  const key = `${Q.verified.toFixed(2)}:${Q.active.toFixed(2)}:${Q.resources.toFixed(2)}`;
  return landscape.get(key) ?? 0;
}

// Legacy aliases for backwards compatibility
export const sampleFreeEnergyLandscape = sampleGLandscape;
export const interpolateFreeEnergy = interpolateG;
export const gradientFreeEnergy = gradientG;

// =============================================================================
// Cache Management
// =============================================================================

export function clearFreeEnergyCache(): void {
  fCache.clear();
}

export function invalidateFreeEnergy(scope: Scope): void {
  fCache.delete(scopeKey(scope));
}
