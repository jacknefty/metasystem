/**
 * Identity Contract — Parse and manage identity.md files
 *
 * identity.md is the static contract layer (purpose, scope, boundaries).
 * Chain events handle dynamic state (memberships, settings changes).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { paths } from './paths.js';
import { getChain } from '../coordination/channels/chain.js';

export interface Membership {
  context: string;
  role?: string;
  capacity?: number;
  joinedAt?: number;
}

export interface IdentityFrontmatter {
  id: string;
  type: 'dao' | 'context' | 'node';
  parent?: string;
  memberships?: Membership[];
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
  if (id.startsWith('ctx_')) return paths.contextIdentity(id);
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

export function getMembershipContexts(identity: IdentityContract): string[] {
  return identity.frontmatter.memberships?.map(m => m.context) ?? [];
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
  contextId: string
): number {
  const membership = identity.frontmatter.memberships?.find(
    m => m.context === contextId
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
