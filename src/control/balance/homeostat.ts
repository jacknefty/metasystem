/**
 * Homeostat — Control/Intelligence Balance (Dynamics-Driven)
 *
 * F > invocationThreshold → invoke workers (Control action)
 * F < perceptionThreshold → invoke perception (Intelligence action)
 * Otherwise → equilibrium
 *
 * Uses the unified dynamics module to compute free energy (F),
 * epistemic uncertainty (H), and expected free energy (G = F + γH)
 * for sophisticated control with learning.
 *
 * Balance port exposes Control/Intelligence tension to spine for variety tracking.
 *
 * Each node can have its own dynamics parameters (thresholds, γ, β),
 * allowing different "personalities": scouts scan eagerly, workers execute.
 */

import { dynamicsHomeostat as runDynamicsHomeostat, DEFAULT_PARAMETERS, type DynamicsParameters } from '../dynamics/index.js';
import { claimWork } from '../../coordination/resources/work.js';
import { listNodes, DEFAULT_SETTINGS, type DerivedNode } from '../../identity/node.js';
import { findClaimableWork, type PooledWork } from '../../coordination/resources/pool.js';
import { perceiveEnvironment } from '../../intelligence/perceive/scan.js';
import { loadSpine, saveSpine, sumOverflow, sumCapacity, type ControlIntelligenceTension } from '../../identity/spine.js';
import { dao } from '../../identity/scoped-paths.js';

export interface InvocationResult {
  invoked: string[];
  workAssigned: Array<{ nodeId: string; workId: string }>;
}

export interface PerceptionResult {
  contextsScanned: string[];
  totalFindings: number;
  totalVarietyEmitted: number;
}

/**
 * Merge node-specific dynamics settings with defaults
 */
function getNodeParams(node: DerivedNode): DynamicsParameters {
  return {
    ...DEFAULT_PARAMETERS,
    ...(node.settings.invocationThreshold !== undefined && { invocationThreshold: node.settings.invocationThreshold }),
    ...(node.settings.perceptionThreshold !== undefined && { perceptionThreshold: node.settings.perceptionThreshold }),
    ...(node.settings.γ !== undefined && { γ: node.settings.γ }),
    ...(node.settings.β_base !== undefined && { β_base: node.settings.β_base }),
  };
}

/**
 * Invoke available nodes based on their individual thresholds
 */
export async function invokeAvailableNodes(): Promise<InvocationResult> {
  const nodes = await listNodes({ status: 'active' });
  const availableNodes = nodes.filter(n => {
    const available = n.settings.availableForWork ?? DEFAULT_SETTINGS.availableForWork;
    return available;
  });

  const invoked: string[] = [];
  const workAssigned: Array<{ nodeId: string; workId: string }> = [];

  for (const node of availableNodes) {
    // Get node-specific dynamics parameters
    const params = getNodeParams(node);

    // Check if this node should invoke based on its threshold
    const dynamics = await runDynamicsHomeostat(params);
    if (dynamics.action !== 'invoke') continue;

    const claimable = await findClaimableWork(node.id);
    if (claimable.length === 0) continue;

    const best = selectBestWork(claimable, params);
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

/**
 * Invoke perception for nodes configured to scan
 */
export async function invokePerception(): Promise<PerceptionResult> {
  const nodes = await listNodes({ status: 'active' });
  const roots = nodes.filter(n => n.settings.path);

  const contextsScanned: string[] = [];
  let totalFindings = 0;
  let totalVarietyEmitted = 0;

  for (const root of roots) {
    // Check if this node should perceive based on its threshold
    const params = getNodeParams(root);
    const dynamics = await runDynamicsHomeostat(params);
    if (dynamics.action !== 'perceive') continue;

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
      console.error(`[Dynamics] Failed to perceive ${root.id}:`, err);
    }
  }

  if (totalFindings > 0) {
    console.log(`[Dynamics] Perceived ${totalFindings} findings (${totalVarietyEmitted} bits) across ${contextsScanned.length} contexts`);
  }

  return { contextsScanned, totalFindings, totalVarietyEmitted };
}

/**
 * Select best work using node's β for temperature-scaled selection
 */
function selectBestWork(pool: PooledWork[], params: DynamicsParameters = DEFAULT_PARAMETERS): PooledWork | null {
  if (pool.length === 0) return null;

  // With high β, select greedily by bounty
  // With low β, allow more exploration (could add randomization here)
  return pool.reduce((best, current) => {
    const bestValue = best.work.bounty?.amount ?? 0;
    const currentValue = current.work.bounty?.amount ?? 0;
    return currentValue > bestValue ? current : best;
  });
}

/**
 * Dynamics-based control tick (F-driven)
 *
 * Uses the unified dynamics module to compute free energy
 * and select actions based on expected free energy minimization.
 * Updates balance port with Control/Intelligence tension state.
 */
export async function runDynamicsControlTick(): Promise<{
  F: number;
  H: number;
  G: number;
  action: 'invoke' | 'perceive' | 'equilibrium';
  selectedWork: string | null;
  invocationResult?: InvocationResult;
  perceptionResult?: PerceptionResult;
}> {
  // Network-level dynamics check (uses default params)
  const dynamics = await runDynamicsHomeostat();

  // Update balance port with Control/Intelligence tension
  updateBalancePort(dynamics.F, dynamics.action);

  if (dynamics.action === 'invoke') {
    // Node-level invocation respects per-node thresholds
    const invocationResult = await invokeAvailableNodes();
    return { ...dynamics, invocationResult };
  }

  if (dynamics.action === 'perceive') {
    // Node-level perception respects per-node thresholds
    const perceptionResult = await invokePerception();
    return { ...dynamics, perceptionResult };
  }

  return dynamics;
}

/**
 * Update the balance port with Control/Intelligence tension state.
 * Exposes homeostat decision to spine for variety tracking.
 */
function updateBalancePort(
  F: number,
  action: 'invoke' | 'perceive' | 'equilibrium'
): void {
  const spine = loadSpine(dao);
  if (!spine) return;

  const totalCapacity = sumCapacity(spine);
  const totalOverflow = sumOverflow(spine);

  // Compute Control/Intelligence priorities from current state
  // Control priority high when F high (need to resolve)
  // Intelligence priority high when F low (room to perceive)
  const controlPriority = totalCapacity > 0 ? F / totalCapacity : 0;
  const intelligencePriority = totalCapacity > 0 ? Math.max(0, 1 - controlPriority) : 0;

  const tension: ControlIntelligenceTension = {
    controlPriority: Math.min(1, controlPriority),
    intelligencePriority: Math.min(1, intelligencePriority),
    resolution: action === 'invoke' ? 'control' : action === 'perceive' ? 'intelligence' : 'balanced',
  };

  // Update balance port state
  spine.balance.currentLoad = totalOverflow;
  spine.balance.overflow = Math.max(0, spine.balance.currentLoad - spine.balance.capacity);
  spine.balance.lastFired = Date.now();

  saveSpine(dao, spine);
}
