/**
 * Resources — Public API
 *
 * Work lifecycle, variety accounting, membership.
 */

// Work lifecycle (primary interface)
export {
  createWork,
  postBounty,
  claimWork,
  releaseWork,
  submitWork,
  verifyWork,
  completeWork,
  failWork,
  expireWork,
  getWork,
  listWork,
  listAvailableWork,
  getWorkGraph,
  markConditionMet,
  updateConditionConfidence,
  type CreateWorkInput,
  type WorkFilter,
  type ReleaseReason,
  type WorkGraph,
} from './work.js';

// Membership
export {
  joinHub,
  leaveHub,
  getMembers,
  getMemberships,
  isMember,
} from './membership.js';

// Variety accounting
export {
  emitPerceived,
  emitResolved,
  getBalance,
  getWorkResolution,
  getDiagnosis,
  type VarietyOptions,
} from './variety.js';

// Token/credit operations
export {
  emitVariety,
  queryTokens,
  getResolution,
  getSystemBalance,
  bitsToAmount,
  generateProofHash,
  mintCredit,
  getPendingCredits,
  computeTokenId,
  type VarietyDomain,
  type VarietyDirection,
  type VarietyToken,
  type Resolution,
  type PendingCredit,
  type SystemBalance,
} from './token.js';

// Pool (work selection)
export {
  findClaimableWork,
  getReputation,
  getNodeClaims,
  type PooledWork,
} from './pool.js';

// Derive (for internal use — types only exposed)
export type {
  DerivedWork,
  DerivedNode,
  DerivedCondition,
  WorkStatus,
  BountyStatus,
} from './derive.js';
