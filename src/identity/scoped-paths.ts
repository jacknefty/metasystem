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
  operation: () => string;
  coordination: () => string;
  control: () => string;
  intelligence: () => string;
  chain: () => string;
  contexts: () => string;
  context: (id: string) => ScopedPaths;
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
    operation: () => join(basePath, 'operation'),
    coordination: () => join(basePath, 'coordination'),
    control: () => join(basePath, 'control'),
    intelligence: () => join(basePath, 'intelligence'),
    chain: () => join(basePath, 'chain.jsonl'),
    contexts: () => join(basePath, 'contexts'),
    context: (id) => at(join(basePath, 'contexts', id)),
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

