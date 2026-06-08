/**
 * Identity Contract — Parse and manage identity.md files
 *
 * identity.md is the static contract layer (purpose, scope, boundaries).
 * Chain events handle dynamic state (memberships, settings changes).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createHash } from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { paths } from './paths.js';
import { getChain } from '../coordination/channels/chain.js';
import { parent, scopeKey, type ScopedPaths } from './scoped-paths.js';

export interface Membership {
  hub: string;
  role?: string;
  capacity?: number;
  joinedAt?: number;
}

export interface GovernanceParams {
  quorum?: number;           // 0-1, defaults inherited from parent
  votingPeriod?: number;     // ms, defaults inherited from parent
  threshold?: number;        // 0-1, base approval threshold
  capacity?: number;         // max concurrent work items
  budget?: number;           // resource budget at this scope
}

export interface IdentityFrontmatter {
  id: string;
  type: 'dao' | 'context' | 'story' | 'task' | 'node';
  parent?: string;
  memberships?: Membership[];
  governance?: GovernanceParams;
  created: string;
  closes: 'never' | 'conditions';
  closed?: string;
  attestation?: string;
  ipfsCid?: string;
}

export interface ClosureCondition {
  description: string;
  completed: boolean;
}

export interface IdentityContract {
  frontmatter: IdentityFrontmatter;
  name: string;
  purpose: string;
  scope: string[];
  closureConditions: ClosureCondition[];
  resources: Record<string, string>;
  obligations: string[];
  boundaries: string[];
  raw: string;
}

export function parseIdentity(content: string): IdentityContract {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) throw new Error('Invalid identity.md: no frontmatter');

  const frontmatter = parseYaml(fmMatch[1]) as IdentityFrontmatter;
  const body = fmMatch[2];

  return {
    frontmatter,
    name: extractHeading(body) || frontmatter.id,
    purpose: extractSection(body, 'Purpose') || '',
    scope: extractList(body, 'Scope'),
    closureConditions: extractCheckboxes(body, 'Closure Conditions'),
    resources: extractKeyValues(body, 'Resources'),
    obligations: extractList(body, 'Obligations'),
    boundaries: extractList(body, 'Boundaries'),
    raw: content,
  };
}

export function getIdentityPath(id: string): string {
  if (id.startsWith('dao_')) return paths.daoIdentity();
  if (id.startsWith('ctx_')) return paths.hubIdentity(id);
  if (id.startsWith('node_')) return paths.nodeIdentityFile(id);
  throw new Error(`Unknown identity type: ${id}`);
}

export function loadIdentity(id: string): IdentityContract | null {
  try {
    const path = getIdentityPath(id);
    if (!existsSync(path)) return null;
    return parseIdentity(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Load identity at any scope path.
 * Returns the identity.md at that scope, or null if none exists.
 */
