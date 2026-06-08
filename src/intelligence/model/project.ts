/**
 * Intelligence Project — Extrapolate current state forward
 *
 * Uses trends to project when thresholds will be hit.
 * Estimates time to escalation, completion, etc.
 */

import { analyzeTrends, type ScopeTrends, type TrendDirection } from './trends.js';
import { loadSpine, sumOverflow } from '../../identity/spine.js';
import { at } from '../../identity/scoped-paths.js';

export interface Projection {
  metric: string;
  currentValue: number;
  threshold: number;
  projectedHitTime: number | null;
  timeUntilHit: string | null;
  confidence: 'low' | 'medium' | 'high';
  direction: TrendDirection;
}

export interface ScopeProjection {
  scopeId: string;
  escalationProjection: Projection;
  capacityProjection: Projection;
  completionProjection: Projection | null;
  criticalPath: string | null;
  projectedAt: number;
}

const ESCALATION_THRESHOLD = 40; // F threshold for escalation
const CAPACITY_THRESHOLD = 0.9; // 90% capacity utilization

export async function projectState(scopePath: string): Promise<ScopeProjection> {
  const trends = await analyzeTrends(scopePath);
  const scope = at(scopePath);
  const spine = loadSpine(scope);

  const currentF = spine ? sumOverflow(spine) : 0;
  const escalationProjection = projectToThreshold(
    'escalation',
    currentF,
    ESCALATION_THRESHOLD,
    trends.F.slope,
    trends.F.confidence
  );

  // Capacity projection
  let currentCapacityRatio = 0;
  if (spine) {
    const totalCapacity = spine.ingress.capacity + spine.egress.capacity;
    const totalLoad = spine.ingress.currentLoad + spine.egress.currentLoad;
    currentCapacityRatio = totalCapacity > 0 ? totalLoad / totalCapacity : 0;
  }

  const capacityProjection = projectToThreshold(
    'capacity',
    currentCapacityRatio,
    CAPACITY_THRESHOLD,
    trends.varietyFlow.slope * 0.01, // Normalize slope
    trends.varietyFlow.confidence
  );

  // Completion projection (based on work completion rate)
  let completionProjection: Projection | null = null;
  if (trends.workCompletion.points.length > 0) {
    const completionRate = trends.workCompletion.slope;
    if (completionRate > 0) {
      completionProjection = {
        metric: 'completion',
        currentValue: trends.workCompletion.points.length,
        threshold: 10, // Arbitrary target
        projectedHitTime: completionRate > 0
          ? Date.now() + (10 - trends.workCompletion.points.length) / completionRate * 3600000
          : null,
        timeUntilHit: formatTimeUntil(
          completionRate > 0
            ? (10 - trends.workCompletion.points.length) / completionRate * 3600000
            : null
        ),
        confidence: trends.workCompletion.confidence,
        direction: trends.workCompletion.direction,
      };
    }
  }

  // Critical path — what's most likely to fail first
  let criticalPath: string | null = null;
  if (escalationProjection.projectedHitTime && escalationProjection.projectedHitTime < Date.now() + 48 * 3600000) {
    criticalPath = 'escalation';
  } else if (capacityProjection.projectedHitTime && capacityProjection.projectedHitTime < Date.now() + 48 * 3600000) {
    criticalPath = 'capacity';
  }

  return {
    scopeId: scopePath,
    escalationProjection,
    capacityProjection,
    completionProjection,
    criticalPath,
    projectedAt: Date.now(),
  };
}

function projectToThreshold(
  metric: string,
  currentValue: number,
  threshold: number,
  slope: number,
  confidence: 'low' | 'medium' | 'high'
): Projection {
  const direction: TrendDirection = slope > 0.1 ? 'degrading' : slope < -0.1 ? 'improving' : 'stable';

  // If improving or stable, won't hit threshold
  if (slope <= 0 || currentValue >= threshold) {
    return {
      metric,
      currentValue,
      threshold,
      projectedHitTime: currentValue >= threshold ? Date.now() : null,
      timeUntilHit: currentValue >= threshold ? 'now' : null,
      confidence,
      direction,
    };
  }

  // Calculate time to threshold
  const unitsToThreshold = threshold - currentValue;
  const hoursToThreshold = unitsToThreshold / slope;
  const msToThreshold = hoursToThreshold * 3600000;

  return {
    metric,
    currentValue,
    threshold,
    projectedHitTime: Date.now() + msToThreshold,
    timeUntilHit: formatTimeUntil(msToThreshold),
    confidence,
    direction,
  };
}

function formatTimeUntil(ms: number | null): string | null {
  if (ms === null || ms < 0) return null;

  const hours = ms / 3600000;
  if (hours < 1) return '<1h';
  if (hours < 24) return `~${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 7) return `~${Math.round(days)}d`;
  return `~${Math.round(days / 7)}w`;
}

/**
 * Check if any projection indicates imminent issue.
 */
export function hasImminentIssue(projection: ScopeProjection, hoursThreshold: number = 48): boolean {
  const thresholdMs = hoursThreshold * 3600000;
  const now = Date.now();

  if (projection.escalationProjection.projectedHitTime &&
      projection.escalationProjection.projectedHitTime - now < thresholdMs) {
    return true;
  }

  if (projection.capacityProjection.projectedHitTime &&
      projection.capacityProjection.projectedHitTime - now < thresholdMs) {
    return true;
  }

  return false;
}
