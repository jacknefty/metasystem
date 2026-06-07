/**
 * Tool Learning
 *
 * Track reliability of tools per scope.
 * Feeds into action selection — prefer reliable tools.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { ToolResult } from './types.js';
import { paths } from '../../identity/paths.js';
import { emitPain, emitPleasure } from '../../coordination/channels/algedonic.js';

interface ToolStats {
  toolId: string;
  scope: string;
  successes: number;
  failures: number;
  totalDurationMs: number;
  lastUsed: number;
}

const statsStore = new Map<string, ToolStats>();

const FAILURE_THRESHOLD = 5;
const RELIABILITY_FLOOR = 0.5;
const RECOVERY_THRESHOLD = 0.8;

const signaledDegradation = new Set<string>();
const signaledRecovery = new Set<string>();

function statsKey(toolId: string, scope: string): string {
  return `${toolId}:${scope}`;
}

function getStatsPath(): string {
  return paths.tools.stats();
}

export function loadStats(): void {
  const path = getStatsPath();
  if (!existsSync(path)) return;

  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    for (const [key, stats] of Object.entries(data)) {
      statsStore.set(key, stats as ToolStats);
    }
    console.log(`[Tools] Loaded stats for ${statsStore.size} tool/scope combinations`);
  } catch (err) {
    console.error('[Tools] Failed to load stats:', err);
  }
}

export function saveStats(): void {
  const path = getStatsPath();
  const dir = dirname(path);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const data = Object.fromEntries(statsStore);
  writeFileSync(path, JSON.stringify(data, null, 2));
}

export async function recordToolOutcome(
  toolId: string,
  context: { nodeId: string; workId?: string },
  result: ToolResult
): Promise<void> {
  const scopes = ['global', context.nodeId];
  if (context.workId) scopes.push(context.workId);

  for (const scope of scopes) {
    const key = statsKey(toolId, scope);
    const existing = statsStore.get(key) ?? {
      toolId,
      scope,
      successes: 0,
      failures: 0,
      totalDurationMs: 0,
      lastUsed: 0,
    };

    if (result.success) {
      existing.successes++;
    } else {
      existing.failures++;
    }
    existing.totalDurationMs += result.durationMs;
    existing.lastUsed = Date.now();

    statsStore.set(key, existing);
  }

  // Check for degradation/recovery on global scope
  const globalKey = statsKey(toolId, 'global');
  const stats = statsStore.get(globalKey);

  if (stats && stats.failures >= FAILURE_THRESHOLD) {
    const reliability = getToolReliability(toolId, 'global');

    if (reliability < RELIABILITY_FLOOR && !signaledDegradation.has(toolId)) {
      signaledDegradation.add(toolId);
      signaledRecovery.delete(toolId);

      await emitPain(
        'tool-degradation',
        toolId,
        `Tool ${toolId} reliability dropped to ${(reliability * 100).toFixed(0)}% (${stats.failures} failures)`,
        2
      );
    }

    if (reliability >= RECOVERY_THRESHOLD && signaledDegradation.has(toolId) && !signaledRecovery.has(toolId)) {
      signaledRecovery.add(toolId);
      signaledDegradation.delete(toolId);

      await emitPleasure(
        'tool-recovery',
        toolId,
        `Tool ${toolId} reliability recovered to ${(reliability * 100).toFixed(0)}%`,
        1
      );
    }
  }

  saveStats();
}

export function getToolReliability(
  toolId: string,
  scope: string = 'global'
): number {
  const stats = statsStore.get(statsKey(toolId, scope));
  if (!stats || stats.successes + stats.failures === 0) {
    return 0.5;
  }

  return stats.successes / (stats.successes + stats.failures);
}

export function getToolStats(toolId: string, scope?: string): ToolStats | null {
  return statsStore.get(statsKey(toolId, scope ?? 'global')) ?? null;
}

export function getAverageLatency(toolId: string, scope: string = 'global'): number {
  const stats = statsStore.get(statsKey(toolId, scope));
  if (!stats || stats.successes + stats.failures === 0) {
    return 0;
  }
  return stats.totalDurationMs / (stats.successes + stats.failures);
}

export function selectTool(
  candidates: string[],
  scope: string = 'global',
  β: number = 1.0
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const weights = candidates.map(toolId => {
    const reliability = getToolReliability(toolId, scope);
    return Math.exp(β * reliability);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  const r = Math.random() * total;

  let cumulative = 0;
  for (let i = 0; i < candidates.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return candidates[i];
  }

  return candidates[candidates.length - 1];
}

export async function checkToolHealth(): Promise<{
  healthy: string[];
  degraded: string[];
  failed: string[];
}> {
  const healthy: string[] = [];
  const degraded: string[] = [];
  const failed: string[] = [];

  for (const [key, stats] of statsStore) {
    if (!key.endsWith(':global')) continue;

    const toolId = stats.toolId;
    const reliability = getToolReliability(toolId, 'global');

    if (reliability >= 0.9) {
      healthy.push(toolId);
    } else if (reliability >= 0.5) {
      degraded.push(toolId);
    } else {
      failed.push(toolId);
    }
  }

  return { healthy, degraded, failed };
}
