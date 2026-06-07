/**
 * Unified Dynamics Types
 *
 * Re-exports from shared types for backward compatibility.
 * New code should import from 'types/' directly.
 */

// Re-export all scope types
export {
  type Scope,
  type Configuration,
  type Vector,
  ZERO_CONFIG,
  ZERO_VECTOR,
  scopeKey,
  getParentScope,
  configKey,
  addVector,
  scaleVector,
  clamp01,
  clampConfig,
} from '../../types/scope.js';

// Re-export all dynamics types
export {
  type FreeEnergyState,
  type FreeEnergyAggregateState,
  type PrecisionRecord,
  type Prediction,
  type VotingPower,
  type DynamicsState,
  type WaveFunction,
  type ActionType,
  type Action,
  type ActionEvaluation,
  type CapabilityGap,
  type Opportunity,
  type Threat,
  type S4Field,
  type DynamicsParameters,
  DEFAULT_PARAMETERS,
} from '../../types/dynamics.js';
