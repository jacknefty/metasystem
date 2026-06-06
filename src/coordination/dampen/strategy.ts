/**
 * S2 Strategy — Coupling analysis and phased execution planning
 *
 * Analyzes file overlap between work items and creates phased execution
 * to prevent merge conflicts when running parallel agents.
 */

import { parseVerifier } from '../../control/verify/registry.js';
import { listWork } from '../../coordination/resources/work.js';
import { getNode } from '../../identity/node.js';
import type { DerivedWork } from '../../coordination/resources/derive.js';

export interface FileOverlap {
  file: string;
  workIds: string[];
  type: 'create' | 'modify';
}

export interface WorkCluster {
  id: string;
  workIds: string[];
  sharedFiles: string[];
  strategy: 'sequential' | 'parallel' | 'scaffold';
}

export interface ExecutionPhase {
  id: string;
  phase: number;
  workIds: string[];
  description: string;
  waitFor: string[];
}

export type ExecutionStrategy =
  | { type: 'parallel' }
  | { type: 'sequential'; order: string[] }
  | { type: 'phased'; phases: ExecutionPhase[] };

export interface CouplingAnalysis {
  workIds: string[];
  fileOverlaps: FileOverlap[];
  clusters: WorkCluster[];
  strategy: ExecutionStrategy;
}

async function inferFilesFromConditions(work: DerivedWork): Promise<Set<string>> {
  const files = new Set<string>();

  for (const condition of work.conditions) {
    const { type, args } = parseVerifier(condition.verifier);
    const target = args.join(':');

    if (type === 'exists' || type === 'valid') {
      const colonIdx = target.indexOf(':');
      const file = colonIdx > 0 ? target.slice(colonIdx + 1) : target;
      if (file) files.add(file);
    } else if (type === 'contains') {
      const colonIdx = target.indexOf(':');
      const file = colonIdx > 0 ? target.slice(0, colonIdx) : target;
      if (file) files.add(file);
    }
  }

  if (files.size === 0 && work.claim?.nodeId) {
    const node = await getNode(work.claim.nodeId);
    if (node?.scope) {
      for (const pattern of node.scope) {
        files.add(pattern);
      }
    }
  }

  return files;
}

function findFileOverlaps(workScopes: Map<string, Set<string>>): FileOverlap[] {
  const fileToWork = new Map<string, string[]>();

  for (const [workId, files] of workScopes) {
    for (const file of files) {
      const existing = fileToWork.get(file) || [];
      existing.push(workId);
      fileToWork.set(file, existing);
    }
  }

  const overlaps: FileOverlap[] = [];
  for (const [file, workIds] of fileToWork) {
    if (workIds.length > 1) {
      overlaps.push({
        file,
        workIds,
        type: file.includes('*') ? 'modify' : 'create',
      });
    }
  }

  return overlaps;
}

class UnionFind {
  private parent: Map<string, string> = new Map();
  private rank: Map<string, number> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }
    return this.parent.get(x)!;
  }

  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);
    if (rootX === rootY) return;

    const rankX = this.rank.get(rootX)!;
    const rankY = this.rank.get(rootY)!;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  getClusters(): Map<string, string[]> {
    const clusters = new Map<string, string[]>();
    for (const x of this.parent.keys()) {
      const root = this.find(x);
      const cluster = clusters.get(root) || [];
      cluster.push(x);
      clusters.set(root, cluster);
    }
    return clusters;
  }
}

function buildClusters(
  workIds: string[],
  overlaps: FileOverlap[],
  dependsOnMap: Map<string, string[]>
): WorkCluster[] {
  const uf = new UnionFind();

  for (const id of workIds) {
    uf.find(id);
  }

  for (const overlap of overlaps) {
    for (let i = 1; i < overlap.workIds.length; i++) {
      uf.union(overlap.workIds[0], overlap.workIds[i]);
    }
  }

  for (const [workId, deps] of dependsOnMap) {
    for (const dep of deps) {
      if (workIds.includes(dep)) {
        uf.union(workId, dep);
      }
    }
  }

  const clusterMap = uf.getClusters();
  const clusters: WorkCluster[] = [];
  let clusterIdx = 0;

  for (const [, members] of clusterMap) {
    const sharedFiles = overlaps
      .filter(o => o.workIds.some(id => members.includes(id)))
      .map(o => o.file);

    let strategy: 'sequential' | 'parallel' | 'scaffold';
    if (sharedFiles.length === 0) {
      strategy = 'parallel';
    } else if (sharedFiles.some(f => f.endsWith('.ts') && !f.includes('test'))) {
      strategy = 'scaffold';
    } else {
      strategy = 'sequential';
    }

    clusters.push({
      id: `cluster_${clusterIdx++}`,
      workIds: members,
      sharedFiles: [...new Set(sharedFiles)],
      strategy,
    });
  }

  return clusters;
}

