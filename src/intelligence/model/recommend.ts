/**
 * Intelligence Recommend — Surface opportunities and threats
 *
 * Synthesizes trends, projections, and simulations
 * into actionable recommendations.
 */

import { analyzeTrends, type ScopeTrends, type TrendDirection } from './trends.js';
import { projectState, hasImminentIssue, type ScopeProjection } from './project.js';
import { simulate, suggestScenarios, type SimulationResult } from './simulate.js';
import { loadSpine, sumOverflow } from '../../identity/spine.js';
import { at, listChildren } from '../../identity/scoped-paths.js';
import { getChain } from '../../coordination/channels/chain.js';

export interface Opportunity {
  id: string;
  type: 'completion' | 'reallocation' | 'scope_change' | 'capacity';
  summary: string;
  impact: number;
  effort: 'low' | 'medium' | 'high';
  scopeId?: string;
}

export interface Threat {
  id: string;
  type: 'escalation' | 'capacity' | 'drift' | 'stagnation';
  summary: string;
  severity: 1 | 2 | 3;
  timeframe: string | null;
  scopeId?: string;
}

export interface Recommendation {
  action: string;
  rationale: string;
  urgency: 'immediate' | 'soon' | 'consider';
  simulation?: SimulationResult;
}

export interface IntelligenceOutlook {
  scopeId: string;
  trend: TrendDirection;
  trendEmoji: string;
  projection: string | null;
  opportunities: Opportunity[];
  threats: Threat[];
  recommendations: Recommendation[];
  analyzedAt: number;
}

export async function generateOutlook(scopePath: string): Promise<IntelligenceOutlook> {
  const [trends, projection] = await Promise.all([
    analyzeTrends(scopePath),
    projectState(scopePath),
  ]);

  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const currentF = spine ? sumOverflow(spine) : 0;

  const opportunities = await findOpportunities(scopePath, trends, currentF);
  const threats = await findThreats(scopePath, trends, projection);
  const recommendations = await generateRecommendations(scopePath, trends, projection, currentF);

  // Format projection
  let projectionText: string | null = null;
  if (projection.escalationProjection.timeUntilHit) {
    projectionText = `Escalation in ${projection.escalationProjection.timeUntilHit}`;
  } else if (projection.capacityProjection.timeUntilHit) {
    projectionText = `Capacity limit in ${projection.capacityProjection.timeUntilHit}`;
  }

  const trendEmojis: Record<TrendDirection, string> = {
    improving: '📈',
    stable: '➡️',
    degrading: '📉',
    oscillating: '〰️',
  };

  return {
    scopeId: scopePath,
    trend: trends.overallHealth,
    trendEmoji: trendEmojis[trends.overallHealth],
    projection: projectionText,
    opportunities,
    threats,
    recommendations,
    analyzedAt: Date.now(),
  };
}

async function findOpportunities(
  scopePath: string,
  trends: ScopeTrends,
  currentF: number
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];
  const chain = getChain();

  // Check for work nearing completion
  const recentWork = await chain.recall({
    type: ['work:claimed', 'work:submitted'],
    limit: 20,
  });

  const activeWork = new Map<string, { claimedAt: number }>();
  for (const event of recentWork) {
    if (event.type === 'work:claimed') {
      activeWork.set(event.subject, { claimedAt: event.timestamp });
    }
  }

  const submittedWork = recentWork.filter(e => e.type === 'work:submitted');
  for (const work of submittedWork) {
    opportunities.push({
      id: `completion-${work.subject}`,
      type: 'completion',
      summary: `${work.subject} completing soon`,
      impact: 20, // Estimate F reduction
      effort: 'low',
      scopeId: work.subject,
    });
  }

  // If F is low, opportunity to expand
  if (currentF < 15 && trends.overallHealth !== 'degrading') {
    opportunities.push({
      id: 'expand-scope',
      type: 'scope_change',
      summary: 'System has capacity for scope expansion',
      impact: 30,
      effort: 'medium',
    });
  }

  // If trend is improving, opportunity to take on more
  if (trends.overallHealth === 'improving') {
    opportunities.push({
      id: 'add-work',
      type: 'capacity',
      summary: 'Trend improving — room for additional work',
      impact: 25,
      effort: 'low',
    });
  }

  return opportunities;
}

