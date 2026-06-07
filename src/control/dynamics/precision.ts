/**
 * Precision Learning
 *
 * τ(v, S) = prior(v) × (1 - w) + empirical(v, S) × w
 *
 * Precision is learned confidence in a verifier at a given scope.
 * Flows upward with sample counts so network-wide learning is possible.
 */

import { randomUUID } from 'crypto';
import { getChain } from '../../coordination/channels/chain.js';
import type {
  Scope,
  PrecisionRecord,
  Prediction,
  DynamicsParameters,
} from './types.js';
import { scopeKey, getParentScope, DEFAULT_PARAMETERS } from './types.js';

// Re-export types that other modules need
export type { PrecisionRecord } from './types.js';

// In-memory precision store (would be persisted in production)
const precisionStore = new Map<string, PrecisionRecord>();
const predictionStore = new Map<string, Prediction>();

// Verifier priors from registry
const VERIFIER_PRIORS: Record<string, number> = {
  exists: 0.95,
  passes: 0.85,
  meets: 0.80,
  lint: 0.90,
  types: 0.92,
  test: 0.75,
  review: 0.70,
  default: 0.5,
};

function getPrior(verifierType: string): number {
  return VERIFIER_PRIORS[verifierType] ?? VERIFIER_PRIORS.default;
}

function precisionKey(verifierType: string, scope: Scope): string {
  return `τ:${verifierType}:${scopeKey(scope)}`;
}

// =============================================================================
// Precision Retrieval
// =============================================================================

