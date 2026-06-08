/**
 * Intelligence Field — Build field from chain events
 *
 * Gaps, opportunities, threats derived from events.
 */

import { getChain } from '../../../coordination/channels/chain.js';
import { listWork, listAvailableWork } from '../../../coordination/resources/work.js';
import type { IntelligenceField, CapabilityGap, Opportunity, Threat, Configuration } from './types.js';
import { analyzeEmptyBranches } from './learning.js';

export async function getIntelligenceField(): Promise<IntelligenceField> {
  const [gaps, opportunities, threats] = await Promise.all([
    buildGaps(),
    buildOpportunities(),
    buildThreats(),
  ]);

  return {
    gaps,
    opportunities,
    threats,
    values: { verified: 0.5, active: 0.3, resources: 0.2 },
    timestamp: Date.now(),
  };
}

async function buildGaps(): Promise<CapabilityGap[]> {
  // Gaps from empty branch analysis
  return analyzeEmptyBranches();
}

async function buildOpportunities(): Promise<Opportunity[]> {
  // High-bounty posted work = opportunities
  const available = await listAvailableWork();

  return available
    .filter(w => w.bounty && w.bounty.amount > 20)
    .map(w => ({
      id: `opp_${w.id}`,
      center: { verified: 0.5, active: 0.3, resources: 0.7 },
      radius: 0.3,
      boost: Math.min(w.bounty!.amount / 100, 0.5),
      description: `High-value work: ${w.name}`,
    }));
}

async function buildThreats(): Promise<Threat[]> {
  // Recent algedonic:pain events = threats
  const events = await getChain().recall({ type: 'algedonic:pain' });
  const recent = events.filter(e => Date.now() - e.timestamp < 3600000);

  return recent.map(e => {
    const payload = e.payload as { severity: number; source: string; message: string };
    return {
      id: `threat_${e.id}`,
      center: { verified: 0.3, active: 0.8, resources: 0.2 },
      radius: 0.2,
      severity: payload.severity / 3,
      description: payload.message,
    };
  });
}
