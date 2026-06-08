/**
 * Free Energy Computation — Spine-Based with Recursive Aggregation
 *
 * Local F = sumOverflow(spine) — variety that couldn't be absorbed
 * Aggregate F = local F + Σ children's aggregate F
 *
 * H(S) = Σ (1 - confidence(τ)) × weight   (epistemic uncertainty)
 * G(S) = F(S) + γ × H(S)                  (expected free energy)
 *
 * Scale-free: single recursive function works at any depth.
 * Spine is source of truth for local variety; aggregates upward.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { at, depth as scopeDepth, listChildren } from '../../identity/scoped-paths.js';
import { loadSpine, sumOverflow } from '../../identity/spine.js';
import type { Scope, FreeEnergyState, Configuration, Vector, DynamicsParameters } from './types.js';
import { scopeKey, getParentScope, DEFAULT_PARAMETERS } from './types.js';

// Re-export listChildren for backward compatibility
export { listChildren as listChildScopes } from '../../identity/scoped-paths.js';

// Cache for computed F values (short TTL)
const fCache = new Map<string, { F: number; computedAt: number }>();
const CACHE_TTL = 5000; // 5 seconds

/**
 * Get local free energy at a scope (no children).
 * Local F = sumOverflow(spine) — variety that couldn't be absorbed.
 */
export function getLocalFreeEnergy(scope: Scope): number {
  const spine = loadSpine(scope);
  if (!spine) return 0;
  return sumOverflow(spine);
}

/**
 * Get aggregate free energy (local + children).
 * This is the primary F metric for homeostat decisions.
 */
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

/**
 * Recursive epistemic value computation.
 * H = local uncertainty + sum of children's H
 */
async function computeEpistemicValue(
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  // Local H from unresolved variety at this scope
  const localH = await computeLocalH(scope, params);

  // Children's H
  const children = await listChildren(scope);
  let childrenH = 0;
  for (const child of children) {
    childrenH += await computeEpistemicValue(child, params);
  }

  return localH + childrenH;
}

/**
 * Local epistemic uncertainty at a single scope (no children).
 * Based on unresolved variety events and their confidence.
 */
async function computeLocalH(scope: Scope, params: DynamicsParameters): Promise<number> {
  const scopePath = scope.root();
  const events = await getChain().recall({ type: 'variety:work:in' });

  let H = 0;
  for (const event of events) {
    const payload = event.payload as { bits?: number; scopePath?: string; workId?: string };

    // Match events at this scope
    if (payload.scopePath?.startsWith(scopePath) || event.subject === scopePath) {
      const bits = payload.bits ?? 10;
      // Check if resolved
      const resolved = await isVarietyResolved(event.subject, scopePath);
      if (!resolved) {
        // Uncertainty weight — could be enhanced with precision lookup
        const confidence = 0.5; // Default confidence
        H += (1 - confidence) * bits;
      }
    }
  }

  return H;
}

async function isVarietyResolved(subject: string, scopePath: string): Promise<boolean> {
  const outEvents = await getChain().recall({ type: 'variety:work:out', subject });
  return outEvents.length > 0;
}

/**
 * Recursive free energy computation.
 * F = local F (from spine overflow) + sum of children's F
 */
async function computeFreeEnergy(scope: Scope): Promise<number> {
  // Primary source: spine overflow
  const localF = getLocalFreeEnergy(scope);

  const children = await listChildren(scope);
  let childrenF = 0;
  for (const child of children) {
    childrenF += await computeFreeEnergy(child);
  }

  return localF + childrenF;
}

/**
 * Legacy local F computation from chain events.
 * Kept for backward compatibility during transition.
 * @deprecated Use getLocalFreeEnergy() which reads from spine
 */
async function computeLocalFFromChain(scope: Scope): Promise<number> {
  const { perceived, resolved } = await getLocalVarietyBalance(scope);
  return perceived - resolved;
}

/**
 * Get variety balance at a scope (perceived vs resolved).
 * Includes local + children.
 */
async function getVarietyBalance(scope: Scope): Promise<{ perceived: number; resolved: number }> {
  const local = await getLocalVarietyBalance(scope);

  const children = await listChildren(scope);
  let childPerceived = 0;
  let childResolved = 0;

  for (const child of children) {
    const childBalance = await getVarietyBalance(child);
    childPerceived += childBalance.perceived;
    childResolved += childBalance.resolved;
  }

  return {
    perceived: local.perceived + childPerceived,
    resolved: local.resolved + childResolved,
  };
}

/**
 * Local variety balance at a single scope.
 * Queries chain events by scopePath prefix.
 */
async function getLocalVarietyBalance(scope: Scope): Promise<{ perceived: number; resolved: number }> {
  const scopePath = scope.root();

  // Get all variety events
  const inEvents = await getChain().recall({ type: ['variety:work:in', 'variety:env:in'] });
  const outEvents = await getChain().recall({ type: ['variety:work:out', 'variety:env:out'] });

  let perceived = 0;
  let resolved = 0;

  for (const event of inEvents) {
    const payload = event.payload as { bits?: number; scopePath?: string };
    // Match if scopePath matches exactly (not prefix — that's for children)
    if (payload.scopePath === scopePath) {
      perceived += payload.bits ?? 0;
    }
  }

  for (const event of outEvents) {
    const payload = event.payload as { bits?: number; scopePath?: string };
    if (payload.scopePath === scopePath) {
      resolved += payload.bits ?? 0;
    }
  }

  return { perceived, resolved };
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

// Legacy aliases
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

// =============================================================================
// Aggregated Free Energy (decomposed view)
// =============================================================================

export interface FreeEnergyAggregateState {
  scope: Scope;
  F_local: number;
  F_children: number;
  F_total: number;
  childCount: number;
  computedAt: number;
}

const aggregateCache = new Map<string, { state: FreeEnergyAggregateState; computedAt: number }>();

export async function getFreeEnergyAggregate(scope: Scope): Promise<FreeEnergyAggregateState> {
  const key = scopeKey(scope);
  const cached = aggregateCache.get(key);

  if (cached && Date.now() - cached.computedAt < CACHE_TTL) {
    return cached.state;
  }

  const state = await computeAggregateState(scope);
  aggregateCache.set(key, { state, computedAt: Date.now() });

  return state;
}

async function computeAggregateState(scope: Scope): Promise<FreeEnergyAggregateState> {
  const F_local = getLocalFreeEnergy(scope);
  const children = await listChildren(scope);

  let F_children = 0;
  for (const child of children) {
    const childState = await getFreeEnergyAggregate(child);
    F_children += childState.F_total;
  }

  return {
    scope,
    F_local,
    F_children,
    F_total: F_local + F_children,
    childCount: children.length,
    computedAt: Date.now(),
  };
}

export function clearAggregateCache(): void {
  aggregateCache.clear();
}

export function invalidateAggregateCache(scope: Scope): void {
  let current: Scope | null = scope;
  while (current) {
    aggregateCache.delete(scopeKey(current));
    current = getParentScope(current);
  }
}

// =============================================================================
// Utilities
// =============================================================================

export function scopeId(scope: Scope): string {
  const root = scope.root();
  const parts = root.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'dao';
}

export { scopeDepth };
