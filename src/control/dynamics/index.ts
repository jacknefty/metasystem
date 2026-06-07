/**
 * Unified Dynamics — Free Energy + Bohmian Mechanics
 *
 * Scale-free formalism where the same five equations govern behavior
 * at every recursion level: condition, work, context, node, dao, network.
 *
 * Core insight: ψ(Q) = exp(-β × F(Q))
 * The wave function amplitude IS the free energy landscape.
 */

// Types
export * from './types.js';

// Free Energy (F, H, G)
export {
  getFreeEnergy,
  getFreeEnergyState,
  getExpectedFreeEnergy,
  getEpistemicValue,
  gradientG,
  sampleGLandscape,
  interpolateG,
  clearFreeEnergyCache,
  invalidateFreeEnergy,
  // Fix 2: Aggregated F with local/children/total breakdown
  getFreeEnergyAggregate,
  clearAggregateCache,
  invalidateAggregateCache,
  type FreeEnergyAggregateState,
  // Legacy aliases
  gradientFreeEnergy,
  sampleFreeEnergyLandscape,
  interpolateFreeEnergy,
} from './free-energy.js';

// Precision Learning
export {
  getPrecision,
  getAggregatePrecision,
  recordPrediction,
  recordObservation,
  getPrediction,
  getRecentPredictions,
  getPrecisionStats,
  resetPrecision,
  type PredictionSource,
} from './precision.js';

// Wave Function
export {
  buildWaveFunction,
  normalizeAmplitude,
  getProbabilityDensity,
  sampleFromWaveFunction,
} from './wave.js';

// Action Selection
export {
  selectAction,
  getCandidateActions,
} from './action.js';

// Evolution
export {
  getDynamicsState,
  rebuildAgentState,
  evolveAgent,
  evolveAllAgents,
  getModelUncertainty,
  resetDynamicsState,
} from './evolution.js';

// S4 Field
export {
  buildS4Field,
  getNearestGap,
  getBestOpportunity,
  getActiveThreats,
  getFieldSlice,
} from './field.js';

// Token Minting (Phase 5)
export {
  mintOnCompletion,
  getNetworkState,
  refreshNetworkState,
  updateNetworkState,
  resetNetworkState,
  getWorkerBalance,
  getAllBalances,
  resetBalances,
  getTokenMetrics,
  DEFAULT_MINT_CONFIG,
  type NetworkState,
  type MintEvent,
  type MintConfig,
  type TokenMetrics,
} from './mint.js';

// Bridge (Phase 6)
export {
  // Strategy
  getVerificationStrategy,
  getChallengeWindow,
  // Proof
  hashWorkProof,
  hashCreditLeaf,
  // Credit lifecycle
  createCredit,
  submitChallenge,
  confirmCredits,
  // Mint bundle
  prepareMintBundle,
  markCreditsMinted,
  // Queries
  getCredit,
  getCreditsByNode,
  getPendingCredits,
  getMerkleRoot,
  getMerkleProof,
  verifyMerkleProof,
  // Reset
  resetBridge,
  // Types
  type VerificationStrategy,
  type StrategyResult,
  type WorkProof,
  type OutputHash,
  type CreditLeaf,
  type Challenge,
  type MintBundle,
} from './bridge.js';

// =============================================================================
// Convenience: Run dynamics tick
// =============================================================================

import type { Scope, DynamicsState, DynamicsParameters, Action } from './types.js';
import { DEFAULT_PARAMETERS } from './types.js';
import { getFreeEnergy, getExpectedFreeEnergy, getEpistemicValue } from './free-energy.js';
import { evolveAgent } from './evolution.js';
import { selectAction, getCandidateActions } from './action.js';

export interface DynamicsTick {
  state: DynamicsState;
  F: number;
  H: number;
  G: number;
  selectedAction: Action | null;
}

export async function runDynamicsTick(
  nodeId: string,
  scope: Scope,
  dt: number = 1.0,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<DynamicsTick> {
  // Evolve agent state
  const state = await evolveAgent(nodeId, dt, scope, params);

  // Get current F, H, G
  const F = await getFreeEnergy(scope);
  const H = await getEpistemicValue(scope, params);
  const G = F + params.γ * H;

  // Determine if action needed (thresholds apply to F, not G)
  let selectedAction: Action | null = null;

  if (F > params.invocationThreshold) {
    // High F: look for work to claim
    const candidates = await getCandidateActions('claim-work', scope);
    selectedAction = await selectAction(scope, candidates, params);
  } else if (F < params.perceptionThreshold) {
    // Low F: invoke perception
    const candidates = await getCandidateActions('invoke-perception', scope);
    selectedAction = await selectAction(scope, candidates, params);
  }

  return { state, F, H, G, selectedAction };
}

// =============================================================================
// Integration with existing homeostat
// =============================================================================

export async function dynamicsHomeostat(
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<{
  F: number;
  H: number;
  G: number;
  action: 'invoke' | 'perceive' | 'equilibrium';
  selectedWork: string | null;
}> {
  const scope: Scope = { level: 'network' };
  const F = await getFreeEnergy(scope);
  const H = await getEpistemicValue(scope, params);
  const G = F + params.γ * H;

  if (F > params.invocationThreshold) {
    const candidates = await getCandidateActions('claim-work', scope);
    const selected = await selectAction(scope, candidates, params);
    return {
      F,
      H,
      G,
      action: 'invoke',
      selectedWork: selected?.target ?? null,
    };
  }

  if (F < params.perceptionThreshold) {
    return {
      F,
      H,
      G,
      action: 'perceive',
      selectedWork: null,
    };
  }

  return {
    F,
    H,
    G,
    action: 'equilibrium',
    selectedWork: null,
  };
}
