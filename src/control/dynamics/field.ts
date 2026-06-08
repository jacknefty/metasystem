/**
 * Intelligence Field — Derived from Free Energy
 *
 * Gaps, opportunities, threats are interpretations of the F landscape:
 * - Gaps = high F regions we've never explored (high epistemic value)
 * - Opportunities = low F with high bounty (high pragmatic value)
 * - Threats = sudden F spikes (algedonic signals)
 */

import { getChain } from '../../coordination/channels/chain.js';
import { listWork, listAvailableWork } from '../../coordination/resources/work.js';
import type {
  Scope,
  Configuration,
  IntelligenceField,
  CapabilityGap,
  Opportunity,
  Threat,
} from './types.js';
import { getFreeEnergy, sampleFreeEnergyLandscape, interpolateFreeEnergy } from './free-energy.js';
import { getAggregatePrecision, getPrecisionStats } from './precision.js';

// =============================================================================
// Field Construction
// =============================================================================

export async function buildIntelligenceField(scope: Scope): Promise<IntelligenceField> {
  const [F, gaps, opportunities, threats] = await Promise.all([
    getFreeEnergy(scope),
    buildGaps(scope),
    buildOpportunities(scope),
    buildThreats(scope),
  ]);

  return {
    scope,
    F,
    gaps,
    opportunities,
    threats,
    timestamp: Date.now(),
  };
}

// =============================================================================
// Gaps — High F + High Epistemic Value
// =============================================================================

async function buildGaps(scope: Scope): Promise<CapabilityGap[]> {
  const gaps: CapabilityGap[] = [];

  // Sample F landscape to find high-F regions
  const landscape = await sampleFreeEnergyLandscape(scope, 5);
  const stats = getPrecisionStats(scope);

  // Find regions where F is high and we have low sample count
  const threshold = await getFreeEnergy(scope) * 0.5;

  for (const [key, F] of landscape) {
    if (F < threshold) continue;

    const [v, a, r] = key.split(':').map(parseFloat);
    const center: Configuration = { verified: v, active: a, resources: r };

    // Epistemic value based on how uncertain we are about this region
    const epistemicValue = 1 - Math.min(stats.totalSamples / 100, 1);

    if (epistemicValue > 0.3) {
      gaps.push({
        id: `gap_${key}`,
        center,
        radius: 0.2,
        F,
        epistemicValue,
        description: `Unexplored region with F=${F.toFixed(1)}`,
      });
    }
  }

  // Dedupe nearby gaps
  return dedupeByProximity(gaps, 0.3);
}

function dedupeByProximity<T extends { center: Configuration }>(
  items: T[],
  threshold: number
): T[] {
  const result: T[] = [];

  for (const item of items) {
    const tooClose = result.some(existing =>
      distance(existing.center, item.center) < threshold
    );
    if (!tooClose) {
      result.push(item);
    }
  }

  return result;
}

function distance(a: Configuration, b: Configuration): number {
  return Math.sqrt(
    (a.verified - b.verified) ** 2 +
    (a.active - b.active) ** 2 +
    (a.resources - b.resources) ** 2
  );
}

// =============================================================================
// Opportunities — Low F + High Bounty
// =============================================================================

async function buildOpportunities(scope: Scope): Promise<Opportunity[]> {
  const available = await listAvailableWork();

  return available
    .filter(w => w.bounty && w.bounty.amount > 20)
    .map(w => {
      // Estimate F for this work
      const conditions = w.conditions || [];
      const unmetWeight = conditions
        .filter(c => !c.met)
        .reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);

      return {
        id: `opp_${w.id}`,
        center: { verified: 0.5, active: 0.3, resources: 0.7 },
        F: unmetWeight,
        pragmaticValue: w.bounty!.amount - unmetWeight,
        description: `Work: ${w.name} (${w.bounty!.amount} bits)`,
      };
    })
    .filter(o => o.pragmaticValue > 0)
    .sort((a, b) => b.pragmaticValue - a.pragmaticValue)
    .slice(0, 10);
}

// =============================================================================
// Threats — Sudden F Spikes (Algedonic)
// =============================================================================

async function buildThreats(scope: Scope): Promise<Threat[]> {
  const events = await getChain().recall({ type: 'algedonic:pain' });
  const recent = events.filter(e => Date.now() - e.timestamp < 3600000);

  return recent.map(e => {
    const payload = e.payload as {
      severity: number;
      source: string;
      message: string;
    };

    // Map algedonic severity to F spike
    const F = payload.severity * 20;

    return {
      id: `threat_${e.id}`,
      center: { verified: 0.3, active: 0.8, resources: 0.2 },
      F,
      severity: payload.severity / 3,
      source: payload.source,
    };
  });
}

// =============================================================================
// Field Queries
// =============================================================================

export async function getNearestGap(
  scope: Scope,
  Q: Configuration
): Promise<CapabilityGap | null> {
  const field = await buildIntelligenceField(scope);

  if (field.gaps.length === 0) return null;

  return field.gaps.reduce((nearest, gap) =>
    distance(gap.center, Q) < distance(nearest.center, Q) ? gap : nearest
  );
}

export async function getBestOpportunity(
  scope: Scope
): Promise<Opportunity | null> {
  const field = await buildIntelligenceField(scope);

  if (field.opportunities.length === 0) return null;

  return field.opportunities[0]; // Already sorted by pragmatic value
}

export async function getActiveThreats(
  scope: Scope
): Promise<Threat[]> {
  const field = await buildIntelligenceField(scope);
  return field.threats.filter(t => t.severity > 0.3);
}

// =============================================================================
// Field Visualization (for debugging/UI)
// =============================================================================

export interface FieldSlice {
  dimension: 'verified' | 'active' | 'resources';
  fixedValue: number;
  points: Array<{ x: number; y: number; F: number }>;
}

export async function getFieldSlice(
  scope: Scope,
  dimension: 'verified' | 'active' | 'resources',
  fixedValue: number,
  resolution: number = 10
): Promise<FieldSlice> {
  const landscape = await sampleFreeEnergyLandscape(scope, resolution);
  const points: Array<{ x: number; y: number; F: number }> = [];

  const dims = ['verified', 'active', 'resources'].filter(d => d !== dimension) as
    Array<keyof Configuration>;

  for (let i = 0; i <= 1; i += 1 / resolution) {
    for (let j = 0; j <= 1; j += 1 / resolution) {
      const Q: Configuration = {
        verified: 0,
        active: 0,
        resources: 0,
        [dimension]: fixedValue,
        [dims[0]]: i,
        [dims[1]]: j,
      };

      const F = interpolateFreeEnergy(landscape, Q);
      points.push({ x: i, y: j, F });
    }
  }

  return { dimension, fixedValue, points };
}
