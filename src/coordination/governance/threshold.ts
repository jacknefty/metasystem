/**
 * Threshold Computation — Scale-free approval thresholds
 *
 * Threshold scales with resource ratio: larger asks need stronger consensus.
 * Quorum and base threshold inherited from scope's identity.md.
 */

import type { Scope } from '../../control/dynamics/types.js';
import type { Proposal, ApprovalResult, Vote } from './types.js';
import { getResourcesAtScope, getVotersAtScope, getTotalContribution } from './power.js';
import { getEffectiveGovernance } from '../../identity/contract.js';
import { getChain } from '../channels/chain.js';

export async function computeThreshold(proposal: Proposal): Promise<number> {
  const governance = getEffectiveGovernance(proposal.scope);
  const totalResources = await getResourcesAtScope(proposal.scope);
  const resourceRatio = proposal.resourcesRequested / Math.max(totalResources, 1);

  const baseThreshold = governance.threshold ?? 0.5;
  const scaleFactor = 0.3;

  const threshold = baseThreshold + scaleFactor * resourceRatio;
  return Math.min(threshold, 0.95);
}

export function getQuorum(scope: Scope): number {
  const governance = getEffectiveGovernance(scope);
  return governance.quorum ?? 0.3;
}

export async function checkApproval(proposal: Proposal): Promise<ApprovalResult> {
  const events = await getChain().recall({ type: 'vote:cast' });

  const votes = events
    .filter(e => {
      const p = e.payload as { proposal?: string };
      return p.proposal === proposal.id;
    })
    .map(e => e.payload as Vote);

  const voters = await getVotersAtScope(proposal.scope);
  const totalContribution = await getTotalContribution(proposal.scope);

  const participatingContribution = votes.reduce((sum, v) => {
    const voter = voters.find(vt => vt.identity === v.voter);
    return sum + (voter?.contribution ?? 0);
  }, 0);

  const participation = totalContribution > 0 ? participatingContribution / totalContribution : 0;
  const quorum = getQuorum(proposal.scope);

  const forWeight = votes
    .filter(v => v.weight > 0)
    .reduce((sum, v) => sum + v.weight, 0);

  const againstWeight = votes
    .filter(v => v.weight < 0)
    .reduce((sum, v) => sum + Math.abs(v.weight), 0);

  const totalWeight = forWeight + againstWeight;
  const threshold = await computeThreshold(proposal);

  const passed =
    participation >= quorum &&
    totalWeight > 0 &&
    forWeight / totalWeight >= threshold;

  return {
    passed,
    totalWeight,
    threshold,
    quorum,
    participation,
    forWeight,
    againstWeight,
  };
}
