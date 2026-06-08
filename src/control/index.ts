/**
 * Control — Public API
 *
 * Verification, balance/homeostat, dynamics, escalation.
 */

// Balance (Control/Intelligence homeostat)
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

// Escalation (ultrastability ladder)
export {
  checkAndEscalate,
  fireAlarm,
  acknowledgeAlarm,
  canActivateCommand,
  getEscalationState,
  clearEscalationState,
  type EscalationState,
} from './escalation.js';

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
  // Intelligence Field
  buildIntelligenceField,
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