async function findThreats(
  scopePath: string,
  trends: ScopeTrends,
  projection: ScopeProjection
): Promise<Threat[]> {
  const threats: Threat[] = [];

  // Imminent escalation
  if (hasImminentIssue(projection, 48)) {
    threats.push({
      id: 'escalation-imminent',
      type: 'escalation',
      summary: 'Escalation projected within 48h',
      severity: 3,
      timeframe: projection.escalationProjection.timeUntilHit,
    });
  } else if (hasImminentIssue(projection, 168)) { // 1 week
    threats.push({
      id: 'escalation-warning',
      type: 'escalation',
      summary: 'Escalation projected within 1 week',
      severity: 2,
      timeframe: projection.escalationProjection.timeUntilHit,
    });
  }

  // Capacity threat
  if (projection.capacityProjection.projectedHitTime) {
    const hoursUntil = (projection.capacityProjection.projectedHitTime - Date.now()) / 3600000;
    if (hoursUntil < 24) {
      threats.push({
        id: 'capacity-critical',
        type: 'capacity',
        summary: 'Capacity limit in <24h',
        severity: 3,
        timeframe: projection.capacityProjection.timeUntilHit,
      });
    }
  }

  // Degrading trend
  if (trends.overallHealth === 'degrading') {
    threats.push({
      id: 'trend-degrading',
      type: 'stagnation',
      summary: 'System health degrading',
      severity: 2,
      timeframe: null,
    });
  }

  // Oscillating (instability)
  if (trends.overallHealth === 'oscillating') {
    threats.push({
      id: 'oscillation',
      type: 'stagnation',
      summary: 'System oscillating — possible coordination issue',
      severity: 1,
      timeframe: null,
    });
  }

  // Check children for threats
  const scope = at(scopePath);
  const children = await listChildren(scope);

  for (const child of children.slice(0, 5)) {
    const childSpine = loadSpine(child);
    if (childSpine) {
      const childF = sumOverflow(childSpine);
      if (childF > 50) {
        threats.push({
          id: `child-critical-${childSpine.scopeId}`,
          type: 'escalation',
          summary: `Child ${childSpine.scopeId} at critical F (${childF.toFixed(0)})`,
          severity: 2,
          timeframe: null,
          scopeId: child.root(),
        });
      }
    }
  }

  return threats;
}

async function generateRecommendations(
  scopePath: string,
  trends: ScopeTrends,
  projection: ScopeProjection,
  currentF: number
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Imminent escalation — urgent action needed
  if (hasImminentIssue(projection, 48)) {
    const scenarios = suggestScenarios(currentF);
    if (scenarios.length > 0) {
      const sim = await simulate(scopePath, scenarios[0]);
      recommendations.push({
        action: scenarios[0].description,
        rationale: 'Prevents projected escalation',
        urgency: 'immediate',
        simulation: sim,
      });
    } else {
      recommendations.push({
        action: 'Consider scope narrowing or capacity increase',
        rationale: 'Escalation projected soon — preemptive action recommended',
        urgency: 'immediate',
      });
    }
  }

  // Degrading trend — act soon
  if (trends.overallHealth === 'degrading' && !hasImminentIssue(projection, 48)) {
    recommendations.push({
      action: 'Review recent changes and workload',
      rationale: 'Trend is degrading — early intervention is easier',
      urgency: 'soon',
    });
  }

  // Healthy system — consider expansion
  if (currentF < 15 && trends.overallHealth === 'improving') {
    recommendations.push({
      action: 'Consider taking on additional scope',
      rationale: 'System is healthy with improving trend — capacity available',
      urgency: 'consider',
    });
  }

  // Oscillating — coordination check
  if (trends.overallHealth === 'oscillating') {
    recommendations.push({
      action: 'Check Coordination channels',
      rationale: 'Oscillation often indicates coordination issues between siblings',
      urgency: 'soon',
    });
  }

  return recommendations;
}
