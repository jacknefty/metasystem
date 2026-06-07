/**
 * Governance Types — Scale-Free Voting
 *
 * Re-exports from shared types for backward compatibility.
 * New code should import from 'types/' directly.
 */

// Re-export from shared types
export {
  type ProposalType,
  type ProposalStatus,
  type Proposal,
  type Vote,
  type ApprovalResult,
  type ProposalFilter,
  DEFAULT_VOTING_PERIODS,
  DEFAULT_QUORUM,
} from '../../types/governance.js';

// Re-export VotingPower from dynamics types
export { type VotingPower } from '../../types/dynamics.js';

// Re-export Scope since it's used in governance
export { type Scope } from '../../types/scope.js';
