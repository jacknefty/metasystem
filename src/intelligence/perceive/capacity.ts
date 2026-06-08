/**
 * Intelligence Capacity Perception
 *
 * Learns from escalation events to predict capacity needs.
 * Informs scaffold with initial capacity predictions.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { emitVariety } from '../../coordination/resources/token.js';

export interface CapacityPattern {
  scopeType: string;
  averageOverflow: number;
  reallocationFrequency: number;
  capacityGrowthRate: number;
  sampleCount: number;
}

const capacityPatterns = new Map<string, CapacityPattern>();

/**
 * Subscribe to escalation events and learn capacity patterns.
 * Intelligence perceives resource dynamics.
 */
export function startCapacityPerception(): void {
  const chain = getChain();

  // Listen for reallocation (escalation level 3)
  chain.on('event', async (event) => {
    if (event.type === 'algedonic:pain') {
      const payload = event.payload as {
        escalationLevel?: number;
        source?: string;
      };

      if (payload.escalationLevel === 3) { // Reallocate level
        await perceiveReallocation(event.subject, payload);
      }
    }
  });

  // Listen for bargain finalization
  chain.on('event', async (event) => {
    if (event.type === 'bargain:finalized') {
      const payload = event.payload as {
        accepted: boolean;
        finalResources?: { variety?: number; capacity?: number };
      };

      if (payload.accepted && payload.finalResources) {
        await perceiveResourceGrant(event.subject, payload.finalResources);
      }
    }
  });
}

async function perceiveReallocation(
  scopeId: string,
  payload: { escalationLevel?: number; source?: string }
): Promise<void> {
  const scopeType = extractScopeType(scopeId);

  const pattern = capacityPatterns.get(scopeType) ?? {
    scopeType,
    averageOverflow: 0,
    reallocationFrequency: 0,
    capacityGrowthRate: 0,
    sampleCount: 0,
  };

  pattern.reallocationFrequency =
    (pattern.reallocationFrequency * pattern.sampleCount + 1) / (pattern.sampleCount + 1);
  pattern.sampleCount++;

  capacityPatterns.set(scopeType, pattern);

  // Emit as environmental perception
  await emitVariety('env', 'in', 's4:capacity', scopeId, 15, {
    context: 'reallocation_observed',
  });

  // Log learning
  await getChain().append('learning:pattern', 's4:capacity', scopeType, {
    patternType: 'capacity_reallocation',
    pattern: pattern as unknown as Record<string, unknown>,
  });
}

async function perceiveResourceGrant(
  scopeId: string,
  resources: { variety?: number; capacity?: number }
): Promise<void> {
  const scopeType = extractScopeType(scopeId);
  const pattern = capacityPatterns.get(scopeType);

  if (pattern && (resources.variety || resources.capacity)) {
    const grant = (resources.variety ?? 0) + (resources.capacity ?? 0);
    pattern.capacityGrowthRate =
      (pattern.capacityGrowthRate * pattern.sampleCount + grant) / (pattern.sampleCount + 1);
    capacityPatterns.set(scopeType, pattern);
  }

  await emitVariety('env', 'in', 's4:capacity', scopeId, 10, {
    context: 'resource_grant_observed',
  });
}

function extractScopeType(scopeId: string): string {
  if (scopeId.startsWith('hub_')) return 'hub';
  if (scopeId.startsWith('epic_')) return 'epic';
  if (scopeId.startsWith('story_')) return 'story';
  if (scopeId.startsWith('task_')) return 'task';
  return 'unknown';
}

/**
 * Get learned capacity patterns for planning.
 */
export function getCapacityPatterns(): Map<string, CapacityPattern> {
  return new Map(capacityPatterns);
}

/**
 * Predict initial capacity for new scope based on learned patterns.
 */
export function predictInitialCapacity(scopeType: string): number {
  const pattern = capacityPatterns.get(scopeType);

  if (!pattern || pattern.sampleCount < 3) {
    return 1000; // Default
  }

  // If reallocation is frequent, allocate more upfront
  const baseCapacity = 1000;
  const adjustment = pattern.reallocationFrequency > 0.3
    ? pattern.capacityGrowthRate * 1.5
    : 0;

  return Math.round(baseCapacity + adjustment);
}

/**
 * Get capacity recommendation for a scope type.
 */
export function getCapacityRecommendation(scopeType: string): {
  recommended: number;
  confidence: 'low' | 'medium' | 'high';
  reasoning: string;
} {
  const pattern = capacityPatterns.get(scopeType);

  if (!pattern || pattern.sampleCount < 3) {
    return {
      recommended: 1000,
      confidence: 'low',
      reasoning: 'Insufficient data, using default',
    };
  }

  const recommended = predictInitialCapacity(scopeType);

  if (pattern.sampleCount >= 10) {
    return {
      recommended,
      confidence: 'high',
      reasoning: `Based on ${pattern.sampleCount} samples, reallocation frequency ${(pattern.reallocationFrequency * 100).toFixed(0)}%`,
    };
  }

  return {
    recommended,
    confidence: 'medium',
    reasoning: `Based on ${pattern.sampleCount} samples`,
  };
}
