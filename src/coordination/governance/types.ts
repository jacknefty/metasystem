/**
 * Governance Types — Scale-Free Voting
 *
 * Same types work at dao, context, node levels.
 * No level-specific logic.
 */

import type { Scope } from '../../control/dynamics/types.js';

export type ProposalType = 'context' | 'work' | 'claim' | 'amendment';
export type ProposalStatus = 'open' | 'passed' | 'rejected' | 'expired';

export interface Proposal {
  id: string;
  type: ProposalType;
  scope: Scope;
  proposer: string;
  target: string;
  resourcesRequested: number;
  deadline: number;
  status: ProposalStatus;
  createdAt: number;
}

export interface Vote {
  voter: string;
  proposal: string;
  weight: number;
  G: number;
  ψ: number;
  timestamp: number;
}

export interface VotingPower {
  identity: string;
  contribution: number;
  τ: number;
  β: number;
}

export interface ApprovalResult {
  passed: boolean;
  totalWeight: number;
  threshold: number;
  quorum: number;
  participation: number;
  forWeight: number;
  againstWeight: number;
}

export interface ProposalFilter {
  scope?: Scope;
  status?: ProposalStatus;
  type?: ProposalType;
  proposer?: string;
}

export const DEFAULT_VOTING_PERIODS: Record<Scope['level'], number> = {
  dao: 7 * 24 * 60 * 60 * 1000,
  context: 3 * 24 * 60 * 60 * 1000,
  node: 24 * 60 * 60 * 1000,
  work: 24 * 60 * 60 * 1000,
  condition: 60 * 60 * 1000,
  network: 14 * 24 * 60 * 60 * 1000,
};

export const DEFAULT_QUORUM = 0.3;
