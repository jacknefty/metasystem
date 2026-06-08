/**
 * Wave Function Computation
 *
 * Amplitude, phase, velocity, quantum potential.
 */

import type { Configuration, WaveFunction, Vector, IntelligenceField } from './types.js';

export function computeAmplitude(q: Configuration, field: IntelligenceField): number {
  let R = 1.0;

  // Resource constraint — can't operate without budget
  if (q.resources < 0.1) R *= 0.1;

  // Overload penalty — diminishing returns past capacity
  if (q.active > 0.8) R *= (1.0 - (q.active - 0.8) * 2);

  // Capability gaps — zero amplitude in gap regions
  for (const gap of field.gaps) {
    const dist = distance(q, gap.center);
    if (dist < gap.radius) R *= 0.0;
  }

  // Threats — reduced amplitude near threat regions
  for (const threat of field.threats) {
    const dist = distance(q, threat.center);
    if (dist < threat.radius) {
      R *= dist / threat.radius;
    }
  }

  // Opportunities — boosted amplitude near opportunities
  for (const opp of field.opportunities) {
    const dist = distance(q, opp.center);
    if (dist < opp.radius) {
      R *= 1.0 + (1.0 - dist / opp.radius) * opp.boost;
    }
  }

  return Math.max(0, Math.min(1, R));
}

export function computePhase(q: Configuration, values: Vector): number {
  return q.verified * values.verified +
         q.active * values.active +
         q.resources * values.resources;
}

export function computeVelocity(
  q: Configuration,
  wave: WaveFunction,
  mass: number
): Vector {
  const epsilon = 0.01;

  const dS_dV = (wave.phase({ ...q, verified: q.verified + epsilon }) - wave.phase(q)) / epsilon;
  const dS_dA = (wave.phase({ ...q, active: q.active + epsilon }) - wave.phase(q)) / epsilon;
  const dS_dR = (wave.phase({ ...q, resources: q.resources + epsilon }) - wave.phase(q)) / epsilon;

  return {
    verified: dS_dV / mass,
    active: dS_dA / mass,
    resources: dS_dR / mass,
  };
}

export function computeQuantumPotential(q: Configuration, wave: WaveFunction): number {
  const R = wave.amplitude(q);
  if (R < 0.01) return Infinity;

  const epsilon = 0.01;

  const d2R = (dim: keyof Configuration) => {
    const qPlus = { ...q, [dim]: Math.min(1, q[dim] + epsilon) };
    const qMinus = { ...q, [dim]: Math.max(0, q[dim] - epsilon) };
    return (wave.amplitude(qPlus) + wave.amplitude(qMinus) - 2 * R) / (epsilon * epsilon);
  };

  const laplacianR = d2R('verified') + d2R('active') + d2R('resources');
  return -laplacianR / (2 * R);
}

function distance(a: Configuration, b: Configuration): number {
  return Math.sqrt(
    (a.verified - b.verified) ** 2 +
    (a.active - b.active) ** 2 +
    (a.resources - b.resources) ** 2
  );
}

export function buildWaveFunction(field: IntelligenceField, mass: number): WaveFunction {
  const wave: WaveFunction = {
    amplitude: (q) => computeAmplitude(q, field),
    phase: (q) => computePhase(q, field.values),
    velocity: (q) => computeVelocity(q, wave, mass),
    potential: (q) => computeQuantumPotential(q, wave),
  };
  return wave;
}
