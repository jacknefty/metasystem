/**
 * Scope pattern matching and resolution
 */

import { minimatch } from 'minimatch';
import { resolve, relative } from 'path';

/**
 * Check if a path is within the allowed scope patterns.
 */
export function isInScope(scope: string[], path: string, workspace?: string): boolean {
  const ws = workspace || process.cwd();
  const absolutePath = resolve(ws, path);
  const relativePath = relative(ws, absolutePath);

  if (relativePath.startsWith('..')) {
    return false;
  }

  return scope.some(pattern => {
    if (pattern === '**') return true;

    const normalizedPattern = pattern.startsWith('/')
      ? pattern.slice(1)
      : pattern;

    return minimatch(relativePath, normalizedPattern, { dot: false });
  });
}

/**
 * Resolve scope patterns to actual paths.
 */
export function resolveScopePaths(scope: string[], workspace: string): string[] {
  const resolvedPaths: string[] = [];

  for (const pattern of scope) {
    if (pattern === '**') {
      resolvedPaths.push(workspace);
    } else if (pattern.includes('*')) {
      const base = pattern.split('*')[0].replace(/\/$/, '');
      resolvedPaths.push(resolve(workspace, base));
    } else {
      resolvedPaths.push(resolve(workspace, pattern));
    }
  }

  return [...new Set(resolvedPaths)];
}

/**
 * Check if scopeA is a subset of scopeB (all of A is covered by B).
 */
export function isScopeSubset(scopeA: string[], scopeB: string[]): boolean {
  if (scopeB.includes('**')) return true;

  return scopeA.every(patternA =>
    scopeB.some(patternB => patternCovers(patternB, patternA))
  );
}

/**
 * Check if patternA covers patternB.
 */
function patternCovers(patternA: string, patternB: string): boolean {
  if (patternA === patternB) return true;
  if (patternA === '**') return true;

  if (patternA.endsWith('/**')) {
    const baseA = patternA.slice(0, -3);
    return patternB.startsWith(baseA);
  }

  return false;
}
