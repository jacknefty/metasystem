/**
 * Tool Policy Check (S3)
 *
 * Did the node use only allowed tools?
 * Uses allowedTools/deniedTools from NodeSettings.
 */

import type { CheckFinding } from './types.js';
import { getNode } from '../../../identity/node.js';
import { getChain } from '../../../coordination/channels/chain.js';
import { minimatch } from 'minimatch';

export async function checkToolPolicy(
  nodeId: string,
  workId?: string
): Promise<CheckFinding | null> {
  const node = await getNode(nodeId);
  if (!node) return null;

  const { allowedTools, deniedTools } = node.settings;

  const toolEvents = await getChain().recall({ emitter: nodeId, type: 'tool:invoked' });

  const relevantEvents = workId
    ? toolEvents.filter(e => (e.payload as { workId?: string }).workId === workId)
    : toolEvents;

  for (const event of relevantEvents) {
    const toolId = event.subject;

    if (!isToolAllowed(toolId, allowedTools, deniedTools)) {
      return {
        check: 'tool-policy',
        evidence: `Used unauthorized tool: ${toolId}`,
      };
    }
  }

  return null;
}

function isToolAllowed(
  toolId: string,
  allowedTools?: string[],
  deniedTools?: string[]
): boolean {
  if (deniedTools && deniedTools.length > 0) {
    for (const pattern of deniedTools) {
      if (matchesToolPattern(toolId, pattern)) {
        return false;
      }
    }
  }

  if (!allowedTools || allowedTools.length === 0) {
    return true;
  }

  for (const pattern of allowedTools) {
    if (matchesToolPattern(toolId, pattern)) {
      return true;
    }
  }

  return false;
}

function matchesToolPattern(toolId: string, pattern: string): boolean {
  if (pattern === '*' || pattern === '**') return true;

  if (pattern.includes(':')) {
    const [patternPrefix, patternRest] = pattern.split(':', 2);
    const [toolPrefix, toolRest] = toolId.split(':', 2);

    if (patternPrefix !== toolPrefix && patternPrefix !== '*') return false;

    if (patternRest === '*') return true;
    if (!toolRest) return false;

    return minimatch(toolRest, patternRest);
  }

  return minimatch(toolId, pattern);
}
