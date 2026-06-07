/**
 * Merge Queue
 *
 * Verified work items queue for merge. Process serially per project.
 */

import { mergeBranch, hasConflicts, getConflictFiles, abortMerge, checkoutBranch, getDefaultBranch } from '../operations/git.js';
import { removeWorktree } from '../operations/worktree.js';
import { getChain } from '../coordination/channels/chain.js';
import { listWork } from '../coordination/resources/work.js';
import { releaseScope } from '../coordination/dampen/locks.js';
import { getNode } from '../identity/node.js';

export interface MergeQueueItem {
  workId: string;
  hubId: string;
  hubPath?: string;
  branch: string;
  addedAt: number;
}

const queues = new Map<string, MergeQueueItem[]>();
const processing = new Set<string>();

export function addToMergeQueue(item: MergeQueueItem): void {
  const queue = queues.get(item.hubId) || [];

  if (queue.some(q => q.workId === item.workId)) {
    return;
  }

  queue.push(item);
  queues.set(item.hubId, queue);
}

export function getMergeQueueStatus(hubId: string): {
  pending: number;
  processing: boolean;
} {
  const queue = queues.get(hubId) || [];
  return {
    pending: queue.length,
    processing: processing.has(hubId),
  };
}

export function getMergeQueue(hubId: string): MergeQueueItem[] {
  return queues.get(hubId) || [];
}

export async function processMergeQueue(hubId: string): Promise<void> {
  if (processing.has(hubId)) {
    return;
  }

  const queue = queues.get(hubId);
  if (!queue || queue.length === 0) {
    return;
  }

  processing.add(hubId);

  try {
    while (queue.length > 0) {
      const item = queue[0];
      const success = await mergeItem(item);

      if (success) {
        queue.shift();
      } else {
        queue.shift();
      }
    }
  } finally {
    processing.delete(hubId);
  }
}

async function mergeItem(item: MergeQueueItem): Promise<boolean> {
  const chain = getChain();

  // Resolve context path - try item first, then fall back to context node
  let hubPath = item.hubPath;
  if (!hubPath) {
    const context = await getNode(item.hubId);
    hubPath = context?.settings?.path as string | undefined;
  }

  if (!hubPath) {
    await chain.append('algedonic:pain', 'merge-queue', item.workId, {
      severity: 3,
      source: 'no-context-path',
      message: 'Cannot merge - no context path available',
      hubId: item.hubId,
    });
    return false;
  }

  const defaultBranch = await getDefaultBranch(hubPath);
  await checkoutBranch(defaultBranch, hubPath);

  const result = await mergeBranch(item.branch, hubPath, `Merge work: ${item.workId}`);

  if (!result.success) {
    if (await hasConflicts(hubPath)) {
      const conflictFiles = await getConflictFiles(hubPath);

      console.log(`[MergeQueue] Conflict in ${item.branch}, dispatching resolver...`);
      const resolved = await dispatchConflictResolver(item, conflictFiles, hubPath);

      if (resolved) {
        await removeWorktree(item.workId);
        await releaseScope(item.workId);

        await chain.append('work:merged', 'system', item.workId, {
          branch: item.branch,
          mergedAt: Date.now(),
          resolvedConflict: true,
        });

        console.log(`[MergeQueue] Resolved ${item.branch} via agent`);
        return true;
      }

      await chain.append('algedonic:pain', 'merge-queue', item.workId, {
        severity: 2,
        source: 'merge-conflict',
        message: `Merge conflict in ${conflictFiles.join(', ')} (agent could not resolve)`,
        hubId: item.hubId,
        requiresAttestation: true,
      });

      await abortMerge(hubPath);
      return false;
    }

    await chain.append('algedonic:pain', 'merge-queue', item.workId, {
      severity: 2,
      source: 'merge-failed',
      message: result.error || 'Merge failed',
      hubId: item.hubId,
    });

    return false;
  }

  await removeWorktree(item.workId);
  await releaseScope(item.workId);

  await chain.append('work:merged', 'system', item.workId, {
    branch: item.branch,
    mergedAt: Date.now(),
  });

  console.log(`[MergeQueue] Merged ${item.workId} into ${defaultBranch}`);
  return true;
}

async function dispatchConflictResolver(
  item: MergeQueueItem,
  conflictFiles: string[],
  hubPath: string
): Promise<boolean> {
  const { execute } = await import('./executor.js');
  const { readFileSync } = await import('fs');
  const { join } = await import('path');

  const conflictContents: Record<string, string> = {};
  for (const file of conflictFiles) {
    try {
      const content = readFileSync(join(hubPath, file), 'utf-8');
      conflictContents[file] = content;
    } catch {
      // Skip unreadable files
    }
  }

  const prompt = buildConflictResolverPrompt(item.workId, conflictFiles, conflictContents);

  const result = await execute(prompt, 'claude', {
    workingDir: hubPath,
    autonomous: true,
    timeout: 120000,
  });

  if (!result.success) {
    console.log(`[MergeQueue] Resolver execution failed: ${result.error?.slice(0, 200)}`);
    return false;
  }

  if (await hasConflicts(hubPath)) {
    console.log(`[MergeQueue] Conflicts still present after resolver`);
    return false;
  }

  const { addAll, commit } = await import('./git.js');
  await addAll(hubPath);
  const commitResult = await commit(`Resolve merge conflict: ${item.workId}`, hubPath);

  return commitResult.success;
}

function buildConflictResolverPrompt(
  workId: string,
  conflictFiles: string[],
  conflictContents: Record<string, string>
): string {
  let prompt = `You are resolving a merge conflict.

## Context
Work "${workId}" has been completed and needs to merge to main.
The merge has conflicts that need resolution.

## Conflicting Files
${conflictFiles.join('\n')}

## Your Task
1. Read each conflicted file
2. Understand the intent of BOTH versions (between <<<<<<< and =======, and between ======= and >>>>>>>)
3. Integrate both changes — keep ALL functionality from both sides
4. Remove the conflict markers (<<<<<<, =======, >>>>>>>)
5. Save the resolved files

## Conflict Contents
`;

  for (const [file, content] of Object.entries(conflictContents)) {
    prompt += `\n### ${file}\n\`\`\`\n${content}\n\`\`\`\n`;
  }

  prompt += `
## Important
- Do NOT discard either side's changes
- The goal is INTEGRATION, not choosing one side
- Both versions were written to satisfy different conditions — preserve both intents
- After resolving, the code must work correctly with all features from both branches
`;

  return prompt;
}

export async function rebuildMergeQueue(): Promise<void> {
  const allWork = await listWork({});

  for (const work of allWork) {
    if (work.bountyStatus === 'verified' && work.status !== 'fulfilled') {
      addToMergeQueue({
        workId: work.id,
        hubId: work.hubId,
        hubPath: work.hubPath,
        branch: work.submission?.branch ?? `work/${work.id}`,
        addedAt: work.updatedAt,
      });
    }
  }

  const hubIds = new Set(allWork.map(w => w.hubId));
  for (const hubId of hubIds) {
    const queue = queues.get(hubId);
    if (queue && queue.length > 0) {
      processMergeQueue(hubId);
    }
  }
}
