/**
 * Wave Function — Built from Expected Free Energy Landscape
 *
 * ψ(Q, S) = A(Q, S) × exp(i × φ(Q, S))
 *
 * where:
 *   A(Q, S) = exp(-β × G(Q, S))         amplitude from expected free energy
 *   φ(Q, S) = ∫ G(Q', S) dQ'            phase (path integral)
 *
 * The Bohmian guidance equation emerges: v = -∇G / m
 *
 * Note: We use G (expected free energy) not F (free energy).
 * G = F + γH incorporates both pragmatic (F) and epistemic (H) value.
 */

import type {
  Scope,
  Configuration,
  Vector,
  WaveFunction,
  DynamicsParameters,
} from './types.js';
import { DEFAULT_PARAMETERS, clamp01 } from './types.js';
import { sampleGLandscape, interpolateG } from './free-energy.js';
import { getAggregatePrecision } from './precision.js';

// =============================================================================
// Wave Function Construction
// =============================================================================

export async function buildWaveFunction(
  scope: Scope,
  mass: number,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<WaveFunction> {
  // Get aggregate precision for adaptive β
  const τ_aggregate = await getAggregatePrecision(scope);
  const β = params.β_base * τ_aggregate;

  // Sample G (expected free energy) across configuration space
  const landscape = await sampleGLandscape(scope, 5, params);

  const amplitude = (Q: Configuration): number => {
    const G = interpolateG(landscape, Q);
    return Math.exp(-β * Math.max(0, G));
  };

  const phase = (Q: Configuration): number => {
    // Phase = path integral of G from origin to Q
    return integrateG(landscape, Q);
  };

  const velocity = (Q: Configuration): Vector => {
    const gradG = gradientFromLandscape(landscape, Q);
    return {
      verified: -gradG.verified / mass,
      active: -gradG.active / mass,
      resources: -gradG.resources / mass,
    };
  };

  const potential = (Q: Configuration): number => {
    // Quantum potential = -(ℏ²/2m) × ∇²A/A × τ_aggregate
    // Higher τ = stronger potential = more deterministic
    const A = amplitude(Q);
    if (A < 1e-10) return 0;

    const laplacianA = laplacianAmplitude(landscape, Q, β);
    return -τ_aggregate * laplacianA / (2 * mass * A);
  };

  return { amplitude, phase, velocity, potential };
}

// =============================================================================
// Gradient Computation (∇G)
// =============================================================================

function gradientFromLandscape(
  landscape: Map<string, number>,
  Q: Configuration,
  epsilon: number = 0.1
): Vector {
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

  return {
    verified: dG_dV,
    active: dG_dA,
    resources: dG_dR,
  };
}

// =============================================================================
// Phase Integral (∫G dQ)
// =============================================================================

function integrateG(
  landscape: Map<string, number>,
  Q: Configuration
): number {
  // Numerical integration along path from origin to Q
  // Use midpoint rule with 10 steps
  const steps = 10;
  let integral = 0;

  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const Qi = {
      verified: Q.verified * t,
      active: Q.active * t,
      resources: Q.resources * t,
    };
    const G = interpolateG(landscape, Qi);
    integral += G / steps;
  }

  // Scale by path length
  const pathLength = Math.sqrt(
    Q.verified ** 2 + Q.active ** 2 + Q.resources ** 2
  );

  return integral * pathLength;
}

// =============================================================================
// Laplacian (for Quantum Potential)
// =============================================================================

function laplacianAmplitude(
  landscape: Map<string, number>,
  Q: Configuration,
  β: number,
  epsilon: number = 0.1
): number {
  const amplitude = (q: Configuration): number => {
    const G = interpolateG(landscape, q);
    return Math.exp(-β * Math.max(0, G));
  };

  const A0 = amplitude(Q);

  const d2A = (dim: keyof Configuration): number => {
    const qPlus = { ...Q, [dim]: clamp01(Q[dim] + epsilon) };
    const qMinus = { ...Q, [dim]: clamp01(Q[dim] - epsilon) };
    return (amplitude(qPlus) + amplitude(qMinus) - 2 * A0) / (epsilon * epsilon);
  };

  return d2A('verified') + d2A('active') + d2A('resources');
}

// =============================================================================
// Amplitude Normalization
// =============================================================================

export async function normalizeAmplitude(
  scope: Scope,
  resolution: number = 5,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<number> {
  // Compute normalization constant ∫|ψ|² dQ
  const landscape = await sampleGLandscape(scope, resolution, params);
  const τ_aggregate = await getAggregatePrecision(scope);
  const β = params.β_base * τ_aggregate;

  let integral = 0;
  const step = 1 / resolution;

  for (let v = 0; v <= 1; v += step) {
    for (let a = 0; a <= 1; a += step) {
      for (let r = 0; r <= 1; r += step) {
        const Q = { verified: v, active: a, resources: r };
        const G = interpolateG(landscape, Q);
        const A = Math.exp(-β * Math.max(0, G));
        integral += A * A * step * step * step;
      }
    }
  }

  return integral;
}

// =============================================================================
// Probability Density
// =============================================================================

export async function getProbabilityDensity(
  scope: Scope,
  Q: Configuration
): Promise<number> {
  const wave = await buildWaveFunction(scope, 1);
  const A = wave.amplitude(Q);
  return A * A;
}

export async function sampleFromWaveFunction(
  scope: Scope,
  count: number = 100
): Promise<Configuration[]> {
  // Importance sampling from |ψ|²
  const wave = await buildWaveFunction(scope, 1);
  const samples: Configuration[] = [];

  // Rejection sampling
  let attempts = 0;
  const maxAttempts = count * 100;

  while (samples.length < count && attempts < maxAttempts) {
    const Q = {
      verified: Math.random(),
      active: Math.random(),
      resources: Math.random(),
    };

    const A = wave.amplitude(Q);
    const p = A * A;

    if (Math.random() < p) {
      samples.push(Q);
    }

    attempts++;
  }

  return samples;
}
