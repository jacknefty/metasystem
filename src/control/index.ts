/**
 * Control — Public API (S3)
 *
 * Verification, balance/homeostat, dynamics.
 */

// Balance (S3/S4 homeostat)
export {
  invokeAvailableNodes,
  invokePerception,
  runDynamicsControlTick,
  type InvocationResult,
  type PerceptionResult,
} from './balance/index.js';

// Verification
export {
  runVerification,
  parseVerifier,
  getCategory,
  verifyCompletion,
  reVerify,
  runChecks,
  type VerifierResult,
} from './verify/index.js';

// Dynamics (re-export key items from dynamics/index.ts)
export {
  // Free Energy
  getFreeEnergy,
  getFreeEnergyState,
  getFreeEnergyAggregate,
  getExpectedFreeEnergy,
  getEpistemicValue,
  clearFreeEnergyCache,
  invalidateFreeEnergy,
  type FreeEnergyAggregateState,
  // Precision
  getPrecision,
  getAggregatePrecision,
  recordPrediction,
  recordObservation,
  // Evolution
  getDynamicsState,
  evolveAgent,
  rebuildAgentState,
  // Action
  selectAction,
  getCandidateActions,
  // S4 Field
  buildS4Field,
  // Mint
  mintOnCompletion,
  getNetworkState,
  // Bridge
  getVerificationStrategy,
  createCredit,
  prepareMintBundle,
  getMerkleRoot,
  getMerkleProof,
  // Types
  type Scope,
  type DynamicsState,
  type DynamicsParameters,
  DEFAULT_PARAMETERS,
} from './dynamics/index.js';
