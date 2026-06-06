/**
 * Empty Branch Learning
 *
 * Track paths not taken, detect capability gaps.
 */

import type { EmptyBranch, CapabilityGap, Configuration } from './types.js';

interface EmptyBranchRecord {
  workId: string;
  branches: EmptyBranch[];
  recordedAt: number;
}

const emptyBranchHistory: EmptyBranchRecord[] = [];

export function recordEmptyBranches(workId: string, branches: EmptyBranch[]): void {
  emptyBranchHistory.push({
    workId,
    branches,
    recordedAt: Date.now(),
  });

  if (emptyBranchHistory.length > 1000) {
    emptyBranchHistory.shift();
  }
}

export function getEmptyBranchHistory(): EmptyBranchRecord[] {
  return emptyBranchHistory;
}

export function analyzeEmptyBranches(): CapabilityGap[] {
  const conditionFailureCounts = new Map<string, number>();
  const conditionConfigs = new Map<string, Configuration[]>();

  for (const record of emptyBranchHistory) {
    for (const branch of record.branches) {
      const count = conditionFailureCounts.get(branch.conditionId) || 0;
      conditionFailureCounts.set(branch.conditionId, count + 1);

      const configs = conditionConfigs.get(branch.conditionId) || [];
      configs.push(branch.configAtFork);
      conditionConfigs.set(branch.conditionId, configs);
    }
  }

  const gaps: CapabilityGap[] = [];
  for (const [conditionId, count] of conditionFailureCounts) {
    if (count > 5) {
      const configs = conditionConfigs.get(conditionId) || [];
      const center = averageConfiguration(configs);

      gaps.push({
        id: `gap_${conditionId}`,
        center,
        radius: 0.2,
        description: `Frequent failure: ${conditionId} (${count} times)`,
      });
    }
  }

  return gaps;
}

function averageConfiguration(configs: Configuration[]): Configuration {
  if (configs.length === 0) {
    return { verified: 0.5, active: 0.5, resources: 0.5 };
  }

  const sum = configs.reduce(
    (acc, c) => ({
      verified: acc.verified + c.verified,
      active: acc.active + c.active,
      resources: acc.resources + c.resources,
    }),
    { verified: 0, active: 0, resources: 0 }
  );

  return {
    verified: sum.verified / configs.length,
    active: sum.active / configs.length,
    resources: sum.resources / configs.length,
  };
}
