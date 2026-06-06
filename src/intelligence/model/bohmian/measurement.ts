/**
 * Measurement — Wave collapse on verification
 *
 * When work is verified, the wave collapses to reveal truth.
 */

import { getBohmianState } from './state.js';
import { recordEmptyBranches } from './learning.js';
import type { Measurement, EmptyBranch } from './types.js';

export async function measureWork(
  nodeId: string,
  workId: string,
  verifiedConditions: string[],
  allConditions: string[]
): Promise<Measurement> {
  const state = await getBohmianState(nodeId);

  // Token multiplier based on quantum potential
  // Higher potential = harder position = more reward
  const tokenMultiplier = 1 + Math.min(state.quantumPotential * 0.1, 1);

  // Record empty branches for S4 learning
  const emptyBranches: EmptyBranch[] = [];
  for (const condId of allConditions) {
    if (!verifiedConditions.includes(condId)) {
      emptyBranches.push({
        conditionId: condId,
        configAtFork: state.Q,
        reason: 'Condition not met at measurement',
      });
    }
  }

  recordEmptyBranches(workId, emptyBranches);

  return {
    Q: state.Q,
    quantumPotential: state.quantumPotential,
    tokenMultiplier,
    collapsedBranch: verifiedConditions,
    emptyBranches,
  };
}

export function calculateTokenMultiplier(quantumPotential: number): number {
  return 1 + Math.min(quantumPotential * 0.1, 1);
}
