/**
 * Threshold Computation — Scale-free approval thresholds
 *
 * Threshold scales with resource ratio: larger asks need stronger consensus.
 */

import type { Scope } from '../../control/dynamics/types.js';
import type { Proposal, ApprovalResult, Vote } from './types.js';
import { DEFAULT_QUORUM } from './types.js';
import { getResourcesAtScope, getVotersAtScope, getTotalContribution } from './power.js';
import { loadIdentity } from '../../identity/contract.js';
import { getChain } from '../channels/chain.js';

export async function computeThreshold(proposal: Proposal): Promise<number> {
  const totalResources = await getResourcesAtScope(proposal.scope);
  const resourceRatio = proposal.resourcesRequested / Math.max(totalResources, 1);

  const baseThreshold = 0.5;
  const scaleFactor = 0.3;

  const threshold = baseThreshold + scaleFactor * resourceRatio;
  return Math.min(threshold, 0.95);
}

export function getQuorum(scope: Scope): number {
  if (scope.level === 'node' || scope.level === 'work' || scope.level === 'condition') {
    return DEFAULT_QUORUM;
  }

  if (!('id' in scope)) {
    return DEFAULT_QUORUM;
  }

  const identity = loadIdentity(scope.id);
  if (!identity) return DEFAULT_QUORUM;

  const override = identity.resources['Quorum'];
  if (override) {
    const parsed = parseFloat(override);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 1) {
      return parsed;
    }
  }

  return DEFAULT_QUORUM;
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
