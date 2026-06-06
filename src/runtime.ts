/**
 * Runtime — Reactive Event Handlers
 *
 * Event-driven main loop. No polling.
 */

import { getChain } from './coordination/channels/chain.js';
import { getWork } from './coordination/resources/work.js';
import { runDynamicsControlTick } from './control/balance/homeostat.js';
import { runVerification } from './control/verify/runner.js';
import { executeWork, finalizeWork } from './operation/execute.js';
import { rebuildLocks, clearStaleLocks } from './coordination/dampen/locks.js';
import { maybeRunHousekeeping, clearStarvationSignal, clearHoardingSignal } from './coordination/dampen/housekeeping.js';
import { selfAssess } from './audit/assess.js';
import { evolveAgent } from './control/dynamics/index.js';
import { addToMergeQueue, processMergeQueue, rebuildMergeQueue } from './operation/merge-queue.js';
import { recordOutcome } from './intelligence/learn/recorder.js';
import { registerProvider, refreshTools } from './tools/index.js';
import { builtinProvider } from './tools/builtin/index.js';
import { mcpProvider, connectAll as connectMCP } from './tools/mcp/index.js';
import { loadStats as loadToolStats } from './tools/reliability.js';
import { runToolAuditPass } from './tools/audit.js';
import type { ChainEvent } from './coordination/channels/events.js';

let running = false;
const expiryTimeouts = new Map<string, NodeJS.Timeout>();

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
              contextId: work.contextId,
              contextPath: work.contextPath,
              branch: work.submission.branch,
              addedAt: Date.now(),
            });
            processMergeQueue(work.contextId);
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
