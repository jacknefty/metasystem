/**
 * Vote — Scale-free voting mechanics
 *
 * weight = (2ψ - 1) × stake × τ
 * ψ = exp(-β × G)
 * G = F + γH
 */

import type { Scope } from '../../control/dynamics/types.js';
import { scopeId } from '../../control/dynamics/types.js';
import { isWithin } from '../../identity/scoped-paths.js';
import type { Proposal, Vote, VotingPower } from './types.js';
import { getChain } from '../channels/chain.js';
import { getVotingPower, getTotalContribution } from './power.js';
import { getReputation } from '../resources/pool.js';
import { loadIdentity } from '../../identity/contract.js';

const γ = 0.3;

export async function castVote(
  voter: string,
  proposalId: string,
  scope: Scope
): Promise<Vote> {
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  const power = await getVotingPower(voter, scope);
  const G = await estimateG(proposal, voter, power);
  // Sigmoid: bounded ψ ∈ [0,1], ultrastable
  const ψ = 1 / (1 + Math.exp(power.β * G));
  const weight = (2 * ψ - 1) * power.contribution * power.τ;

  const vote: Vote = {
    voter,
    proposal: proposalId,
    weight,
    G,
    ψ,
    timestamp: Date.now(),
  };

  await getChain().append('vote:cast', voter, proposalId, vote);

  return vote;
}

export async function autoVote(
  voter: string,
  proposalId: string
): Promise<Vote | null> {
  const proposal = await getProposal(proposalId);
  if (!proposal) return null;

  return castVote(voter, proposalId, proposal.scope);
}

async function estimateG(
  proposal: Proposal,
  voterId: string,
  power: VotingPower
): Promise<number> {
  const F = await estimateFreeEnergyReduction(proposal, voterId, power);
  const H = await estimateUncertainty(proposal);
  return F + γ * H;
}

async function estimateFreeEnergyReduction(
  proposal: Proposal,
  voterId: string,
  power: VotingPower
): Promise<number> {
  const totalContribution = await getTotalContribution(proposal.scope);
  const voterShare = totalContribution > 0 ? power.contribution / totalContribution : 0;
  const cost = proposal.resourcesRequested * voterShare;

  const relevance = computeRelevance(proposal, voterId);
  const benefit = relevance * proposal.resourcesRequested;

  return cost - benefit;
}

/**
 * Compute relevance of a proposal to a voter.
 * Scale-free: based on variety intersection, not path sniffing or depth.
 *
 * relevance = overlap(voter_scopes, proposal_scope) / total_voter_scopes
 */
function computeRelevance(proposal: Proposal, voterId: string): number {
  const proposalPath = proposal.scope.root();
  const id = scopeId(proposal.scope);

  // Self-relevance: proposal directly about this voter's identity
  if (id === voterId) {
    return 1.0;
  }

  // Check membership overlap
  const identity = loadIdentity(voterId);
  if (!identity?.frontmatter.memberships?.length) {
    // No memberships = minimal relevance (outsider)
    return 0.1;
  }

  const memberships = identity.frontmatter.memberships;
  let overlapCount = 0;

  for (const membership of memberships) {
    // Direct membership in proposal scope
    if (membership.context === id) {
      overlapCount += 1;
      continue;
    }

    // Voter's membership scope contains or is contained by proposal scope
    const memberPath = `/contexts/${membership.context}`;
    if (isWithin(proposalPath, proposal.scope) || proposalPath.startsWith(memberPath) || memberPath.startsWith(proposalPath)) {
      overlapCount += 0.5; // Partial overlap
    }
  }

  // Relevance = overlap ratio, clamped to [0.1, 1.0]
  const relevance = overlapCount / memberships.length;
  return Math.max(0.1, Math.min(1.0, relevance));
}

/**
 * Estimate uncertainty about a proposal's outcome.
 * Scale-free: derived from historical success rate at this scope, not type constants.
 *
 * H = novelty × (1 - proposer_track_record)
 * novelty = 1 - (successful_proposals_at_scope / total_proposals_at_scope)
 */
async function estimateUncertainty(proposal: Proposal): Promise<number> {
  // Get historical proposals at this scope to compute novelty
  const scopePath = proposal.scope.root();
  const allProposals = await getChain().recall({ type: 'proposal:created' });
  const executedProposals = await getChain().recall({ type: 'proposal:executed' });

  // Filter proposals at or within this scope
  const scopeProposals = allProposals.filter(e => {
    const p = e.payload as { scope?: Scope };
    return p.scope?.root()?.startsWith(scopePath);
  });

  const successfulIds = new Set(
    executedProposals
      .filter(e => {
        const p = e.payload as { success?: boolean };
        return p.success === true;
      })
      .map(e => e.subject)
  );

  const successful = scopeProposals.filter(e => {
    const p = e.payload as { id?: string };
    return p.id && successfulIds.has(p.id);
  }).length;

  const total = scopeProposals.length || 1;

  // Novelty: less history = more uncertain
  const novelty = 1 - (successful / total);

  // Proposer track record
  const reputation = await getReputation(proposal.proposer);
  const trackRecord = reputation.completionRate;

  return novelty * (1 - trackRecord);
}

async function getProposal(id: string): Promise<Proposal | null> {
  const events = await getChain().recall({ type: 'proposal:created' });
  const event = events.find(e => {
    const p = e.payload as { id?: string };
    return p.id === id;
  });

  if (!event) return null;
  return event.payload as Proposal;
}

export async function getVotes(proposalId: string): Promise<Vote[]> {
  const events = await getChain().recall({ type: 'vote:cast' });

  return events
    .filter(e => {
      const p = e.payload as { proposal?: string };
      return p.proposal === proposalId;
    })
    .map(e => e.payload as Vote);
}