export function loadIdentityAtScope(scope: ScopedPaths): IdentityContract | null {
  try {
    const identityPath = scope.identity();
    if (!existsSync(identityPath)) return null;
    return parseIdentity(readFileSync(identityPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save identity to a scope path.
 * Regenerates markdown from the contract object.
 */
export function saveIdentityAtScope(scope: ScopedPaths, identity: IdentityContract): void {
  const identityPath = scope.identity();
  mkdirSync(dirname(identityPath), { recursive: true });
  const markdown = generateIdentityMarkdown(identity);
  writeFileSync(identityPath, markdown);
}

/**
 * Generate identity.md markdown from contract object.
 */
function generateIdentityMarkdown(identity: IdentityContract): string {
  const frontmatter = stringifyYaml(identity.frontmatter);

  let content = `---
${frontmatter}---

# ${identity.name}

## Purpose

${identity.purpose}

## Scope

${identity.scope.map(s => `- \`${s}\``).join('\n')}
`;

  if (identity.boundaries.length > 0) {
    content += `
## Boundaries

${identity.boundaries.map(b => `- ${b}`).join('\n')}
`;
  }

  if (identity.obligations.length > 0) {
    content += `
## Obligations

${identity.obligations.map(o => `- ${o}`).join('\n')}
`;
  }

  if (identity.closureConditions.length > 0) {
    content += `
## Closure Conditions

${identity.closureConditions.map(c => `- [${c.completed ? 'x' : ' '}] ${c.description}`).join('\n')}
`;
  }

  if (Object.keys(identity.resources).length > 0) {
    content += `
## Resources

${Object.entries(identity.resources).map(([k, v]) => `- **${k}**: \`${v}\``).join('\n')}
`;
  }

  return content;
}

/**
 * Get effective governance parameters at a scope.
 * Walks up the hierarchy, inheriting from parent if not set locally.
 */
export function getEffectiveGovernance(scope: ScopedPaths): GovernanceParams {
  const defaults: GovernanceParams = {
    quorum: 0.3,
    votingPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
    threshold: 0.5,
    capacity: 5,         // default concurrent work capacity
    budget: 10000,       // default resource budget
  };

  // Walk up the tree collecting governance params
  const params: GovernanceParams = { ...defaults };
  const chain: ScopedPaths[] = [];

  let current: ScopedPaths | null = scope;
  while (current) {
    chain.unshift(current); // Add to front so we process root first
    current = parent(current);
  }

  // Apply params from root down (children override parents)
  for (const s of chain) {
    const identity = loadIdentityAtScope(s);
    if (identity?.frontmatter.governance) {
      const gov = identity.frontmatter.governance;
      if (gov.quorum !== undefined) params.quorum = gov.quorum;
      if (gov.votingPeriod !== undefined) params.votingPeriod = gov.votingPeriod;
      if (gov.threshold !== undefined) params.threshold = gov.threshold;
      if (gov.capacity !== undefined) params.capacity = gov.capacity;
      if (gov.budget !== undefined) params.budget = gov.budget;
    }
  }

  return params;
}

/**
 * Create identity.md at a scope path if it doesn't exist.
 */
export function ensureIdentityAtScope(
  scope: ScopedPaths,
  opts: {
    name: string;
    purpose: string;
    type?: 'dao' | 'context' | 'story' | 'task' | 'node';
    governance?: GovernanceParams;
  }
): IdentityContract {
  const identityPath = scope.identity();

  if (existsSync(identityPath)) {
    return parseIdentity(readFileSync(identityPath, 'utf-8'));
  }

  // Ensure directory exists
  mkdirSync(dirname(identityPath), { recursive: true });

  // Determine type from path
  const path = scope.root();
  let type: IdentityFrontmatter['type'] = opts.type ?? 'context';
  if (path.includes('/stories/')) type = 'story';
  if (path.includes('/tasks/')) type = 'task';
  if (path.includes('/nodes/')) type = 'node';

  const parentScope = parent(scope);
  const parentPath = parentScope ? scopeKey(parentScope) : undefined;

  const id = scopeKey(scope).replace(/\//g, '_').replace(/^_/, '');

  const frontmatter: IdentityFrontmatter = {
    id,
    type,
    parent: parentPath,
    governance: opts.governance,
    created: new Date().toISOString(),
    closes: 'never',
  };

  const content = `---
${stringifyYaml(frontmatter)}---

# ${opts.name}

## Purpose

${opts.purpose}

## Scope

## Resources

## Obligations

## Boundaries
`;

  writeFileSync(identityPath, content);
  return parseIdentity(content);
}

export function saveIdentity(identity: IdentityContract): void {
  const path = getIdentityPath(identity.frontmatter.id);
  writeFileSync(path, identity.raw);
}

export function computeAttestation(content: string): string {
  return '0x' + createHash('sha256').update(content).digest('hex');
}

export function canClose(identity: IdentityContract): boolean {
  if (identity.frontmatter.closes === 'never') return false;
  if (identity.frontmatter.closed) return false;
  if (identity.closureConditions.length === 0) return false;
  return identity.closureConditions.every(c => c.completed);
}

export async function closeIdentity(id: string): Promise<boolean> {
  const identity = loadIdentity(id);
  if (!identity) return false;
  if (!canClose(identity)) return false;

  identity.frontmatter.closed = new Date().toISOString();

  const updatedRaw = identity.raw.replace(
    /^(---\n[\s\S]*?)(closes: conditions)/m,
    `$1$2\nclosed: ${identity.frontmatter.closed}`
  );
  identity.raw = updatedRaw;

  saveIdentity(identity);

  await getChain().append('identity:closed', 'system', id, {
    closedAt: identity.frontmatter.closed,
  });

  return true;
}

export function getAncestry(identity: IdentityContract): string[] {
  const ancestry: string[] = [identity.frontmatter.id];

  if (identity.frontmatter.parent) {
    const parent = loadIdentity(identity.frontmatter.parent);
    if (parent) {
      ancestry.push(...getAncestry(parent));
    }
  }

  return ancestry;
}

export function getMembershipHubs(identity: IdentityContract): string[] {
  return identity.frontmatter.memberships?.map(m => m.hub) ?? [];
}

export function getTotalCapacity(identity: IdentityContract): number {
  if (!identity.frontmatter.memberships) return 1.0;
  return identity.frontmatter.memberships.reduce(
    (sum, m) => sum + (m.capacity ?? 1.0),
    0
  );
}

export function getAvailableCapacity(
  identity: IdentityContract,
  hubId: string
): number {
  const membership = identity.frontmatter.memberships?.find(
    m => m.hub === hubId
  );
  return membership?.capacity ?? 0;
}

export function updateClosureCondition(
  identity: IdentityContract,
  index: number,
  completed: boolean
): IdentityContract {
  if (index < 0 || index >= identity.closureConditions.length) {
    return identity;
  }

  const condition = identity.closureConditions[index];
  const oldMarker = completed ? '[ ]' : '[x]';
  const newMarker = completed ? '[x]' : '[ ]';

  const updatedRaw = identity.raw.replace(
    new RegExp(`- \\${oldMarker} ${escapeRegex(condition.description)}`),
    `- ${newMarker} ${condition.description}`
  );

  identity.closureConditions[index].completed = completed;
  identity.raw = updatedRaw;

  return identity;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update identity.md at a scope path with verification results.
 * Marks conditions as complete and updates status when all pass.
 */
export function updateScopeProgress(
  scope: ScopedPaths,
  updates: {
    conditionResults?: Array<{ description: string; passed: boolean }>;
    status?: 'active' | 'completed' | 'failed';
  }
): void {
  const identityPath = scope.identity();
  if (!existsSync(identityPath)) return;

  let content = readFileSync(identityPath, 'utf-8');
  const identity = parseIdentity(content);

  // Update condition checkboxes
  if (updates.conditionResults) {
    for (const result of updates.conditionResults) {
      const idx = identity.closureConditions.findIndex(
        c => c.description.includes(result.description) || result.description.includes(c.description.split(' (')[0])
      );
      if (idx >= 0 && result.passed !== identity.closureConditions[idx].completed) {
        const condition = identity.closureConditions[idx];
        const oldMarker = result.passed ? '[ ]' : '[x]';
        const newMarker = result.passed ? '[x]' : '[ ]';
        content = content.replace(
          new RegExp(`- \\${oldMarker} ${escapeRegex(condition.description)}`),
          `- ${newMarker} ${condition.description}`
        );
      }
    }
  }

  // Update status in frontmatter
  if (updates.status) {
    content = content.replace(
      /^(status: )(active|completed|failed)/m,
      `$1${updates.status}`
    );
  }

  writeFileSync(identityPath, content);
}

function extractHeading(body: string): string | null {
  const match = body.match(/^# (.+)$/m);
  return match ? match[1].trim() : null;
}

function extractSection(body: string, heading: string): string | null {
  const regex = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`);
  const match = body.match(regex);
  return match ? match[1].trim() : null;
}

function extractList(body: string, heading: string): string[] {
  const section = extractSection(body, heading);
  if (!section) return [];
  return section
    .split('\n')
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).replace(/^`|`$/g, '').trim());
}

function extractCheckboxes(body: string, heading: string): ClosureCondition[] {
  const section = extractSection(body, heading);
  if (!section) return [];
  return section
    .split('\n')
    .filter(line => line.match(/^- \[[ x]\]/))
    .map(line => ({
      description: line.replace(/^- \[[ x]\] /, '').trim(),
      completed: line.includes('[x]'),
    }));
}

function extractKeyValues(body: string, heading: string): Record<string, string> {
  const section = extractSection(body, heading);
  if (!section) return {};
  const result: Record<string, string> = {};
  for (const line of section.split('\n')) {
    const match = line.match(/^- \*\*(.+)\*\*: (.+)$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}
