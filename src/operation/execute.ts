/**
 * Operation — Execute Work (S1)
 *
 * The atomic work unit: claim → execute → submit.
 * Security context wraps execution for scope enforcement.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { getWork, submitWork, releaseWork, completeWork } from '../coordination/resources/work.js';
import { emitVariety, getResolution, mintCredit } from '../coordination/resources/token.js';
import { getChain } from '../coordination/channels/chain.js';
import { getNode } from '../identity/node.js';
import { acquireScope, releaseScope } from '../coordination/dampen/locks.js';
import { execute } from './executor.js';
import { createWorktree, removeWorktree } from './worktree.js';
import { addAll, commit } from './git.js';
import {
  getBoundaryProvider,
  withSecurityContextAsync,
  type SecurityContext,
} from '../identity/boundary/index.js';

export interface WorkExecutionResult {
  success: boolean;
  workId: string;
  nodeId: string;
  branch?: string;
  error?: string;
  attempts: number;
  durationMs?: number;
}

export interface OperationContext {
  workId: string;
  nodeId: string;
  workName: string;
  conditions: Array<{ id: string; description: string; verifier: string }>;
  varietyBits: number;
  executor: string;
  contextPath?: string;
}

export async function buildContext(
  workId: string,
  nodeId: string
): Promise<OperationContext | null> {
  const work = await getWork(workId);
  const worker = await getNode(nodeId);

  if (!work || !worker) return null;

  const varietyBits = work.conditions.reduce(
    (sum, c) => sum + (c.varietyWeight ?? 10),
    0
  );

  return {
    workId,
    nodeId,
    workName: work.name,
    conditions: work.conditions.map(c => ({
      id: c.id,
      description: c.description,
      verifier: c.verifier,
    })),
    varietyBits,
    executor: worker.settings.executor ?? 'claude',
    contextPath: work.contextPath,
  };
}

function buildInstruction(context: OperationContext): string {
  const conditions = context.conditions
    .map(c => `- ${c.description}`)
    .join('\n');

  return `Complete this work item:

Name: ${context.workName}

Conditions that must be met:
${conditions}

When done, ensure all conditions are verifiable.`;
}

export async function executeWork(
  workId: string,
  nodeId: string
): Promise<WorkExecutionResult> {
  const work = await getWork(workId);
  const worker = await getNode(nodeId);
  const chain = getChain();

  if (!work) {
    return { success: false, workId, nodeId, error: 'Work not found', attempts: 0 };
  }

  if (!worker) {
    return { success: false, workId, nodeId, error: 'Worker not found', attempts: 0 };
  }

  if (work.claim?.nodeId !== nodeId) {
    return { success: false, workId, nodeId, error: 'Worker does not hold claim', attempts: 0 };
  }

  // Resolve context path - try work first, then fall back to context node
  let contextPath: string | undefined = work.contextPath;
  if (!contextPath && work.contextId) {
    const context = await getNode(work.contextId);
    contextPath = context?.settings?.path as string | undefined;
  }

  if (!contextPath) {
    await chain.append('algedonic:pain', 'executor', workId, {
      severity: 3,
      source: 'no-context-path',
      message: 'Work has no project path - cannot execute without a filesystem location',
      contextId: work.contextId,
    });

    return {
      success: false,
      workId,
      nodeId,
      error: 'Work has no project path. Set path in project settings.',
      attempts: 0,
    };
  }

  // Check for git repo
  if (!existsSync(join(contextPath, '.git'))) {
    await chain.append('algedonic:pain', 'executor', workId, {
      severity: 3,
      source: 'no-git-repo',
      message: `Project path ${contextPath} is not a git repository`,
      contextId: work.contextId,
    });

    return {
      success: false,
      workId,
      nodeId,
      error: 'Project is not a git repository. Initialize with `git init` first.',
      attempts: 0,
    };
  }

  // Acquire scope lock before execution
  const lockResult = await acquireScope(nodeId, workId, worker.scope);
  if (!lockResult.acquired) {
    return {
      success: false,
      workId,
      nodeId,
      error: `Scope conflict with ${lockResult.conflictsWith} on ${lockResult.conflictScope?.join(', ')}`,
      attempts: 0,
    };
  }

  const context = await buildContext(workId, nodeId);
  if (!context) {
    return { success: false, workId, nodeId, error: 'Could not build context', attempts: 1 };
  }

  // Create security context for this execution
  const securityProvider = getBoundaryProvider(worker.settings.securityMode);
  let securityCtx: SecurityContext;
  try {
    securityCtx = await securityProvider.createContext({
      identity: nodeId,
      scope: worker.scope,
      workId,
      capabilities: [],
    });
  } catch (err) {
    return {
      success: false,
      workId,
      nodeId,
      error: `Security context creation failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      attempts: 0,
    };
  }

  // Check execute permission
  const executeCheck = await securityProvider.checkAccess(securityCtx, {
    type: 'execute',
    workId,
  });

  if (!executeCheck.allowed) {
    await securityProvider.invalidateSession(securityCtx.sessionId);
    return {
      success: false,
      workId,
      nodeId,
      error: `Execute permission denied: ${executeCheck.reason}`,
      attempts: 0,
    };
  }

  // Wrap execution in security context
  return withSecurityContextAsync(securityCtx, async () => {
    // Create isolated worktree
    let worktree;
    try {
      worktree = await createWorktree(workId, contextPath);
    } catch (err) {
      await chain.append('algedonic:pain', 'executor', workId, {
        severity: 2,
        source: 'worktree-creation',
        message: err instanceof Error ? err.message : 'Failed to create worktree',
        contextId: work.contextId,
      });

      await securityProvider.invalidateSession(securityCtx.sessionId);
      return {
        success: false,
        workId,
        nodeId,
        error: `Failed to create worktree: ${err instanceof Error ? err.message : 'Unknown error'}`,
        attempts: 1,
      };
    }

    // Check file:write permission for worktree path
    const writeCheck = await securityProvider.checkAccess(securityCtx, {
      type: 'file:write',
      path: worktree.path,
    });

    if (!writeCheck.allowed) {
      await removeWorktree(workId);
      await securityProvider.invalidateSession(securityCtx.sessionId);
      return {
        success: false,
        workId,
        nodeId,
        error: `Write permission denied for ${worktree.path}: ${writeCheck.reason}`,
        attempts: 1,
      };
    }

    // Build instruction and execute
    const instruction = buildInstruction(context);
    const result = await execute(instruction, context.executor, {
      workingDir: worktree.path,
      autonomous: worker.settings.autonomyLevel === 'autonomous',
      timeout: worker.settings.maxExecutionTime ? worker.settings.maxExecutionTime * 1000 : 30 * 60 * 1000,
    });

    if (!result.success) {
      await chain.append('algedonic:pain', 'executor', workId, {
        severity: 2,
        source: 'execution-failed',
        message: result.error || 'Execution failed',
        contextId: work.contextId,
      });

      await securityProvider.invalidateSession(securityCtx.sessionId);
      return {
        success: false,
        workId,
        nodeId,
        error: result.error || 'Execution failed',
        attempts: 1,
        durationMs: result.durationMs,
      };
    }

    // Commit changes
    await addAll(worktree.path);
    const commitResult = await commit(`Work: ${work.name}\n\nWork-Id: ${workId}`, worktree.path);

    if (!commitResult.success && commitResult.output !== 'Nothing to commit') {
      await chain.append('algedonic:pain', 'executor', workId, {
        severity: 1,
        source: 'commit-failed',
        message: commitResult.error || 'Failed to commit changes',
        contextId: work.contextId,
      });
    }

    // Submit for verification
    try {
      await submitWork(workId, worktree.branch);
    } catch (err) {
      await securityProvider.invalidateSession(securityCtx.sessionId);
      return {
        success: false,
        workId,
        nodeId,
        error: `Failed to submit: ${err instanceof Error ? err.message : 'Unknown error'}`,
        attempts: 1,
        durationMs: result.durationMs,
      };
    }

    await securityProvider.invalidateSession(securityCtx.sessionId);
    return {
      success: true,
      workId,
      nodeId,
      branch: worktree.branch,
      attempts: 1,
      durationMs: result.durationMs,
    };
  });
}

export interface FinalizeResult {
  workId: string;
  passed: boolean;
  creditMinted: boolean;
  bits?: number;
  amount?: bigint;
}

export async function finalizeWork(
  workId: string,
  passed: boolean
): Promise<FinalizeResult> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);

  if (!passed) {
    const maxAttempts = 3;
    if ((work.gap ?? 0) >= maxAttempts) {
      await releaseWork(workId, 'max_attempts');
    } else {
      await releaseWork(workId, 'blocked');
    }

    // Release scope lock and clean up worktree on failure
    await releaseScope(workId);
    await removeWorktree(workId);

    return { workId, passed: false, creditMinted: false };
  }

  await completeWork(workId);

  const varietyBits = work.conditions.reduce(
    (sum, c) => sum + (c.varietyWeight ?? 10),
    0
  );

  await emitVariety('work', 'out', 'system', workId, varietyBits, {
    workId,
    context: 'work completed',
  });

  const resolution = await getResolution(workId);

  if (resolution.collapsed && work.claim?.nodeId) {
    const credit = await mintCredit(workId, work.claim.nodeId);
    return {
      workId,
      passed: true,
      creditMinted: true,
      bits: credit.bits,
      amount: credit.amount,
    };
  }

  return { workId, passed: true, creditMinted: false };
}
