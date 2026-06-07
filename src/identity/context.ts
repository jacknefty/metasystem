/**
 * Context — Initiative/project containers
 *
 * A context is a bounded initiative with purpose, scope, and closure conditions.
 * Filesystem setup (git, symlinks) happens at the API layer.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { getChain } from '../coordination/channels/chain.js';
import { paths } from './paths.js';
import { loadIdentity, type IdentityContract } from './contract.js';

export interface CreateContextInput {
  name: string;
  purpose: string;
  parent: string;
  scope?: string[];
  closureConditions?: string[];
  resources?: Record<string, string>;
  obligations?: string[];
  boundaries?: string[];
}

function generateContextId(): string {
  return `ctx_${randomUUID().slice(0, 8)}`;
}

export async function createContext(input: CreateContextInput): Promise<string> {
  const id = generateContextId();
  const contextDir = paths.context(id);

  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }

  const identityContent = generateContextIdentity(id, input);
  writeFileSync(paths.contextIdentity(id), identityContent);

  await getChain().append('context:created', 'system', id, {
    name: input.name,
    purpose: input.purpose,
    parent: input.parent,
    scope: input.scope ?? ['**'],
  });

  return id;
}

function generateContextIdentity(id: string, input: CreateContextInput): string {
  const scope = input.scope ?? ['**'];
  const closureConditions = input.closureConditions ?? ['All work items completed'];
  const resources = input.resources ?? {};
  const obligations = input.obligations ?? [];
  const boundaries = input.boundaries ?? [];

  const resourceLines = Object.entries(resources)
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n');

  return `---
id: ${id}
type: context
parent: ${input.parent}
created: ${new Date().toISOString()}
closes: conditions
---

# ${input.name}

## Purpose

${input.purpose}

## Scope

${scope.map(s => `- \`${s}\``).join('\n')}

## Closure Conditions

${closureConditions.map(c => `- [ ] ${c}`).join('\n')}

## Resources

${resourceLines || '- **Autonomy**: supervised'}

## Obligations

${obligations.map(o => `- ${o}`).join('\n') || '- Deliver on stated purpose'}

## Boundaries

${boundaries.map(b => `- ${b}`).join('\n') || '- Will not exceed declared scope'}
`;
}

export function getContext(id: string): IdentityContract | null {
  return loadIdentity(id);
}

export function listContexts(parentId?: string): IdentityContract[] {
  const contextsDir = paths.contexts();
  if (!existsSync(contextsDir)) return [];

  const ids = readdirSync(contextsDir);

  const contexts: IdentityContract[] = [];
  for (const dirName of ids) {
    const id = dirName.startsWith('ctx_') ? dirName : `ctx_${dirName}`;
    const identity = loadIdentity(id);
    if (identity) {
      if (!parentId || identity.frontmatter.parent === parentId) {
        contexts.push(identity);
      }
    }
  }

  return contexts;
}

export async function closeContext(id: string): Promise<boolean> {
  const { closeIdentity } = await import('./contract.js');
  return closeIdentity(id);
}