export async function getPrecision(
  verifierType: string,
  scope: Scope,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<PrecisionRecord> {
  const key = precisionKey(verifierType, scope);
  const specific = precisionStore.get(key);

  // If we have enough samples at this scope, use it
  if (specific && specific.samples >= params.learningThreshold) {
    return specific;
  }

  // Fall back through scope hierarchy
  const parent = getParentScope(scope);
  if (parent) {
    const parentPrecision = await getPrecision(verifierType, parent, params);

    // If we have some local samples, blend with parent
    if (specific && specific.samples > 0) {
      return blendPrecision(specific, parentPrecision, params);
    }

    return parentPrecision;
  }

  // Fall back to prior
  const prior = getPrior(verifierType);
  return {
    verifierType,
    scope,
    prior,
    empirical: prior,
    samples: 0,
    τ: prior,
    updatedAt: Date.now(),
  };
}

function blendPrecision(
  local: PrecisionRecord,
  parent: PrecisionRecord,
  params: DynamicsParameters
): PrecisionRecord {
  // Weight local samples against parent's effective samples
  const localWeight = local.samples / params.learningThreshold;
  const parentWeight = 1 - localWeight;

  const blendedτ = local.τ * localWeight + parent.τ * parentWeight;

  return {
    ...local,
    τ: blendedτ,
  };
}

export async function getAggregatePrecision(scope: Scope): Promise<number> {
  // Aggregate τ across all verifier types at this scope
  const verifierTypes = Object.keys(VERIFIER_PRIORS);

  let totalτ = 0;
  let count = 0;

  for (const type of verifierTypes) {
    const precision = await getPrecision(type, scope);
    totalτ += precision.τ;
    count++;
  }

  return count > 0 ? totalτ / count : 0.5;
}

// =============================================================================
// Prediction Recording
// =============================================================================

export type PredictionSource = 'automated' | 'self-assessment' | 'attestation';

const SOURCE_WEIGHTS: Record<PredictionSource, number> = {
  'automated': 1.0,
  'self-assessment': 0.7,
  'attestation': 0.3,
};

export async function recordPrediction(
  workId: string,
  conditionId: string,
  verifierType: string,
  scope: Scope,
  predictedOutcome: number,
  source: PredictionSource,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<string> {
  const id = `pred_${randomUUID().slice(0, 8)}`;

  const prediction: Prediction = {
    id,
    workId,
    conditionId,
    verifierType,
    scope,
    predictedOutcome,
    predictedAt: Date.now(),
    source,
    weight: SOURCE_WEIGHTS[source],
  };

  predictionStore.set(id, prediction);

  if (params.verboseEvents) {
    await getChain().append('precision:prediction', 'dynamics', workId, {
      key: precisionKey(verifierType, scope),
      scopePath: scope.root(),
      predictedOutcome,
      source,
      sourceWeight: SOURCE_WEIGHTS[source],
    });
  }

  return id;
}

export async function recordObservation(
  predictionId: string,
  actualOutcome: number,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<void> {
  const prediction = predictionStore.get(predictionId);
  if (!prediction) return;

  const error = Math.abs(prediction.predictedOutcome - actualOutcome);

  prediction.actualOutcome = actualOutcome;
  prediction.observedAt = Date.now();
  prediction.predictionError = error;

  if (params.verboseEvents) {
    await getChain().append('precision:observation', 'dynamics', predictionId, {
      key: precisionKey(prediction.verifierType, prediction.scope),
      scopePath: prediction.scope.root(),
      actualOutcome,
      predictionId,
      squaredError: error * error,
    });
  }

  // Update precision
  await updatePrecision(
    prediction.verifierType,
    prediction.scope,
    actualOutcome,
    prediction.weight,
    params
  );
}

// =============================================================================
// Precision Update
// =============================================================================

async function updatePrecision(
  verifierType: string,
  scope: Scope,
  outcome: number,
  weight: number,
  params: DynamicsParameters
): Promise<void> {
  const key = precisionKey(verifierType, scope);
  const prior = getPrior(verifierType);

  const current = precisionStore.get(key) ?? {
    verifierType,
    scope,
    prior,
    empirical: prior,
    samples: 0,
    τ: prior,
    updatedAt: Date.now(),
  };

  // Weighted incremental mean update
  const effectiveSamples = current.samples + weight;
  const newEmpirical = current.empirical + (outcome - current.empirical) * (weight / effectiveSamples);

  // Blend prior and empirical based on sample count
  const w = Math.min(effectiveSamples / params.learningThreshold, 1.0);
  const newτ = prior * (1 - w) + newEmpirical * w;

  const oldτ = current.τ;
  const Δτ = Math.abs(newτ - oldτ);

  const updated: PrecisionRecord = {
    ...current,
    empirical: newEmpirical,
    samples: effectiveSamples,
    τ: newτ,
    updatedAt: Date.now(),
  };

  precisionStore.set(key, updated);

  // Emit event if change is significant
  if (Δτ > params.τChangeThreshold) {
    await getChain().append('precision:updated', 'dynamics', scopeKey(scope), {
      key,
      scopePath: scope.root(),
      τ: newτ,
      samples: effectiveSamples,
      runningError: Math.abs(newτ - prior),
    });
  }

  // Propagate to parent scope
  const parent = getParentScope(scope);
  if (parent) {
    await updatePrecision(verifierType, parent, outcome, weight * 0.5, params);
  }
}

// =============================================================================
// Queries
// =============================================================================

export function getPrediction(id: string): Prediction | undefined {
  return predictionStore.get(id);
}

export function getRecentPredictions(
  verifierType: string,
  scope: Scope,
  limit: number = 20
): Prediction[] {
  const predictions: Prediction[] = [];

  for (const p of predictionStore.values()) {
    if (p.verifierType === verifierType && scopeKey(p.scope) === scopeKey(scope)) {
      predictions.push(p);
    }
  }

  return predictions
    .sort((a, b) => b.predictedAt - a.predictedAt)
    .slice(0, limit);
}

export function getPrecisionStats(scope: Scope): {
  verifiers: number;
  totalSamples: number;
  avgτ: number;
  minτ: number;
  maxτ: number;
} {
  const scopeStr = scopeKey(scope);
  let verifiers = 0;
  let totalSamples = 0;
  let sumτ = 0;
  let minτ = 1;
  let maxτ = 0;

  for (const [key, record] of precisionStore) {
    if (key.endsWith(scopeStr)) {
      verifiers++;
      totalSamples += record.samples;
      sumτ += record.τ;
      minτ = Math.min(minτ, record.τ);
      maxτ = Math.max(maxτ, record.τ);
    }
  }

  return {
    verifiers,
    totalSamples,
    avgτ: verifiers > 0 ? sumτ / verifiers : 0.5,
    minτ: verifiers > 0 ? minτ : 0.5,
    maxτ: verifiers > 0 ? maxτ : 0.5,
  };
}

// =============================================================================
// Reset (for testing)
// =============================================================================

export function resetPrecision(): void {
  precisionStore.clear();
  predictionStore.clear();
}
