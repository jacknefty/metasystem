/**
 * Scale-Free Voting Protocol
 *
 * Same governance primitive at DAO, context, and node levels.
 * No level-specific logic — same code, different scope.
 */

export type {
  Proposal,
  ProposalType,
  ProposalStatus,
  Vote,
  VotingPower,
  ApprovalResult,
  ProposalFilter,
} from './types.js';

export { DEFAULT_QUORUM, DEFAULT_VOTING_PERIOD } from './types.js';

export {
  createProposal,
  getProposal,
  listProposals,
  finalizeProposal,
} from './proposal.js';

export type { CreateProposalInput } from './proposal.js';

export { castVote, autoVote, getVotes } from './vote.js';

export {
  computeThreshold,
  getQuorum,
  checkApproval,
} from './threshold.js';

export {
  getVotingPower,
  getVotersAtScope,
  getTotalContribution,
  getResourcesAtScope,
} from './power.js';

export {
  delegate,
  revoke,
  getDelegations,
  getDelegators,
  getEffectiveWeight,
} from './delegate.js';

export type { Delegation } from './delegate.js';
