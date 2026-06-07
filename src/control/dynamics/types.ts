/**
 * Unified Dynamics Types
 *
 * Scale-free types for Free Energy + Bohmian mechanics.
 * Same structures work at any recursion level via path-based scoping.
 */

import type { ScopedPaths } from '../../identity/scoped-paths.js';
import { parent as getParent, scopeKey as getScopeKey } from '../../identity/scoped-paths.js';

// =============================================================================
// Scope — Path-based scale-free identifier
// =============================================================================

export type Scope = ScopedPaths;

export function scopeKey(scope: Scope): string {
  return getScopeKey(scope);
}

export function getParentScope(scope: Scope): Scope | null {
  return getParent(scope);
}

export function scopeDepth(scope: Scope): number {
  const root = scope.root();
  const parts = root.split('/').filter(Boolean);
  // Count segments after the base data dir
  const baseDepth = process.env.METASYSTEM_DATA_DIR?.split('/').filter(Boolean).length ?? 0;
  return Math.max(0, parts.length - baseDepth);
}

export function scopeId(scope: Scope): string {
  const root = scope.root();
  const parts = root.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'dao';
}

// =============================================================================
// Configuration Space — Uniform across all levels
// =============================================================================

export interface Configuration {
  verified: number;   // 0-1: resolved / total
  active: number;     // 0-1: in-progress / capacity
  resources: number;  // 0-1: available / allocated
}

export interface Vector {
  verified: number;
  active: number;
  resources: number;
}

export const ZERO_CONFIG: Configuration = { verified: 0, active: 0, resources: 0 };
export const ZERO_VECTOR: Vector = { verified: 0, active: 0, resources: 0 };

export function configKey(Q: Configuration): string {
  return `${Q.verified.toFixed(2)}:${Q.active.toFixed(2)}:${Q.resources.toFixed(2)}`;
}

export function addVector(a: Vector, b: Vector): Vector {
  return {
    verified: a.verified + b.verified,
    active: a.active + b.active,
    resources: a.resources + b.resources,
  };
}

export function scaleVector(v: Vector, s: number): Vector {
  return {
    verified: v.verified * s,
    active: v.active * s,
    resources: v.resources * s,
  };
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

export function clampConfig(Q: Configuration): Configuration {
  return {
    verified: clamp01(Q.verified),
    active: clamp01(Q.active),
    resources: clamp01(Q.resources),
  };
}

// =============================================================================
// Free Energy State
// =============================================================================

export interface FreeEnergyState {
  scope: Scope;
  perceived: number;      // Σ variety:in
  resolved: number;       // Σ variety:out
  F: number;              // perceived - resolved
  H: number;              // epistemic uncertainty = Σ (1 - confidence(τ)) × weight
  G: number;              // expected free energy = F + γH
  computedAt: number;
}

// =============================================================================
// Precision — Learned confidence in verifiers
// =============================================================================

export interface PrecisionRecord {
  verifierType: string;
  scope: Scope;
  prior: number;          // from registry
  empirical: number;      // learned from outcomes
  samples: number;        // observation count
  τ: number;              // blended precision
  updatedAt: number;
}

export interface Prediction {
  id: string;
  workId: string;
  conditionId: string;
  verifierType: string;
  scope: Scope;
  predictedOutcome: number;   // 0-1 probability
  predictedAt: number;
  source: 'automated' | 'self-assessment' | 'attestation';
  weight: number;             // learning weight based on source

  // Filled after observation
  actualOutcome?: number;
  observedAt?: number;
  predictionError?: number;
}

// =============================================================================
// Wave Function
// =============================================================================

export interface WaveFunction {
  amplitude: (Q: Configuration) => number;
  phase: (Q: Configuration) => number;
  velocity: (Q: Configuration) => Vector;
  potential: (Q: Configuration) => number;
}

// =============================================================================
// Bohmian State — Extended with F and τ
// =============================================================================

export interface DynamicsState {
  nodeId: string;
  scope: Scope;

  // Configuration space position
  Q: Configuration;
  velocity: Vector;
  mass: number;

  // Expected free energy landscape (G = F + γH)
  G: number;
  gradG: Vector;

  // Quantum mechanics
  quantumPotential: number;

  // Precision state
  τ_aggregate: number;
  β: number;                // adaptive inverse temperature = β_base × τ_aggregate

  // Derived
  uncertainty: number;      // 1 - τ_aggregate

  lastEvolved: number;
}

// =============================================================================
// Actions
// =============================================================================

export type ActionType = 'claim-work' | 'invoke-perception' | 'verify-condition' | 'execute';

export interface Action {
  type: ActionType;
  target: string;
  scope: Scope;
}

export interface ActionEvaluation {
  action: Action;

  // G components
  currentF: number;
  expectedF: number;
  pragmaticValue: number;
  epistemicValue: number;
  G: number;

  // For debugging
  successProbability: number;
  relevantPrecisions: PrecisionRecord[];
}

// =============================================================================
// S4 Field — Derived from F
// =============================================================================

export interface CapabilityGap {
  id: string;
  center: Configuration;
  radius: number;
  F: number;              // free energy in this region
  epistemicValue: number; // uncertainty = exploration value
  description: string;
}

export interface Opportunity {
  id: string;
  center: Configuration;
  F: number;
  pragmaticValue: number; // expected F reduction
  description: string;
}

export interface Threat {
  id: string;
  center: Configuration;
  F: number;
  severity: number;
  source: string;
}

export interface S4Field {
  scope: Scope;
  F: number;              // aggregate free energy
  gaps: CapabilityGap[];
  opportunities: Opportunity[];
  threats: Threat[];
  timestamp: number;
}

// =============================================================================
// Parameters
// =============================================================================

export interface DynamicsParameters {
  β_base: number;              // base inverse temperature (default: 1.0)
  γ: number;                   // exploration coefficient (default: 0.1)
  learningThreshold: number;   // samples for full τ confidence (default: 20)
  invocationThreshold: number; // F above this triggers invocation (default: 0)
  perceptionThreshold: number; // F below this triggers perception (default: -10)
  τChangeThreshold: number;    // emit event if |Δτ| > this (default: 0.05)
  verboseEvents: boolean;      // emit all events vs state changes only
}

export const DEFAULT_PARAMETERS: DynamicsParameters = {
  β_base: 1.0,
  γ: 0.1,
  learningThreshold: 20,
  invocationThreshold: 0,
  perceptionThreshold: -10,
  τChangeThreshold: 0.05,
  verboseEvents: false,
};
