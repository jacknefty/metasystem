/**
 * Hub — Project/DAO containers (recursive VSM structure)
 *
 * A hub is a bounded container with purpose, scope, and closure conditions.
 * Filesystem setup (git, symlinks) happens at the API layer.
 */

import { randomUUID } from 'crypto';
import { existsSync, readdirSync } from 'fs';
import { getChain } from '../coordination/channels/chain.js';
import { paths } from './paths.js';
import { dao } from './scoped-paths.js';
import { loadIdentity, type IdentityContract } from './contract.js';
import { scaffoldScope } from './scaffold.js';

export interface CreateHubInput {
  name: string;
  purpose: string;
  parent: string;
  scope?: string[];
  closureConditions?: string[];
  resources?: Record<string, string>;
  obligations?: string[];
  boundaries?: string[];
}

function generateHubId(): string {
  return `hub_${randomUUID().slice(0, 8)}`;
}

export async function createHub(input: CreateHubInput): Promise<string> {
  const id = generateHubId();
  const hubScope = dao.hub(id);
  const scopePath = hubScope.root();
  const parentPath = dao.root();

  scaffoldScope(scopePath, {
    type: 'hub',
    id,
    name: input.name,
    purpose: input.purpose,
    parentId: input.parent,
    scope: input.scope,
  });

  await getChain().append('hub:created', 'system', id, {
    name: input.name,
    purpose: input.purpose,
    parent: input.parent,
    scope: input.scope ?? ['**'],
  });

  return id;
}

export function getHub(id: string): IdentityContract | null {
  return loadIdentity(id);
}

export function listHubs(parentId?: string): IdentityContract[] {
  const hubsDir = paths.hubs();
  if (!existsSync(hubsDir)) return [];

  const ids = readdirSync(hubsDir);

  const hubs: IdentityContract[] = [];
  for (const dirName of ids) {
    const id = dirName.startsWith('hub_') ? dirName : `hub_${dirName}`;
    const identity = loadIdentity(id);
    if (identity) {
      if (!parentId || identity.frontmatter.parent === parentId) {
        hubs.push(identity);
      }
    }
  }

  return hubs;
}

export async function closeHub(id: string): Promise<boolean> {
  const { closeIdentity } = await import('./contract.js');
  return closeIdentity(id);
}
