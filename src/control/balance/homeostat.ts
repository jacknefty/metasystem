/**
 * Homeostat — S3/S4 Balance (Bidirectional)
 *
 * ratio > 1.0 → invoke workers (S3 action)
 * ratio < 0.8 → invoke perception (S4 action)
 * ratio ~1.0 → equilibrium
 *
 * Now with Unified Dynamics integration:
 * The dynamics module computes F (free energy) which can replace
 * or augment the variety ratio for more sophisticated control.
 */

import { getSystemBalance } from '../../coordination/resources/token.js';
import { dynamicsHomeostat as runDynamicsHomeostat } from '../dynamics/index.js';
import { claimWork } from '../../coordination/resources/work.js';
import { listNodes, DEFAULT_SETTINGS } from '../../identity/node.js';
import { findClaimableWork, type PooledWork } from '../../coordination/resources/pool.js';
import { perceiveEnvironment } from '../../intelligence/perceive/scan.js';

export interface HomeostatState {
  perceived: number;
  resolved: number;
  ratio: number;
  action: 'none' | 'invoke' | 'perceive';
  shouldInvoke: boolean;
  shouldPerceive: boolean;
  diagnosis: string;
}

export interface InvocationResult {
  invoked: string[];
  workAssigned: Array<{ nodeId: string; workId: string }>;
}

export interface PerceptionResult {
  contextsScanned: string[];
  totalFindings: number;
  totalVarietyEmitted: number;
}

const PERCEPTION_THRESHOLD = 0.8;
const INVOCATION_THRESHOLD = 1.0;

export async function getHomeostatState(): Promise<HomeostatState> {
  const balance = await getSystemBalance();
  const { perceived, resolved, ratio } = balance;

  if (ratio > INVOCATION_THRESHOLD) {
    return {
      perceived,
      resolved,
      ratio,
      action: 'invoke',
      shouldInvoke: true,
      shouldPerceive: false,
      diagnosis: `Unresolved variety (ratio ${ratio === Infinity ? '∞' : ratio.toFixed(2)}). S3 should invoke workers.`,
    };
  }

  if (ratio < PERCEPTION_THRESHOLD && ratio > 0) {
    return {
      perceived,
      resolved,
      ratio,
      action: 'perceive',
      shouldInvoke: false,
      shouldPerceive: true,
      diagnosis: `Under-perceived (ratio ${ratio.toFixed(2)}). S4 should scan environment.`,
    };
  }

  return {
    perceived,
    resolved,
    ratio,
    action: 'none',
    shouldInvoke: false,
    shouldPerceive: false,
    diagnosis: `Near equilibrium (ratio ${ratio === 0 ? '0' : ratio.toFixed(2)}). Second Axiom satisfied.`,
  };
}

export async function checkShouldInvoke(): Promise<boolean> {
  const state = await getHomeostatState();
  return state.shouldInvoke;
}

export async function invokeAvailableNodes(): Promise<InvocationResult> {
  const state = await getHomeostatState();

  if (!state.shouldInvoke) {
    return { invoked: [], workAssigned: [] };
  }

  const nodes = await listNodes({ status: 'active' });
  const availableNodes = nodes.filter(n => {
    const available = n.settings.availableForWork ?? DEFAULT_SETTINGS.availableForWork;
    return available;
  });

  const invoked: string[] = [];
  const workAssigned: Array<{ nodeId: string; workId: string }> = [];

  for (const node of availableNodes) {
    const claimable = await findClaimableWork(node.id);

    if (claimable.length === 0) continue;

    const best = selectBestWork(claimable);
    if (!best) continue;

    try {
      await claimWork(best.work.id, node.id);
      invoked.push(node.id);
      workAssigned.push({ nodeId: node.id, workId: best.work.id });
    } catch {
      // Claim failed
    }
  }

  return { invoked, workAssigned };
}

export async function invokePerception(): Promise<PerceptionResult> {
  const nodes = await listNodes({ status: 'active' });

  const roots = nodes.filter(n => n.settings.path);

  const contextsScanned: string[] = [];
  let totalFindings = 0;
  let totalVarietyEmitted = 0;

  for (const root of roots) {
    try {
      const result = await perceiveEnvironment(root.id, {
        includeGit: true,
        includeTodo: true,
        includeTests: true,
        includeDeps: false,
        createWork: false,
      });

      contextsScanned.push(root.id);
      totalFindings += result.findings.length;
      totalVarietyEmitted += result.varietyEmitted;
    } catch (err) {
      console.error(`[Homeostat] Failed to perceive ${root.id}:`, err);
    }
  }

  if (totalFindings > 0) {
    console.log(`[Homeostat] Perceived ${totalFindings} findings (${totalVarietyEmitted} bits) across ${contextsScanned.length} contexts`);
  }

  return { contextsScanned, totalFindings, totalVarietyEmitted };
}

function selectBestWork(pool: PooledWork[]): PooledWork | null {
  if (pool.length === 0) return null;

  return pool.reduce((best, current) => {
    const bestValue = best.work.bounty?.amount ?? 0;
    const currentValue = current.work.bounty?.amount ?? 0;
    return currentValue > bestValue ? current : best;
  });
}

export async function runHomeostat(): Promise<{
  state: HomeostatState;
  invocationResult?: InvocationResult;
  perceptionResult?: PerceptionResult;
}> {
  const state = await getHomeostatState();

  if (state.shouldInvoke) {
    const invocationResult = await invokeAvailableNodes();
    return { state, invocationResult };
  }

  if (state.shouldPerceive) {
    const perceptionResult = await invokePerception();
    return { state, perceptionResult };
  }

  return { state };
}

export async function runControlTick(): Promise<{
  homeostat: HomeostatState;
  invocation: InvocationResult;
}> {
  const homeostat = await getHomeostatState();
  const invocation = homeostat.shouldInvoke
    ? await invokeAvailableNodes()
    : { invoked: [], workAssigned: [] };

  return { homeostat, invocation };
}

/**
 * Dynamics-based control tick (F-driven)
 *
 * Uses the unified dynamics module to compute free energy
 * and select actions based on expected free energy minimization.
 */
export async function runDynamicsControlTick(): Promise<{
  F: number;
  action: 'invoke' | 'perceive' | 'equilibrium';
  selectedWork: string | null;
  invocationResult?: InvocationResult;
  perceptionResult?: PerceptionResult;
}> {
  const dynamics = await runDynamicsHomeostat();

  if (dynamics.action === 'invoke' && dynamics.selectedWork) {
    const invocationResult = await invokeAvailableNodes();
    return { ...dynamics, invocationResult };
  }

  if (dynamics.action === 'perceive') {
    const perceptionResult = await invokePerception();
    return { ...dynamics, perceptionResult };
  }

  return dynamics;
}
