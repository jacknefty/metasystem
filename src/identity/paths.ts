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

  // Chain (event logs)
  chain: () => join(getDataDir(), 'chain'),
  localChain: () => join(getDataDir(), 'chain', 'local.jsonl'),
  networkCache: () => join(getDataDir(), 'chain', 'network-cache.jsonl'),

  // Contexts (working directories for hubs)
  contexts: () => join(getDataDir(), 'contexts'),
  context: (id: string) => join(getDataDir(), 'contexts', id),

  // Cache (derived state, rebuildable)
  cache: () => join(getDataDir(), 'cache'),

  // Extensions
  extensions: {
    root: () => join(getDataDir(), 'extensions'),
    verifiers: () => join(getDataDir(), 'extensions', 'verifiers'),
    skills: () => join(getDataDir(), 'extensions', 'skills'),
    archetypes: () => join(getDataDir(), 'extensions', 'archetypes'),
    executors: () => join(getDataDir(), 'extensions', 'executors'),
  },
};
