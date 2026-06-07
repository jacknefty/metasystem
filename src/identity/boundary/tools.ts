/**
 * Tool Access Control
 *
 * Policy inheritance: a node inherits constraints from all parent contexts.
 * If any ancestor denies a capability, it's denied.
 */

import type { ToolSpec } from '../../tools/types.js';
import { getNode, type DerivedNode } from '../node.js';

export interface ToolAccessDecision {
  allowed: boolean;
  reason?: string;
  decidedBy?: string;
}

async function getAncestry(nodeId: string): Promise<DerivedNode[]> {
  const ancestry: DerivedNode[] = [];
  const visited = new Set<string>();

  let currentId: string | undefined = nodeId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const node = await getNode(currentId);
    if (!node) break;

    ancestry.push(node);

    if (node.memberships.length > 0) {
      currentId = node.memberships[0].context;
    } else {
      break;
    }
  }

  return ancestry;
}

export async function checkToolAccess(
  nodeId: string,
  tool: ToolSpec
): Promise<ToolAccessDecision> {
  // Special case: system:audit bypasses policy
  if (nodeId === 'system:audit') {
    return { allowed: true };
  }

  const ancestry = await getAncestry(nodeId);

  if (ancestry.length === 0) {
    return { allowed: false, reason: 'Node not found' };
  }

  const fromRoot = [...ancestry].reverse();

  for (const node of fromRoot) {
    const decision = checkNodePolicy(node, tool);

    if (decision.allowed === false) {
      return {
        allowed: false,
        reason: decision.reason,
        decidedBy: node.id,
      };
    }
  }

  const leaf = ancestry[0];
  const capabilityCheck = checkCapabilityConstraints(leaf, tool);

  if (!capabilityCheck.allowed) {
    return {
      allowed: false,
      reason: capabilityCheck.reason,
      decidedBy: leaf.id,
    };
  }

  return { allowed: true };
}

function checkNodePolicy(node: DerivedNode, tool: ToolSpec): ToolAccessDecision {
  const settings = node.settings;

  if (settings.autonomyLevel === 'locked') {
    return { allowed: false, reason: 'Node is locked' };
  }

  if (settings.deniedTools) {
    for (const pattern of settings.deniedTools) {
      if (matchesPattern(tool, pattern)) {
        return { allowed: false, reason: `Tool denied by pattern: ${pattern}` };
      }
    }
  }

  if (settings.allowedTools) {
    const hasMatch = settings.allowedTools.some((pattern: string) =>
      matchesPattern(tool, pattern)
    );

    if (!hasMatch) {
      return { allowed: false, reason: 'Tool not in allowed list' };
    }
  }

  return { allowed: true };
}

function checkCapabilityConstraints(node: DerivedNode, tool: ToolSpec): ToolAccessDecision {
  const settings = node.settings;

  for (const cap of tool.capabilities) {
    if ((cap === 'network:fetch' || cap === 'network:search') &&
        !settings.allowNetworkExecution) {
      return {
        allowed: false,
        reason: 'Network execution not allowed for this node',
      };
    }

    if (cap === 'shell:execute' && settings.autonomyLevel !== 'autonomous') {
      return {
        allowed: false,
        reason: 'Shell execution requires autonomous mode',
      };
    }
  }

  return { allowed: true };
}

function matchesPattern(tool: ToolSpec, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    if (tool.id.startsWith(prefix)) return true;
  } else if (tool.id === pattern) {
    return true;
  }

  for (const cap of tool.capabilities) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (cap.startsWith(prefix)) return true;
    } else if (cap === pattern) {
      return true;
    }
  }

  return false;
}

export async function getEffectiveScope(nodeId: string): Promise<string[]> {
  const ancestry = await getAncestry(nodeId);
  if (ancestry.length === 0) return [];

  let effectiveScope = ancestry[ancestry.length - 1].scope;

  for (let i = ancestry.length - 2; i >= 0; i--) {
    const childScope = ancestry[i].scope;
    effectiveScope = intersectScopes(effectiveScope, childScope);
  }

  return effectiveScope;
}

function intersectScopes(parentScope: string[], childScope: string[]): string[] {
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
