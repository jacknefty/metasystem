/**
 * Verify — Public API
 *
 * Verification runner, registry, completion checks.
 */

// Runner
export { runVerification } from './runner.js';

// Registry
export {
  parseVerifier,
  getCategory,
  inferWeight,
  isAutonomous,
  getMaxConfidence,
  type VerifierFunction,
  type VerifierCategory,
  type VerifierDef,
} from './registry.js';

// Types
export type { VerifierResult, ConditionInput, VerifyContext } from './types.js';

// Completion (Control verification)
export { verifyCompletion, reVerify, runChecks } from './completion.js';
