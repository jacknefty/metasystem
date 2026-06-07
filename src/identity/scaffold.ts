/**
 * Scaffold — VSM folder structure generator
 *
 * Every scope (hub, epic, story, task, node) gets the same VSM structure.
 * This enables true scale-free recursion.
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { Condition } from '../coordination/channels/events.js';

export type ScopeType = 'hub' | 'epic' | 'story' | 'task' | 'node';

export interface ScaffoldOptions {
  type: ScopeType;
  id: string;
  name: string;
  purpose: string;
  parentId?: string;
  parentType?: ScopeType;
  conditions?: Condition[];
  scope?: string[];
  minimal?: boolean;
}

export function scaffoldScope(scopePath: string, options: ScaffoldOptions): void {
  if (!existsSync(scopePath)) {
    mkdirSync(scopePath, { recursive: true });
  }

  const folders = options.minimal
    ? ['operations', 'control', 'audit']
    : ['coordination', 'control', 'intelligence', 'operations', 'audit', 'bridge'];

  for (const folder of folders) {
    const folderPath = join(scopePath, folder);
    if (!existsSync(folderPath)) {
      mkdirSync(folderPath, { recursive: true });
    }
  }

  const identityContent = generateIdentity(options);
  writeFileSync(join(scopePath, 'identity.md'), identityContent);

  const chainPath = join(scopePath, 'chain.jsonl');
  if (!existsSync(chainPath)) {
    writeFileSync(chainPath, '');
  }
}

function generateIdentity(options: ScaffoldOptions): string {
  const { type, id, name, purpose, parentId, parentType, conditions, scope } = options;

  const scopeLines = scope && scope.length > 0
    ? scope.map(s => `- \`${s}\``).join('\n')
    : '- `**`';

  let frontmatter = `---
id: ${id}
type: ${type}`;

  if (parentId) {
    frontmatter += `\nparent: ${parentId}`;
  }
  if (parentType) {
    frontmatter += `\nparentType: ${parentType}`;
  }

  frontmatter += `
created: ${new Date().toISOString()}
status: active
---`;

  let content = `${frontmatter}

# ${name}

## Purpose

${purpose}

## Scope

${scopeLines}
`;

  if (conditions && conditions.length > 0) {
    content += `
## Closure Conditions

${conditions.map(c => `- [ ] ${c.description} (\`${c.verifier}\`)`).join('\n')}
`;
  }

  return content;
}
