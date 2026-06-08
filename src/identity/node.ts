/**
 * Node Identity — CRUD for nodes
 *
 * Nodes are the recursive building blocks of the system.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { getChain } from '../coordination/channels/chain.js';
import { deriveAllNodes, deriveNode, type DerivedNode } from '../coordination/resources/derive.js';
import { DEFAULT_SETTINGS, type NodeSettings } from './settings.js';
import { paths } from './paths.js';
import { dao } from './scoped-paths.js';
import { scaffoldScope } from './scaffold.js';

export { DEFAULT_SETTINGS, type NodeSettings, type DerivedNode };

export interface CreateNodeInput {
  name: string;
  purpose: string;
  scope?: string[];
  settings?: Partial<NodeSettings>;
  hubId?: string;
  isRoot?: boolean;
}

export interface NodeUpdates {
  name?: string;
  purpose?: string;
  scope?: string[];
}

export interface NodeFilter {
  status?: 'active' | 'terminated';
  availableForWork?: boolean;
}

function generateNodeId(): string {
  return `node_${randomUUID().slice(0, 8)}`;
}

export async function createNode(input: CreateNodeInput): Promise<string> {
  const chain = getChain();
  const nodeId = generateNodeId();
  const nodeScope = dao.node(nodeId);
  const scopePath = nodeScope.root();

  // Unified scaffold with node-specific options
  scaffoldScope(scopePath, {
    type: 'node',
    id: nodeId,
    name: input.name,
    purpose: input.purpose,
    scope: input.scope,
    hubId: input.hubId,
    autonomyLevel: input.settings?.autonomyLevel,
  });

  // Create memory directory
  const memoryDir = paths.nodeMemory(nodeId);
  if (!existsSync(memoryDir)) {
    mkdirSync(memoryDir, { recursive: true });
  }

  await chain.append('identity:created', 'system', nodeId, {
    name: input.name,
    purpose: input.purpose,
    scope: input.scope ?? ['**'],
  });

  if (input.settings) {
    await chain.append('identity:settings', 'system', nodeId, input.settings);
  }

  return nodeId;
}


export function getNodeIdentityContent(nodeId: string): string | null {
  const identityPath = paths.nodeIdentityFile(nodeId);
  if (!existsSync(identityPath)) return null;
  return readFileSync(identityPath, 'utf-8');
}

export function updateNodeIdentity(nodeId: string, content: string): void {
  const identityPath = paths.nodeIdentityFile(nodeId);
  const nodeDir = paths.node(nodeId);
  if (!existsSync(nodeDir)) {
    mkdirSync(nodeDir, { recursive: true });
  }
  writeFileSync(identityPath, content);
}

export async function updateNode(nodeId: string, updates: NodeUpdates): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  const chain = getChain();

  if (updates.name !== undefined) {
    await chain.append('identity:updated', nodeId, nodeId, {
      field: 'name',
      oldValue: node.name,
      newValue: updates.name,
    });
  }

  if (updates.purpose !== undefined) {
    await chain.append('identity:updated', nodeId, nodeId, {
      field: 'purpose',
      oldValue: node.purpose,
      newValue: updates.purpose,
    });
  }

  if (updates.scope !== undefined) {
    await chain.append('identity:updated', nodeId, nodeId, {
      field: 'scope',
      oldValue: node.scope,
      newValue: updates.scope,
    });
  }
}

export async function updateSettings(
  nodeId: string,
  settings: Partial<NodeSettings>
): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  await getChain().append('identity:settings', nodeId, nodeId, settings);
}

export async function terminateNode(nodeId: string, reason?: string): Promise<void> {
  const node = await getNode(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);

  await getChain().append('identity:terminated', 'system', nodeId, {
    reason: reason ?? 'terminated',
  });
}

export async function getNode(nodeId: string): Promise<DerivedNode | null> {
  const events = await getChain().recall({ subject: nodeId });
  return deriveNode(events);
}

export async function listNodes(filter?: NodeFilter): Promise<DerivedNode[]> {
  const events = await getChain().recall({});
  const allNodes = deriveAllNodes(events);
  let results = Array.from(allNodes.values());

  if (filter?.status) {
    results = results.filter(n => n.status === filter.status);
  }

  if (filter?.availableForWork !== undefined) {
    results = results.filter(n => {
      const available = n.settings.availableForWork ?? DEFAULT_SETTINGS.availableForWork;
      return available === filter.availableForWork;
    });
  }

  return results;
}

export async function getWorkspaceRoot(): Promise<DerivedNode | null> {
  const nodes = await listNodes({ status: 'active' });
  const nodesWithNoParent = nodes.filter(n => n.memberships.length === 0);

  if (nodesWithNoParent.length === 1) {
    return nodesWithNoParent[0];
  }

  return nodesWithNoParent[0] ?? null;
}

/**
 * Resolve effective settings for a context.
 */
export async function resolveContextSettings(hubId: string): Promise<NodeSettings> {
  const node = await getNode(hubId);

  if (!node) {
    console.warn(`[Identity] Context ${hubId} not found, using defaults`);
    return { ...DEFAULT_SETTINGS };
  }

  return { ...DEFAULT_SETTINGS, ...node.settings };
}

/**
 * Get a single setting for a context.
 */
export async function getContextSetting<K extends keyof NodeSettings>(
  hubId: string,
  key: K
): Promise<NodeSettings[K]> {
  const settings = await resolveContextSettings(hubId);
  return settings[key];
}

/**
 * Check if autonomy level allows an action.
 */
export function checkAutonomy(
  level: NodeSettings['autonomyLevel'],
  action: 'execute' | 'claim' | 'network' | 'any'
): { allowed: boolean; requiresConfirmation: boolean } {
  switch (level) {
    case 'locked':
      return { allowed: false, requiresConfirmation: false };

    case 'supervised':
      if (action === 'network') {
        return { allowed: true, requiresConfirmation: true };
      }
      return { allowed: true, requiresConfirmation: false };

    case 'autonomous':
      return { allowed: true, requiresConfirmation: false };

    default:
      return { allowed: false, requiresConfirmation: false };
  }
}
