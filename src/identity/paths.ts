/**
 * Paths — Where things live
 *
 * Source code = capabilities (this repo)
 * Data directory = state + extensions (~/.metasystem)
 */

import { join } from 'path';
import { homedir } from 'os';

export function getDataDir(): string {
  return process.env.METASYSTEM_DATA || join(homedir(), '.metasystem');
}

export const paths = {
  // Root
  root: () => getDataDir(),
  config: () => join(getDataDir(), 'config.json'),

  // Identity
  identity: () => join(getDataDir(), 'identity'),
  nodeIdentity: () => join(getDataDir(), 'identity', 'node.json'),
  daoIdentity: () => join(getDataDir(), 'identity.md'),

  // Nodes (each node has its own directory with identity.md)
  nodes: () => join(getDataDir(), 'nodes'),
  node: (id: string) => join(getDataDir(), 'nodes', id),
  nodeIdentityFile: (id: string) => join(getDataDir(), 'nodes', id, 'identity.md'),
  nodeMemory: (id: string) => join(getDataDir(), 'nodes', id, 'memory'),

  // Chain (event logs)
  chainFile: () => join(getDataDir(), 'chain.jsonl'),
  networkCache: () => join(getDataDir(), 'network-cache.jsonl'),

  // Contexts (working directories for hubs)
  contexts: () => join(getDataDir(), 'contexts'),
  context: (id: string) => join(getDataDir(), 'contexts', id),
  contextIdentity: (id: string) => join(getDataDir(), 'contexts', id, 'identity.md'),

  // Worktrees (isolated work execution)
  worktrees: () => join(getDataDir(), 'worktrees'),
  worktree: (workId: string) => join(getDataDir(), 'worktrees', workId),

  // PM Sessions
  pmSessions: () => join(getDataDir(), 'pm-sessions'),

  // Network state
  network: {
    state: () => join(getDataDir(), 'network-state.json'),
    history: () => join(getDataDir(), 'network-history.jsonl'),
    daoRegistry: () => join(getDataDir(), 'dao-registry.json'),
    bridgeConfig: () => join(getDataDir(), 'bridge-config.json'),
  },

  // Cache (derived state, rebuildable)
  cache: () => join(getDataDir(), 'cache'),

  // Tools
  tools: {
    stats: () => join(getDataDir(), 'tools', 'stats.json'),
    mcpServers: () => join(getDataDir(), 'mcp-servers.json'),
  },

  // Extensions
  extensions: {
    root: () => join(getDataDir(), 'extensions'),
    verifiers: () => join(getDataDir(), 'extensions', 'verifiers'),
    skills: () => join(getDataDir(), 'extensions', 'skills'),
    archetypes: () => join(getDataDir(), 'extensions', 'archetypes'),
    executors: () => join(getDataDir(), 'extensions', 'executors'),
  },
};
