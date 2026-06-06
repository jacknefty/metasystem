/**
 * Bohmian State — Per-agent state storage
 *
 * State derived from chain events (bohmian:evolved).
 */

import { getChain } from '../../../coordination/channels/chain.js';
import { listWork } from '../../../coordination/resources/work.js';
import { getNodeClaims, getReputation } from '../../../coordination/resources/pool.js';
import type { Configuration, BohmianState, Vector } from './types.js';

const AGENT_CAPACITY = 5;

const DEFAULT_STATE: Omit<BohmianState, 'nodeId'> = {
  Q: { verified: 0.5, active: 0, resources: 1.0 },
  velocity: { verified: 0, active: 0, resources: 0 },
  quantumPotential: 0,
  mass: 1,
  lastEvolved: 0,
};

export async function getBohmianState(nodeId: string): Promise<BohmianState> {
  const events = await getChain().recall({ subject: nodeId, type: 'bohmian:evolved' });

  if (events.length === 0) {
    return { nodeId, ...DEFAULT_STATE };
  }

  const latest = events[events.length - 1];
  const payload = latest.payload as {
    Q: Configuration;
    velocity: Vector;
    quantumPotential: number;
    mass: number;
  };

  return {
    nodeId,
    Q: payload.Q,
    velocity: payload.velocity,
    quantumPotential: payload.quantumPotential,
    mass: payload.mass,
    lastEvolved: latest.timestamp,
  };
}

export async function updateBohmianState(
  nodeId: string,
  state: BohmianState
): Promise<void> {
  await getChain().append('bohmian:evolved', 'bohmian', nodeId, {
    Q: state.Q,
    velocity: state.velocity,
    quantumPotential: state.quantumPotential,
    mass: state.mass,
  });
}

export async function computeConfiguration(nodeId: string): Promise<Configuration> {
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
    active: active / AGENT_CAPACITY,
    resources: 1.0 - (reputation.totalEarned / 10000),
  };
}

export async function computeMass(nodeId: string): Promise<number> {
  const reputation = await getReputation(nodeId);
  return 1 + reputation.totalEarned * 0.001;
}
