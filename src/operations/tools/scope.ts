/**
 * Scope Enforcement for Tools
 *
 * Detects and validates path parameters against node scope.
 */

import type { ToolSpec } from './types.js';

const PATH_PARAM_PATTERNS = [
  'path',
  'file',
  'file_path',
  'filepath',
  'directory',
  'dir',
  'folder',
  'target',
  'destination',
  'source',
  'src',
  'dest',
  'input',
  'output',
  'location',
  'cwd',
  'working_dir',
  'workdir',
];

const PATH_VALUE_PATTERNS = [
  /^[.~]?\//,
  /^[a-zA-Z]:\\/,
  /\.(ts|js|json|md|txt|yaml|yml|toml|sh|py|rb|go|rs)$/i,
  /\/[^/]+\.[^/]+$/,
];

export interface PathValidation {
  valid: boolean;
  violations: Array<{
    parameter: string;
    path: string;
    reason: string;
  }>;
}

export function extractPaths(
  spec: ToolSpec,
  parameters: Record<string, unknown>
): Array<{ param: string; path: string }> {
  const paths: Array<{ param: string; path: string }> = [];

  if (spec.pathParameters && spec.pathParameters.length > 0) {
    for (const param of spec.pathParameters) {
      const value = parameters[param];
      if (typeof value === 'string') {
        paths.push({ param, path: value });
      }
    }
    return paths;
  }

  const shouldAutoDetect =
    spec.autoDetectPaths !== false &&
    spec.capabilities.some(c => c.startsWith('file:') || c.startsWith('git:'));

  if (!shouldAutoDetect) {
    return paths;
  }

  for (const [param, value] of Object.entries(parameters)) {
    if (typeof value !== 'string') continue;

    const paramLower = param.toLowerCase();
    const nameMatch = PATH_PARAM_PATTERNS.some(p => paramLower.includes(p));
    const valueMatch = PATH_VALUE_PATTERNS.some(p => p.test(value));

    if (nameMatch || valueMatch) {
      paths.push({ param, path: value });
    }
  }

  return paths;
}

export function validatePaths(
  paths: Array<{ param: string; path: string }>,
  scope: string[]
): PathValidation {
  const violations: PathValidation['violations'] = [];

  for (const { param, path } of paths) {
    if (!isPathInScope(path, scope)) {
      violations.push({
        parameter: param,
        path,
        reason: 'Path outside node scope',
      });
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

export function isPathInScope(path: string, scope: string[]): boolean {
  const normalized = normalizePath(path);

  for (const pattern of scope) {
    if (pattern === '**') return true;
    if (matchGlob(normalized, pattern)) return true;
  }

  return false;
}

function normalizePath(path: string): string {
  let p = path.replace(/^\.\//, '');
  p = p.replace(/^\/+/, '');
  p = p.replace(/^~\//, '');

  const parts = p.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

function matchGlob(path: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '<<<GLOBSTAR>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<GLOBSTAR>>>/g, '.*') +
      '($|/)'
  );

  return regex.test(path);
}

export function intersectScopes(parentScope: string[], childScope: string[]): string[] {
  if (childScope.includes('**')) return parentScope;
  if (parentScope.includes('**')) return childScope;

  return childScope.filter(c =>
    parentScope.some(p => patternContains(p, c))
  );
}

function patternContains(parent: string, child: string): boolean {
  if (parent === '**') return true;
  if (parent === child) return true;

  const parentNorm = parent.replace(/\*\*$/, '');
  const childNorm = child.replace(/\*\*$/, '');

  return childNorm.startsWith(parentNorm);
}
