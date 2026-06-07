/**
 * Scope Compliance Check (S3)
 *
 * Did the node touch files outside its declared scope?
 */

import { execSync } from 'child_process';
import type { CheckFinding } from './types.js';
import { loadIdentity } from '../../../identity/contract.js';
import { getNode } from '../../../identity/node.js';
import { getWork } from '../../../coordination/resources/work.js';
import { getChain } from '../../../coordination/channels/chain.js';
import { checkFileInScope } from '../../../coordination/dampen/scope.js';

export async function checkScopeCompliance(
  nodeId: string,
  workId?: string
): Promise<CheckFinding | null> {
  if (!workId) return null;

  const work = await getWork(workId);
  if (!work) return null;

  const node = await getNode(nodeId);
  const identity = loadIdentity(nodeId);

  const declaredScope = identity?.scope ?? node?.scope ?? ['**'];
  if (declaredScope.includes('**')) return null;

  const touchedFiles = await getTouchedFiles(workId, work.hubPath);
  if (touchedFiles.length === 0) return null;

  const violations = touchedFiles.filter(f => !checkFileInScope(f, declaredScope).allowed);

  if (violations.length > 0) {
    return {
      check: 'scope-compliance',
      evidence: `Touched ${violations.length} files outside scope: ${violations.slice(0, 3).join(', ')}${violations.length > 3 ? '...' : ''}`,
    };
  }

  return null;
}

async function getTouchedFiles(workId: string, hubPath?: string): Promise<string[]> {
  const events = await getChain().recall({ subject: workId, type: 'work:submitted' });
  if (events.length === 0) return [];

  const submitEvent = events[events.length - 1];
  const payload = submitEvent.payload as { branch?: string };
  const branch = payload.branch;

  if (!branch) return [];

  const cwd = hubPath ?? process.cwd();

  try {
    const output = execSync(`git diff --name-only main...${branch}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    try {
      const output = execSync(`git diff --name-only master...${branch}`, {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
      });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
