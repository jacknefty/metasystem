/**
 * Scoped Paths — Recursive viable system paths
 *
 * Every viable system has the same folder shape.
 * at(path) returns an interface that works at any recursion level.
 */

import { join, resolve } from 'path';
import { getDataDir } from './paths.js';

export interface ScopedPaths {
  root: () => string;
  identity: () => string;
  operations: () => string;
  coordination: () => string;
  control: () => string;
  intelligence: () => string;
  audit: () => string;
  bridge: () => string;
  chain: () => string;
  hubs: () => string;
  hub: (id: string) => ScopedPaths;
  epics: () => string;
  epic: (id: string) => ScopedPaths;
  stories: () => string;
  story: (id: string) => ScopedPaths;
  tasks: () => string;
  task: (id: string) => ScopedPaths;
  nodes: () => string;
  node: (id: string) => ScopedPaths;
}

export function at(basePath: string): ScopedPaths {
  return {
    root: () => basePath,
    identity: () => join(basePath, 'identity.md'),
    operations: () => join(basePath, 'operations'),
    coordination: () => join(basePath, 'coordination'),
    control: () => join(basePath, 'control'),
    intelligence: () => join(basePath, 'intelligence'),
    audit: () => join(basePath, 'audit'),
    bridge: () => join(basePath, 'bridge'),
    chain: () => join(basePath, 'chain.jsonl'),
    hubs: () => join(basePath, 'hubs'),
    hub: (id) => at(join(basePath, 'hubs', id)),
    epics: () => join(basePath, 'epics'),
    epic: (id) => at(join(basePath, 'epics', id)),
    stories: () => join(basePath, 'stories'),
    story: (id) => at(join(basePath, 'stories', id)),
    tasks: () => join(basePath, 'tasks'),
    task: (id) => at(join(basePath, 'tasks', id)),
    nodes: () => join(basePath, 'nodes'),
    node: (id) => at(join(basePath, 'nodes', id)),
  };
}

export const dao = at(getDataDir());

export function depth(scope: ScopedPaths): number {
  const rel = scope.root().replace(getDataDir(), '').replace(/^\//, '');
  if (!rel) return 0;
  return rel.split('/').filter(Boolean).length;
}

export function parent(scope: ScopedPaths): ScopedPaths | null {
  const root = scope.root();
  const dataDir = getDataDir();
  if (root === dataDir) return null;
  const resolved = resolve(join(root, '..'));
  if (!resolved.startsWith(dataDir)) return null;
  return at(resolved);
}

export function isWithin(path: string, scope: ScopedPaths): boolean {
  return path.startsWith(scope.root());
}

export function scopeKey(scope: ScopedPaths): string {
  return scope.root();
}

export function getParentPath(scopePath: string): string | null {
  const scope = at(scopePath);
  const p = parent(scope);
  return p ? p.root() : null;
}

/**
 * Check if childPath is a direct child of parentPath (one level down)
 */
function isDirectChild(parentPath: string, childPath: string): boolean {
  if (!childPath.startsWith(parentPath)) return false;
  const remainder = childPath.slice(parentPath.length).replace(/^\//, '');
  const segments = remainder.split('/').filter(Boolean);
  return segments.length === 2;
}

/**
 * List child scopes by querying chain events.
 * Moved from free-energy.ts for broader use.
 */
export async function listChildren(scope: ScopedPaths): Promise<ScopedPaths[]> {
  const { getChain } = await import('../coordination/channels/chain.js');
  const scopePath = scope.root();

  const events = await getChain().recall({
    type: [
      'hub:created',
      'epic:created',
      'story:created',
      'task:created',
      'identity:created',
      'work:created',
    ],
  });

  const children: ScopedPaths[] = [];

  for (const event of events) {
    const payload = event.payload as {
      scopePath?: string;
      parentPath?: string;
      contextPath?: string;
      hubId?: string;
    };

    const eventPath = payload.scopePath || payload.contextPath;
    const parentPath = payload.parentPath;

    if (parentPath === scopePath) {
      if (eventPath) {
        children.push(at(eventPath));
      }
    } else if (eventPath && isDirectChild(scopePath, eventPath)) {
      children.push(at(eventPath));
    }
  }

  return children;
}

