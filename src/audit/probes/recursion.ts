/**
 * Recursion Health Probe
 *
 * Checks parent-child reporting relationships:
 * - Are children reporting?
 * - Is parent observing?
 * - Recursion depth sanity
 */

import { at, parent as getParent, depth, listChildren } from '../../identity/scoped-paths.js';
import { loadSpine } from '../../identity/spine.js';
import type { ProbeResult, ProbeFinding } from './types.js';

export async function probeRecursion(scopePath: string): Promise<ProbeResult> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  const findings: ProbeFinding[] = [];
  const now = Date.now();

  if (!spine) {
    return {
      probeType: 'recursion',
      scopeId: scopePath,
      timestamp: now,
      healthy: false,
      findings: [{
        severity: 3,
        category: 'missing_spine',
        message: 'No spine.json found at scope',
      }],
      metrics: {},
    };
  }

  // 1. Check if children are reporting
  const children = await listChildren(scope);

  for (const child of children) {
    const childSpine = loadSpine(child);
    if (!childSpine) continue;

    const timeSinceReport = now - childSpine.report.lastFired;
    if (timeSinceReport > 3600000) { // 1 hour
      findings.push({
        severity: 1,
        category: 'silent_child',
        message: `Child ${childSpine.scopeId} hasn't reported in ${Math.round(timeSinceReport / 3600000)} hours`,
      });
    }
  }

  // 2. Check if parent is observing
  const parentScope = getParent(scope);
  if (parentScope) {
    const parentSpine = loadSpine(parentScope);
    if (parentSpine) {
      const timeSinceObserve = now - parentSpine.observe.lastFired;
      if (timeSinceObserve > 3600000) {
        findings.push({
          severity: 1,
          category: 'unobserved',
          message: `Parent hasn't observed in ${Math.round(timeSinceObserve / 3600000)} hours`,
        });
      }
    }
  }

  // 3. Check recursion depth sanity
  const currentDepth = depth(scope);
  if (currentDepth > 5) {
    findings.push({
      severity: 1,
      category: 'deep_recursion',
      message: `Recursion depth ${currentDepth} — may indicate over-decomposition`,
    });
  }

  return {
    probeType: 'recursion',
    scopeId: spine.scopeId,
    timestamp: now,
    healthy: findings.filter(f => f.severity >= 2).length === 0,
    findings,
    metrics: { childCount: children.length, depth: currentDepth },
  };
}
