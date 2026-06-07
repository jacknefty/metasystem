/**
 * Runtime — Reactive Event Handlers
 *
 * Event-driven main loop. No polling.
 */

import { getChain } from './coordination/channels/chain.js';
import { getWork, postBounty } from './coordination/resources/work.js';
import { runDynamicsControlTick } from './control/balance/homeostat.js';
import { runVerification } from './control/verify/runner.js';
import { executeWork, finalizeWork } from './operations/execute.js';
import { rebuildLocks, clearStaleLocks } from './coordination/dampen/locks.js';
import { maybeRunHousekeeping, clearStarvationSignal, clearHoardingSignal } from './coordination/dampen/housekeeping.js';
import { selfAssess } from './audit/assess.js';
import { evolveAgent } from './control/dynamics/index.js';
import { addToMergeQueue, processMergeQueue, rebuildMergeQueue } from './operations/merge-queue.js';
import { recordOutcome } from './intelligence/learn/recorder.js';
import { registerProvider, refreshTools } from './operations/tools/index.js';
import { builtinProvider } from './operations/tools/builtin/index.js';
import { mcpProvider, connectAll as connectMCP } from './operations/tools/mcp/index.js';
import { loadStats as loadToolStats } from './operations/tools/reliability.js';
import { runToolAuditPass } from './operations/tools/audit.js';
import { finalizeProposal } from './coordination/governance/index.js';
import { maybeCommitMerkleRoot } from './coordination/bridge/auto-commit.js';
import { checkIdentityRoot } from './identity/sync.js';
import type { ChainEvent } from './coordination/channels/events.js';

let running = false;
const expiryTimeouts = new Map<string, NodeJS.Timeout>();
const proposalTimeouts = new Map<string, NodeJS.Timeout>();
let merkleCommitInterval: NodeJS.Timeout | null = null;
let identityRootInterval: NodeJS.Timeout | null = null;

export async function initializeTools(): Promise<void> {
  registerProvider(builtinProvider);
  registerProvider(mcpProvider);
  loadToolStats();
  await connectMCP();
  await refreshTools();
}

