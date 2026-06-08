/**
 * Intelligence Simulate — "What if" scenario modeling
 *
 * Models hypothetical changes without executing them.
 * Predicts F delta, capacity impact, escalation risk.
 */

import { loadSpine, sumOverflow, getAllPorts, type Spine, type Port } from '../../identity/spine.js';
import { at, listChildren } from '../../identity/scoped-paths.js';

export type ScenarioType =
  | 'scope_narrow'
  | 'scope_expand'
  | 'add_capacity'
  | 'remove_child'
  | 'add_child'
  | 'reallocate';

export interface Scenario {
  type: ScenarioType;
  description: string;
  params: Record<string, unknown>;
}

export interface SimulationResult {
  scenario: Scenario;
  currentF: number;
  projectedF: number;
  fDelta: number;
  capacityDelta: number;
  escalationRiskDelta: number;
  sideEffects: string[];
  recommendation: 'beneficial' | 'neutral' | 'harmful';
  confidence: 'low' | 'medium' | 'high';
}

export async function simulate(
  scopePath: string,
  scenario: Scenario
): Promise<SimulationResult> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);

  if (!spine) {
    return {
      scenario,
      currentF: 0,
      projectedF: 0,
      fDelta: 0,
      capacityDelta: 0,
      escalationRiskDelta: 0,
      sideEffects: ['No spine data available'],
      recommendation: 'neutral',
      confidence: 'low',
    };
  }

  const currentF = sumOverflow(spine);
  let projectedF = currentF;
  let capacityDelta = 0;
  let escalationRiskDelta = 0;
  const sideEffects: string[] = [];

  switch (scenario.type) {
    case 'scope_narrow': {
      const reductionPercent = (scenario.params.percent as number) ?? 20;
      // Narrowing scope reduces variety in, reduces F
      projectedF = currentF * (1 - reductionPercent / 100);
      capacityDelta = 0;
      escalationRiskDelta = -reductionPercent / 100;
      sideEffects.push(`Scope reduced by ${reductionPercent}%`);
      sideEffects.push('Some work may become out-of-scope');
      break;
    }

    case 'scope_expand': {
      const expansionPercent = (scenario.params.percent as number) ?? 20;
      // Expanding scope increases variety in, increases F
      projectedF = currentF * (1 + expansionPercent / 100);
      capacityDelta = 0;
      escalationRiskDelta = expansionPercent / 100;
      sideEffects.push(`Scope expanded by ${expansionPercent}%`);
      sideEffects.push('May require additional resources');
      break;
    }

    case 'add_capacity': {
      const capacityAmount = (scenario.params.amount as number) ?? 100;
      // More capacity reduces load ratios, reduces F
      const totalCapacity = getAllPorts(spine).reduce((sum, p) => sum + p.capacity, 0);
      const newCapacity = totalCapacity + capacityAmount;
      const loadRatio = totalCapacity > 0 ? currentF / totalCapacity : 0;
      projectedF = loadRatio * newCapacity * 0.8; // Capacity helps
      capacityDelta = capacityAmount;
      escalationRiskDelta = -capacityAmount / 1000;
      sideEffects.push(`Added ${capacityAmount} capacity`);
      break;
    }

    case 'remove_child': {
      const childId = scenario.params.childId as string;
      // Removing child reduces aggregate F but may orphan work
      const children = await listChildren(scope);
      const childCount = children.length;
      if (childCount > 0) {
        projectedF = currentF * ((childCount - 1) / childCount);
        sideEffects.push(`Removed child: ${childId}`);
        sideEffects.push('Work from child needs reassignment');
        escalationRiskDelta = -0.1;
      }
      break;
    }

    case 'add_child': {
      // Adding child spreads load but adds coordination overhead
      projectedF = currentF * 1.1; // Initial overhead
      sideEffects.push('New child added');
      sideEffects.push('Short-term F increase from coordination');
      sideEffects.push('Long-term capacity increase');
      escalationRiskDelta = 0.05;
      break;
    }

    case 'reallocate': {
      const fromPort = scenario.params.fromPort as string;
      const toPort = scenario.params.toPort as string;
      const amount = (scenario.params.amount as number) ?? 50;
      // Reallocation shifts load between ports
      sideEffects.push(`Moved ${amount} from ${fromPort} to ${toPort}`);
      // Net F stays similar but distribution changes
      projectedF = currentF * 0.95; // Slight improvement from better balance
      escalationRiskDelta = -0.05;
      break;
    }
  }

  const fDelta = projectedF - currentF;

  // Determine recommendation
  let recommendation: 'beneficial' | 'neutral' | 'harmful';
  if (fDelta < -5 || escalationRiskDelta < -0.1) {
    recommendation = 'beneficial';
  } else if (fDelta > 10 || escalationRiskDelta > 0.2) {
    recommendation = 'harmful';
  } else {
    recommendation = 'neutral';
  }

  return {
    scenario,
    currentF,
    projectedF,
    fDelta,
    capacityDelta,
    escalationRiskDelta,
    sideEffects,
    recommendation,
    confidence: 'medium', // Simulations are inherently uncertain
  };
}

/**
 * Run multiple scenarios and compare.
 */
export async function compareScenarios(
  scopePath: string,
  scenarios: Scenario[]
): Promise<SimulationResult[]> {
  const results = await Promise.all(
    scenarios.map(s => simulate(scopePath, s))
  );

  // Sort by benefit (lowest projected F first)
  return results.sort((a, b) => a.projectedF - b.projectedF);
}

/**
 * Generate common scenarios for a scope.
 */
export function suggestScenarios(currentF: number): Scenario[] {
  const scenarios: Scenario[] = [];

  if (currentF > 30) {
    scenarios.push({
      type: 'scope_narrow',
      description: 'Narrow scope by 20%',
      params: { percent: 20 },
    });
    scenarios.push({
      type: 'add_capacity',
      description: 'Add 200 capacity',
      params: { amount: 200 },
    });
  }

  if (currentF > 50) {
    scenarios.push({
      type: 'scope_narrow',
      description: 'Narrow scope by 40%',
      params: { percent: 40 },
    });
  }

  if (currentF < 20) {
    scenarios.push({
      type: 'scope_expand',
      description: 'Expand scope by 20%',
      params: { percent: 20 },
    });
    scenarios.push({
      type: 'add_child',
      description: 'Spawn new child scope',
      params: {},
    });
  }

  return scenarios;
}
