/**
 * Tool Invocation
 *
 * Unified execution with policy checks and learning.
 */

import type { ToolInvocation, ToolResult } from './types.js';
import { getTool, getProvider } from './index.js';
import { checkToolAccess } from '../../identity/boundary/tools.js';
import { recordToolOutcome } from './reliability.js';
import { extractPaths, validatePaths } from './scope.js';
import { getChain } from '../../coordination/channels/chain.js';

export async function invoke(invocation: ToolInvocation): Promise<ToolResult> {
  const { toolId, parameters, context } = invocation;
  const startTime = Date.now();

  const spec = getTool(toolId);
  if (!spec) {
    return {
      success: false,
      error: `Tool not found: ${toolId}`,
      durationMs: Date.now() - startTime,
    };
  }

  const access = await checkToolAccess(context.nodeId, spec);
  if (!access.allowed) {
    await getChain().append('tool:denied', context.nodeId, toolId, {
      reason: access.reason ?? 'Access denied',
      decidedBy: access.decidedBy,
      workId: context.workId,
    });

    return {
      success: false,
      error: `Access denied: ${access.reason}`,
      durationMs: Date.now() - startTime,
    };
  }

  const paths = extractPaths(spec, parameters);
  if (paths.length > 0) {
    const validation = validatePaths(paths, context.scope);

    if (!validation.valid) {
      const violations = validation.violations
        .map(v => `${v.parameter}: ${v.path}`)
        .join(', ');

      return {
        success: false,
        error: `Scope violation: ${violations}`,
        durationMs: Date.now() - startTime,
      };
    }
  }

  const provider = getProvider(toolId);
  if (!provider) {
    return {
      success: false,
      error: `No provider for tool: ${toolId}`,
      durationMs: Date.now() - startTime,
    };
  }

  let result: ToolResult;
  try {
    result = await provider.invoke(spec, parameters);
    result.durationMs = Date.now() - startTime;
  } catch (err) {
    result = {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
      durationMs: Date.now() - startTime,
    };
  }

  await recordToolOutcome(toolId, context, result);

  await getChain().append('tool:invoked', context.nodeId, toolId, {
    workId: context.workId,
    success: result.success,
    durationMs: result.durationMs,
  });

  return result;
}