export function startRuntime(): () => void {
  if (running) return () => stopRuntime();
  running = true;

  const chain = getChain();
  // Increase max listeners — we have many event handlers
  if (typeof (chain as any).setMaxListeners === 'function') {
    (chain as any).setMaxListeners(20);
  }

  // Any variety event → check dynamics homeostat (bidirectional)
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type.startsWith('variety:')) {
      try {
        const result = await runDynamicsControlTick();

        if (result.invocationResult?.workAssigned.length) {
          console.log(`[Runtime] Dynamics invoked ${result.invocationResult.workAssigned.length} workers (F=${result.F.toFixed(2)})`);
        }

        if (result.perceptionResult?.totalFindings) {
          console.log(`[Runtime] Dynamics triggered perception: ${result.perceptionResult.totalFindings} findings (F=${result.F.toFixed(2)})`);
        }

        // Sporadic tool audit (5% chance on variety events)
        if (Math.random() < 0.05) {
          runToolAuditPass().catch(err => {
            console.error('[Runtime] Tool audit failed:', err);
          });
        }
      } catch (err) {
        await emitPain('dynamics', event.subject, err);
      }
    }
  });

  // work:submitted → run verification
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:submitted') {
      try {
        console.log(`[Runtime] Verifying ${event.subject}...`);
        await runVerification(event.subject);
      } catch (err) {
        await emitPain('verification', event.subject, err);
      }
    }
  });

  // work:verified → finalize + merge queue (if passed)
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:verified') {
      try {
        const payload = event.payload as { passed: boolean };
        await finalizeWork(event.subject, payload.passed);

        if (payload.passed) {
          const work = await getWork(event.subject);
          if (work && work.submission?.branch) {
            addToMergeQueue({
              workId: work.id,
              hubId: work.hubId,
              hubPath: work.hubPath,
              branch: work.submission.branch,
              addedAt: Date.now(),
            });
            processMergeQueue(work.hubId);
          }
        }
      } catch (err) {
        await emitPain('finalize', event.subject, err);
      }
    }
  });

  // work:posted → schedule expiry timeout (one-shot, not poll)
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:posted') {
      const payload = event.payload as { bounty: { expiresAt?: number } };
      if (payload.bounty.expiresAt) {
        scheduleExpiry(event.subject, payload.bounty.expiresAt);
      }
    }
  });

  // work:claimed → clear expiry + execute work
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:claimed') {
      clearExpiry(event.subject);

      const payload = event.payload as { nodeId: string };
      try {
        console.log(`[Runtime] Executing ${event.subject} with node ${payload.nodeId}...`);
        await executeWork(event.subject, payload.nodeId);
      } catch (err) {
        await emitPain('execution', event.subject, err);
      }
    }
  });

  // work:completed → clear expiry timeout
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:completed') {
      clearExpiry(event.subject);
    }
  });

  // work:completed/failed → record learning outcome
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:completed' || event.type === 'work:failed') {
      try {
        await recordOutcome(event.subject);
      } catch (err) {
        console.error('[Runtime] Failed to record learning outcome:', err);
      }
    }
  });

  // Housekeeping on work state changes
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;

    if (['work:posted', 'work:claimed', 'work:completed', 'work:released', 'work:expired'].includes(event.type)) {
      // Clear starvation/hoarding signals when state changes
      if (event.type === 'work:claimed' || event.type === 'work:expired') {
        clearStarvationSignal(event.subject);
      }
      if (event.type === 'work:completed' || event.type === 'work:released') {
        const payload = event.payload as { nodeId?: string };
        if (payload.nodeId) clearHoardingSignal(payload.nodeId);
      }

      await maybeRunHousekeeping();
    }
  });

  // work:merged → self-assessment
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:merged') {
      try {
        await selfAssess(event.subject);
      } catch (err) {
        console.error('[Runtime] Self-assessment failed:', err);
      }
    }
  });

  // Dynamics evolution on state-changing events
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:claimed') {
      const payload = event.payload as { nodeId: string };
      await evolveAgent(payload.nodeId, 1.0);
    }
  });

  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:completed') {
      const payload = event.payload as { nodeId: string };
      await evolveAgent(payload.nodeId, 1.0);
    }
  });

  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:released') {
      const payload = event.payload as { nodeId: string };
      await evolveAgent(payload.nodeId, 1.0);
    }
  });

  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'credit:earned') {
      const payload = event.payload as { nodeId: string };
      await evolveAgent(payload.nodeId, 1.0);
    }
  });

  // P0 Fix: algedonic:pain → take action based on severity
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'algedonic:pain') {
      const payload = event.payload as {
        severity: 1 | 2 | 3;
        source: string;
        message: string;
        hubId?: string;
      };

      console.log(`[Algedonic] Pain signal: severity=${payload.severity} source=${payload.source} message=${payload.message}`);

      if (payload.severity >= 2) {
        if (payload.hubId) {
          await getChain().append('hub:attention', 'algedonic', payload.hubId, {
            reason: payload.message,
            source: payload.source,
            severity: payload.severity,
          });
        }
        await maybeRunHousekeeping();
      }

      if (payload.severity >= 3) {
        console.warn(`[Algedonic] CRITICAL: ${payload.message}`);
      }
    }
  });

  // algedonic:acknowledged → log resumption
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'algedonic:acknowledged') {
      console.log(`[Algedonic] Signal acknowledged: ${event.subject}`);
    }
  });

  // P1 Fix: proposal:created → schedule finalization on deadline
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'proposal:created') {
      const payload = event.payload as { id: string; deadline: number };
      scheduleProposalFinalization(payload.id, payload.deadline);
    }
  });

  // P2 Fix: work:created → auto-post bounty if amount specified
  chain.on('event', async (event: ChainEvent) => {
    if (!running) return;
    if (event.type === 'work:created') {
      const payload = event.payload as { bountyAmount?: number };
      if (payload.bountyAmount && payload.bountyAmount > 0) {
        try {
          await postBounty(event.subject, payload.bountyAmount);
          console.log(`[Runtime] Auto-posted bounty for ${event.subject}: ${payload.bountyAmount}`);
        } catch (err) {
          console.error('[Runtime] Failed to auto-post bounty:', err);
        }
      }
    }
  });

  // Rebuild locks and merge queue from chain on startup
  rebuildLocks().catch(err => {
    console.error('[Runtime] Failed to rebuild locks:', err);
  });

  clearStaleLocks(5 * 60 * 1000).catch(err => {
    console.error('[Runtime] Failed to clear stale locks:', err);
  });

  rebuildMergeQueue().catch(err => {
    console.error('[Runtime] Failed to rebuild merge queue:', err);
  });

  // Fix 3: Periodic Merkle root commit (every 30s)
  merkleCommitInterval = setInterval(async () => {
    try {
      const result = await maybeCommitMerkleRoot();
      if (result.committed) {
        console.log(`[Bridge] Committed Merkle root: ${result.root} (${result.creditCount} credits)`);
      }
    } catch (err) {
      console.error('[Bridge] Merkle commit failed:', err);
    }
  }, 30_000);

  // Identity root sync (every 60s)
  identityRootInterval = setInterval(async () => {
    try {
      const result = await checkIdentityRoot();
      if (result.changed) {
        console.log(`[Identity] Root changed: ${result.root.slice(0, 8)}... (${result.leafCount} identities)`);
      }
    } catch (err) {
      console.error('[Identity] Root check failed:', err);
    }
  }, 60_000);

  // Initial identity root check
  checkIdentityRoot().catch(err => {
    console.error('[Identity] Initial root check failed:', err);
  });

  console.log('[Runtime] Started (event-driven)');
  console.log('  - variety:env:in → dynamics check + sporadic tool audit');
  console.log('  - work:claimed → execute work');
  console.log('  - work:submitted → verification');
  console.log('  - work:verified → finalize + merge queue');
  console.log('  - work:posted → schedule expiry');
  console.log('  - work:completed/failed → learning record');
  console.log('  - work state changes → housekeeping');
  console.log('  - work:merged → self-assessment');
  console.log('  - dynamics evolution on state changes');
  console.log('  - algedonic:pain → severity-based action');
  console.log('  - proposal:created → schedule finalization');
  console.log('  - work:created → auto-post bounty');
  console.log('  - merkle:committed → periodic (30s)');
  console.log('  - identity:root:changed → periodic (60s)');
  console.log('  - tools registered: builtin + MCP');

  return () => stopRuntime();
}

