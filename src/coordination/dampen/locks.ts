/**
 * Scope Locking
 *
 * Prevents oscillation by ensuring only one node works on overlapping scopes.
 */

import { getChain } from '../../coordination/channels/chain.js';
import type { ChainEvent } from '../../coordination/channels/events.js';

export interface ScopeLock {
  nodeId: string;
  scope: string[];
  workId: string;
  acquiredAt: number;
}

const locks = new Map<string, ScopeLock>();

function patternsIntersect(a: string, b: string): boolean {
  const normalize = (p: string) => p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  const regexA = new RegExp(`^${normalize(a)}`);
  const regexB = new RegExp(`^${normalize(b)}`);

  const baseA = a.replace(/\*.*$/, '');
  const baseB = b.replace(/\*.*$/, '');

  return regexA.test(baseB) || regexB.test(baseA) ||
         baseA.startsWith(baseB) || baseB.startsWith(baseA);
}

function scopesOverlap(a: string[], b: string[]): boolean {
  for (const patternA of a) {
    for (const patternB of b) {
      if (patternsIntersect(patternA, patternB)) return true;
    }
  }
  return false;
}

export interface AcquireResult {
  acquired: boolean;
  conflictsWith?: string;
  conflictScope?: string[];
  conflictWorkId?: string;
}

export async function acquireScope(
  nodeId: string,
  workId: string,
  scope: string[]
): Promise<AcquireResult> {
  for (const [lockedWorkId, lock] of locks) {
    if (lockedWorkId !== workId && scopesOverlap(scope, lock.scope)) {
      return {
        acquired: false,
        conflictsWith: lock.nodeId,
        conflictScope: lock.scope,
        conflictWorkId: lockedWorkId,
      };
    }
  }

  const acquiredAt = Date.now();
  locks.set(workId, { nodeId, scope, workId, acquiredAt });

  await getChain().append('scope:acquired', nodeId, workId, {
    scope,
    acquiredAt,
  });

  return { acquired: true };
}

export async function releaseScope(workId: string): Promise<void> {
  const lock = locks.get(workId);
  if (!lock) return;

  const heldForMs = Date.now() - lock.acquiredAt;
  locks.delete(workId);

  await getChain().append('scope:released', lock.nodeId, workId, {
    scope: lock.scope,
    heldForMs,
  });
}

export function getLock(workId: string): ScopeLock | undefined {
  return locks.get(workId);
}

export function getActiveLocks(): ScopeLock[] {
  return Array.from(locks.values());
}

export function isScopeLocked(scope: string[]): { locked: boolean; byNode?: string; byWork?: string } {
  for (const [workId, lock] of locks) {
    if (scopesOverlap(scope, lock.scope)) {
      return { locked: true, byNode: lock.nodeId, byWork: workId };
    }
  }
  return { locked: false };
}

export async function clearStaleLocks(maxAgeMs: number = 5 * 60 * 1000): Promise<string[]> {
  const now = Date.now();
  const cleared: string[] = [];

  for (const [workId, lock] of locks) {
    if (now - lock.acquiredAt > maxAgeMs) {
      await releaseScope(workId);
      cleared.push(workId);
    }
  }

  return cleared;
}

export async function rebuildLocks(): Promise<void> {
  locks.clear();

  const events = await getChain().recall({});

  const byWork = new Map<string, ChainEvent>();
  for (const e of events) {
    if (e.type === 'scope:acquired' || e.type === 'scope:released') {
      const existing = byWork.get(e.subject);
      if (!existing || e.timestamp > existing.timestamp) {
        byWork.set(e.subject, e);
      }
    }
  }

  for (const [workId, event] of byWork) {
    if (event.type === 'scope:acquired') {
      const p = event.payload as { scope: string[]; acquiredAt: number };
      locks.set(workId, {
        nodeId: event.emitter,
        scope: p.scope,
        workId,
        acquiredAt: p.acquiredAt,
      });
    }
  }
}
