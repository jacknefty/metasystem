/**
 * Intelligence Trends — Track signals over time, detect patterns
 *
 * Maintains rolling windows of key metrics.
 * Detects degradation, improvement, oscillation.
 */

import { getChain } from '../../coordination/channels/chain.js';

export type TrendDirection = 'improving' | 'stable' | 'degrading' | 'oscillating';

export interface TrendPoint {
  timestamp: number;
  value: number;
}

export interface TrendAnalysis {
  metric: string;
  direction: TrendDirection;
  slope: number;
  volatility: number;
  points: TrendPoint[];
  confidence: 'low' | 'medium' | 'high';
}

export interface ScopeTrends {
  scopeId: string;
  F: TrendAnalysis;
  escalations: TrendAnalysis;
  workCompletion: TrendAnalysis;
  varietyFlow: TrendAnalysis;
  overallHealth: TrendDirection;
  analyzedAt: number;
}

const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_POINTS = 3;

export async function analyzeTrends(scopePath: string): Promise<ScopeTrends> {
  const chain = getChain();
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Recall events for this scope in the time window
  const events = await chain.recall({
    subject: scopePath,
    since: windowStart,
    limit: 500,
  });

  // Extract F values from variety events
  const fPoints: TrendPoint[] = [];
  const escalationPoints: TrendPoint[] = [];
  const completionPoints: TrendPoint[] = [];
  const varietyPoints: TrendPoint[] = [];

  for (const event of events) {
    if (event.type.startsWith('variety:')) {
      const payload = event.payload as { amount?: number };
      if (payload.amount !== undefined) {
        varietyPoints.push({ timestamp: event.timestamp, value: payload.amount });
      }
    }

    if (event.type === 'algedonic:pain') {
      const payload = event.payload as { severity?: number };
      fPoints.push({ timestamp: event.timestamp, value: (payload.severity ?? 1) * 20 });
    }

    if (event.type === 'escalation:triggered') {
      const payload = event.payload as { level?: number };
      escalationPoints.push({ timestamp: event.timestamp, value: payload.level ?? 1 });
    }

    if (event.type === 'work:completed') {
      completionPoints.push({ timestamp: event.timestamp, value: 1 });
    }
  }

  const fTrend = analyzeTrendPoints('F', fPoints);
  const escalationTrend = analyzeTrendPoints('escalations', escalationPoints);
  const completionTrend = analyzeTrendPoints('workCompletion', completionPoints);
  const varietyTrend = analyzeTrendPoints('varietyFlow', varietyPoints);

  // Determine overall health
  const overallHealth = determineOverallHealth(fTrend.direction, escalationTrend.direction, completionTrend.direction);

  return {
    scopeId: scopePath,
    F: fTrend,
    escalations: escalationTrend,
    workCompletion: completionTrend,
    varietyFlow: varietyTrend,
    overallHealth,
    analyzedAt: now,
  };
}

function analyzeTrendPoints(metric: string, points: TrendPoint[]): TrendAnalysis {
  if (points.length < MIN_POINTS) {
    return {
      metric,
      direction: 'stable',
      slope: 0,
      volatility: 0,
      points,
      confidence: 'low',
    };
  }

  // Sort by timestamp
  const sorted = [...points].sort((a, b) => a.timestamp - b.timestamp);

  // Calculate slope using linear regression
  const n = sorted.length;
  const sumX = sorted.reduce((sum, p, i) => sum + i, 0);
  const sumY = sorted.reduce((sum, p) => sum + p.value, 0);
  const sumXY = sorted.reduce((sum, p, i) => sum + i * p.value, 0);
  const sumXX = sorted.reduce((sum, _, i) => sum + i * i, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;

  // Calculate volatility (standard deviation)
  const mean = sumY / n;
  const variance = sorted.reduce((sum, p) => sum + Math.pow(p.value - mean, 2), 0) / n;
  const volatility = Math.sqrt(variance);

  // Determine direction
  let direction: TrendDirection;
  const slopeThreshold = 0.1;
  const volatilityThreshold = mean * 0.3;

  if (volatility > volatilityThreshold && Math.abs(slope) < slopeThreshold) {
    direction = 'oscillating';
  } else if (slope > slopeThreshold) {
    // For workCompletion, more completions is good (improving)
    // For other metrics (F, escalations), higher is bad (degrading)
    direction = metric === 'workCompletion' ? 'improving' : 'degrading';
  } else if (slope < -slopeThreshold) {
    direction = metric === 'workCompletion' ? 'degrading' : 'improving';
  } else {
    direction = 'stable';
  }

  // Confidence based on sample size
  const confidence = n >= 10 ? 'high' : n >= 5 ? 'medium' : 'low';

  return {
    metric,
    direction,
    slope,
    volatility,
    points: sorted,
    confidence,
  };
}

function determineOverallHealth(
  fDirection: TrendDirection,
  escalationDirection: TrendDirection,
  completionDirection: TrendDirection
): TrendDirection {
  // Check degradation first
  if (fDirection === 'degrading' || escalationDirection === 'degrading') {
    return 'degrading';
  }
  // Then improvement (fDirection can't be degrading here, but TS doesn't know)
  if (completionDirection === 'improving') {
    return 'improving';
  }
  // Then oscillation
  if (fDirection === 'oscillating' || escalationDirection === 'oscillating') {
    return 'oscillating';
  }
  return 'stable';
}

/**
 * Get trend emoji for display.
 */
export function getTrendEmoji(direction: TrendDirection): string {
  switch (direction) {
    case 'improving': return '📈';
    case 'stable': return '➡️';
    case 'degrading': return '📉';
    case 'oscillating': return '〰️';
  }
}
