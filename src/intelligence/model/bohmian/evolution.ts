/**
 * Bohmian Evolution
 *
 * Guiding equation — evolve agents through configuration space.
 */

import { getBohmianState, updateBohmianState, computeConfiguration, computeMass } from './state.js';
import { buildWaveFunction } from './wave.js';
import { getS4Field } from './field.js';
import type { Configuration, BohmianState } from './types.js';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function evolveAgent(nodeId: string, dt: number): Promise<BohmianState> {
  const state = await getBohmianState(nodeId);
  const Q = await computeConfiguration(nodeId);
  const field = await getS4Field();
  const mass = await computeMass(nodeId);

  const wave = buildWaveFunction(field, mass);
  const velocity = wave.velocity(Q);

  const newQ: Configuration = {
    verified: clamp(Q.verified + velocity.verified * dt / mass, 0, 1),
    active: clamp(Q.active + velocity.active * dt / mass, 0, 1),
    resources: clamp(Q.resources + velocity.resources * dt / mass, 0, 1),
  };

  const newState: BohmianState = {
    nodeId,
    Q: newQ,
    velocity,
    quantumPotential: wave.potential(Q),
    mass,
    lastEvolved: Date.now(),
  };

  await updateBohmianState(nodeId, newState);

  return newState;
}

export async function evolveAllAgents(dt: number): Promise<BohmianState[]> {
  const { listNodes } = await import('../../../identity/node.js');
  const nodes = await listNodes({ status: 'active' });

  const states: BohmianState[] = [];
  for (const node of nodes) {
    const state = await evolveAgent(node.id, dt);
    states.push(state);
  }

  return states;
}
