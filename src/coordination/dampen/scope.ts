/**
 * Scope Enforcement
 *
 * Ensure nodes only touch files within their declared scope.
 */

import { minimatch } from 'minimatch';
import { getChain } from '../../coordination/channels/chain.js';
import { getWork } from '../../coordination/resources/work.js';
import { getNode } from '../../identity/node.js';

export interface ScopeCheckResult {
  allowed: boolean;
  matchedPattern?: string;
}

export interface ScopeViolation {
  file: string;
  nodeId: string;
  workId: string;
  nodeScope: string[];
}

export function checkFileInScope(
  filePath: string,
  allowedPatterns: string[]
): ScopeCheckResult {
  const normalized = filePath.replace(/^\/+/, '').replace(/\\/g, '/');

  for (const pattern of allowedPatterns) {
    if (minimatch(normalized, pattern, { dot: true })) {
      return { allowed: true, matchedPattern: pattern };
    }
  }

  return { allowed: false };
}

export function filterFilesToScope(
  files: string[],
  allowedPatterns: string[]
): { allowed: string[]; denied: string[] } {
  const allowed: string[] = [];
  const denied: string[] = [];

  for (const file of files) {
    const result = checkFileInScope(file, allowedPatterns);
    if (result.allowed) {
      allowed.push(file);
    } else {
      denied.push(file);
    }
  }

  return { allowed, denied };
}

export async function enforceScope(
  workId: string,
  changedFiles: string[]
): Promise<{ valid: boolean; violations: ScopeViolation[] }> {
  const work = await getWork(workId);
  if (!work || !work.claim) {
    return { valid: true, violations: [] };
  }

  const node = await getNode(work.claim.nodeId);
  if (!node) {
    return { valid: true, violations: [] };
  }

  const nodeScope = node.scope || ['**'];

  if (nodeScope.includes('**')) {
    return { valid: true, violations: [] };
  }

  const { denied } = filterFilesToScope(changedFiles, nodeScope);

  if (denied.length === 0) {
    return { valid: true, violations: [] };
  }

  const violations: ScopeViolation[] = denied.map(file => ({
    file,
    nodeId: work.claim!.nodeId,
    workId,
    nodeScope,
  }));

  await getChain().append('algedonic:pain', 'security', workId, {
    severity: 3,
    source: 'scope-violation',
    message: `Node ${node.id} modified files outside scope: ${denied.join(', ')}`,
  });

  return { valid: false, violations };
}

export async function validateWorkScope(
  workId: string,
  changedFiles: string[]
): Promise<boolean> {
  const result = await enforceScope(workId, changedFiles);
  return result.valid;
}

export function expandScope(patterns: string[]): string {
  return patterns.map(p => {
    if (p === '**') return 'all files';
    if (p.startsWith('src/')) return `source files in ${p}`;
    if (p.endsWith('/**')) return `all files under ${p.replace('/**', '')}`;
    return p;
  }).join(', ');
}
