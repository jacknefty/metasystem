/**
 * PM Session — File-based conversation state
 *
 * Sessions persisted to ~/.metasystem/pm-sessions/
 */

import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getDataDir } from '../../../identity/paths.js';
import type { PMSession, PMPhase, PartialContract, WorkGraph, ConversationTurn } from './types.js';

function getSessionsDir(): string {
  const dir = join(getDataDir(), 'pm-sessions');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function createSession(contextId: string): PMSession {
  console.log(`[PM:Session] Creating session for context ${contextId}`);
  const session: PMSession = {
    id: `pm_${randomUUID()}`,
    contextId,
    phase: 'perceiving',
    partialContract: {
      problem: null,
      successMetric: null,
      scopeIn: null,
      scopeOut: null,
      constraints: null,
      assumptions: null,
      risks: null,
    },
    finalContract: null,
    workGraph: null,
    conversationHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  saveSession(session);
  return session;
}

export function getSession(sessionId: string): PMSession | null {
  const path = join(getSessionsDir(), `${sessionId}.json`);
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export function getSessionByContext(contextId: string): PMSession | null {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return null;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const session = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        if (session.contextId === contextId && session.phase !== 'complete') {
          return session;
        }
      } catch {}
    }
  } catch {}

  return null;
}

export async function listSessions(contextId?: string): Promise<PMSession[]> {
  const dir = getSessionsDir();
  const sessions: PMSession[] = [];

  if (!existsSync(dir)) return sessions;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const session = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        if (!contextId || session.contextId === contextId) {
          sessions.push(session);
        }
      } catch {}
    }
  } catch {}

  return sessions;
}

export function clearSession(contextId: string): boolean {
  const dir = getSessionsDir();
  if (!existsSync(dir)) return false;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const session = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        if (session.contextId === contextId) {
          unlinkSync(join(dir, file));
          console.log(`[PM:Session] Cleared session ${session.id} for context ${contextId}`);
          return true;
        }
      } catch {}
    }
  } catch {}

  return false;
}

export function deleteSession(sessionId: string): boolean {
  const path = join(getSessionsDir(), `${sessionId}.json`);
  if (existsSync(path)) {
    unlinkSync(path);
    return true;
  }
  return false;
}

export function saveSession(session: PMSession): void {
  try {
    const dir = getSessionsDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    session.updatedAt = Date.now();
    const path = join(dir, `${session.id}.json`);
    writeFileSync(path, JSON.stringify(session, null, 2));
    console.log(`[PM:Session] Saved ${session.id} to ${path}`);
  } catch (err) {
    console.error('[PM:Session] Failed to save:', err);
  }
}

export function addTurn(
  session: PMSession,
  role: 'user' | 'pm' | 'system',
  content: string,
  gapsAddressed?: string[]
): PMSession {
  session.conversationHistory.push({
    role,
    content,
    timestamp: Date.now(),
    gapsAddressed,
  });
  saveSession(session);
  return session;
}

export function transitionPhase(session: PMSession, newPhase: PMPhase): PMSession {
  console.log(`[PM:Session] ${session.id}: ${session.phase} → ${newPhase}`);
  session.phase = newPhase;
  saveSession(session);
  return session;
}

export function setPartialContract(session: PMSession, partial: PartialContract): PMSession {
  session.partialContract = partial;
  saveSession(session);
  return session;
}

export function setWorkGraph(session: PMSession, graph: WorkGraph): PMSession {
  session.workGraph = graph;
  session.finalContract = graph.contract;
  saveSession(session);
  return session;
}