export function stopRuntime(): void {
  if (!running) return;
  running = false;

  for (const timeout of expiryTimeouts.values()) {
    clearTimeout(timeout);
  }
  expiryTimeouts.clear();

  for (const timeout of proposalTimeouts.values()) {
    clearTimeout(timeout);
  }
  proposalTimeouts.clear();

  if (merkleCommitInterval) {
    clearInterval(merkleCommitInterval);
    merkleCommitInterval = null;
  }

  if (identityRootInterval) {
    clearInterval(identityRootInterval);
    identityRootInterval = null;
  }

  console.log('[Runtime] Stopped');
}

export function isRuntimeRunning(): boolean {
  return running;
}

function scheduleExpiry(workId: string, expiresAt: number): void {
  const delay = expiresAt - Date.now();
  if (delay <= 0) return;

  const timeout = setTimeout(async () => {
    expiryTimeouts.delete(workId);
    const work = await getWork(workId);
    if (work?.bountyStatus === 'posted') {
      await getChain().append('work:expired', 'system', workId, {
        expiredAt: Date.now(),
      });
    }
  }, delay);

  expiryTimeouts.set(workId, timeout);
}

function clearExpiry(workId: string): void {
  const timeout = expiryTimeouts.get(workId);
  if (timeout) {
    clearTimeout(timeout);
    expiryTimeouts.delete(workId);
  }
}

function scheduleProposalFinalization(proposalId: string, deadline: number): void {
  const delay = deadline - Date.now();

  if (delay <= 0) {
    finalizeProposal(proposalId).catch(err => {
      console.error(`[Governance] Failed to finalize ${proposalId}:`, err);
    });
    return;
  }

  const timeout = setTimeout(async () => {
    proposalTimeouts.delete(proposalId);
    try {
      const result = await finalizeProposal(proposalId);
      if (result) {
        console.log(`[Governance] Finalized ${proposalId}: ${result.status}`);
      }
    } catch (err) {
      console.error(`[Governance] Failed to finalize ${proposalId}:`, err);
    }
  }, delay);

  proposalTimeouts.set(proposalId, timeout);
}

async function emitPain(source: string, subject: string, err: unknown): Promise<void> {
  console.error(`[Runtime] ${source} error for ${subject}:`, err);
  try {
    await getChain().append('algedonic:pain', 'runtime', subject, {
      severity: 2,
      source,
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  } catch {
    // Ignore errors emitting pain
  }
}