function determineStrategy(clusters: WorkCluster[]): ExecutionStrategy {
  if (clusters.every(c => c.workIds.length === 1)) {
    return { type: 'parallel' };
  }

  if (clusters.length === 1 && clusters[0].workIds.length > 1) {
    return {
      type: 'sequential',
      order: clusters[0].workIds,
    };
  }

  const phases: ExecutionPhase[] = [];
  let phaseNum = 0;

  const scaffoldClusters = clusters.filter(c => c.strategy === 'scaffold');
  if (scaffoldClusters.length > 0) {
    phases.push({
      id: `phase_${phaseNum}`,
      phase: phaseNum,
      workIds: scaffoldClusters.flatMap(c => c.workIds.slice(0, 1)),
      description: 'Create shared infrastructure',
      waitFor: [],
    });
    phaseNum++;

    const remaining = scaffoldClusters.flatMap(c => c.workIds.slice(1));
    if (remaining.length > 0) {
      phases.push({
        id: `phase_${phaseNum}`,
        phase: phaseNum,
        workIds: remaining,
        description: 'Build on scaffolded infrastructure',
        waitFor: [`phase_${phaseNum - 1}`],
      });
      phaseNum++;
    }
  }

  const parallelClusters = clusters.filter(c => c.strategy === 'parallel');
  if (parallelClusters.length > 0) {
    phases.push({
      id: `phase_${phaseNum}`,
      phase: phaseNum,
      workIds: parallelClusters.flatMap(c => c.workIds),
      description: 'Independent work items',
      waitFor: phaseNum > 0 ? [`phase_${phaseNum - 1}`] : [],
    });
    phaseNum++;
  }

  const sequentialClusters = clusters.filter(c => c.strategy === 'sequential');
  for (const cluster of sequentialClusters) {
    for (const workId of cluster.workIds) {
      phases.push({
        id: `phase_${phaseNum}`,
        phase: phaseNum,
        workIds: [workId],
        description: `Sequential: ${workId}`,
        waitFor: phaseNum > 0 ? [`phase_${phaseNum - 1}`] : [],
      });
      phaseNum++;
    }
  }

  return { type: 'phased', phases };
}

export async function analyzeCoupling(contextId: string): Promise<CouplingAnalysis> {
  const allWork = await listWork({ contextId });
  const activeWork = allWork.filter(w =>
    w.status === 'active' || w.bountyStatus === 'posted' || w.bountyStatus === 'claimed'
  );

  if (activeWork.length === 0) {
    return {
      workIds: [],
      fileOverlaps: [],
      clusters: [],
      strategy: { type: 'parallel' },
    };
  }

  const workScopes = new Map<string, Set<string>>();
  const dependsOnMap = new Map<string, string[]>();

  for (const work of activeWork) {
    workScopes.set(work.id, await inferFilesFromConditions(work));
    dependsOnMap.set(work.id, work.dependsOn);
  }

  const workIds = activeWork.map(w => w.id);
  const fileOverlaps = findFileOverlaps(workScopes);
  const clusters = buildClusters(workIds, fileOverlaps, dependsOnMap);
  const strategy = determineStrategy(clusters);

  return {
    workIds,
    fileOverlaps,
    clusters,
    strategy,
  };
}

export async function getNextExecutableWork(contextId: string): Promise<string[]> {
  const analysis = await analyzeCoupling(contextId);

  if (analysis.strategy.type === 'parallel') {
    return analysis.workIds;
  }

  if (analysis.strategy.type === 'sequential') {
    return analysis.strategy.order.slice(0, 1);
  }

  const allWork = await listWork({ contextId });
  const completed = new Set(
    allWork.filter(w => w.status === 'fulfilled').map(w => w.id)
  );

  for (const phase of analysis.strategy.phases) {
    const incomplete = phase.workIds.filter(id => !completed.has(id));
    if (incomplete.length > 0) {
      const canStart = phase.waitFor.every(waitPhaseId => {
        const waitPhase = analysis.strategy.type === 'phased'
          ? analysis.strategy.phases.find(p => p.id === waitPhaseId)
          : null;
        return !waitPhase || waitPhase.workIds.every(id => completed.has(id));
      });

      if (canStart) {
        return incomplete;
      }
    }
  }

  return [];
}
