/**
 * Boundary Respect Check (S3)
 *
 * Did the node violate its declared "will not" boundaries?
 * Uses heuristics — best effort, not exhaustive.
 */

import { execSync } from 'child_process';
import type { CheckFinding } from './types.js';
import { loadIdentity } from '../../../identity/contract.js';
import { getWork } from '../../../coordination/resources/work.js';
import { getChain } from '../../../coordination/channels/chain.js';

interface BoundaryHeuristic {
  keywords: string[];
  patterns: string[];
}

const BOUNDARY_HEURISTICS: Record<string, BoundaryHeuristic> = {
  'database': {
    keywords: ['database', 'schema', 'migration', 'table', 'column'],
    patterns: ['*.sql', 'migrations/**', 'prisma/schema.prisma', '**/schema.prisma'],
  },
  'authentication': {
    keywords: ['auth', 'authentication', 'login', 'session', 'token', 'password'],
    patterns: ['**/auth/**', '**/login/**', '**/session/**', '**/*auth*'],
  },
  'credentials': {
    keywords: ['credential', 'secret', 'key', 'password', 'production'],
    patterns: ['.env', '.env.*', '**/secrets/**', '**/*.pem', '**/*.key'],
  },
  'api': {
    keywords: ['api', 'endpoint', 'route', 'contract'],
    patterns: ['**/api/**', '**/routes/**', '**/endpoints/**'],
  },
  'config': {
    keywords: ['config', 'configuration', 'settings'],
    patterns: ['**/config/**', '**/*.config.*', '**/settings/**'],
  },
  'deploy': {
    keywords: ['deploy', 'deployment', 'infrastructure', 'ci', 'cd'],
    patterns: ['.github/**', 'deploy/**', 'infrastructure/**', 'Dockerfile', 'docker-compose*'],
  },
};

export async function checkBoundaryRespect(
  nodeId: string,
  workId?: string
): Promise<CheckFinding | null> {
  if (!workId) return null;

  const identity = loadIdentity(nodeId);
  if (!identity) return null;

  const boundaries = identity.boundaries;
  if (boundaries.length === 0) return null;

  const work = await getWork(workId);
  if (!work) return null;

  const touchedFiles = await getTouchedFiles(workId, work.hubPath);
  if (touchedFiles.length === 0) return null;

  for (const boundary of boundaries) {
    const violated = checkBoundaryViolation(boundary, touchedFiles);
    if (violated) {
      return {
        check: 'boundary-respect',
        evidence: `Violated boundary: "${boundary}" — touched: ${violated.slice(0, 3).join(', ')}`,
      };
    }
  }

  return null;
}

function checkBoundaryViolation(boundary: string, touchedFiles: string[]): string[] | null {
  const boundaryLower = boundary.toLowerCase();

  for (const [, heuristic] of Object.entries(BOUNDARY_HEURISTICS)) {
    const matchesCategory = heuristic.keywords.some(kw => boundaryLower.includes(kw));
    if (!matchesCategory) continue;

    const violatingFiles = touchedFiles.filter(file =>
      matchesPattern(file, heuristic.patterns)
    );

    if (violatingFiles.length > 0) {
      return violatingFiles;
    }
  }

  return null;
}

function matchesPattern(file: string, patterns: string[]): boolean {
  const normalized = file.replace(/\\/g, '/');

  for (const pattern of patterns) {
    if (pattern.includes('**')) {
      const regex = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\./g, '\\.');
      if (new RegExp(`^${regex}$`).test(normalized)) return true;
      if (new RegExp(regex).test(normalized)) return true;
    } else if (pattern.includes('*')) {
      const regex = pattern.replace(/\*/g, '[^/]*').replace(/\./g, '\\.');
      if (new RegExp(`^${regex}$`).test(normalized)) return true;
    } else {
      if (normalized === pattern || normalized.endsWith('/' + pattern)) return true;
    }
  }

  return false;
}

async function getTouchedFiles(workId: string, hubPath?: string): Promise<string[]> {
  const events = await getChain().recall({ subject: workId, type: 'work:submitted' });
  if (events.length === 0) return [];

  const submitEvent = events[events.length - 1];
  const payload = submitEvent.payload as { branch?: string };
  const branch = payload.branch;

  if (!branch) return [];

  const cwd = hubPath ?? process.cwd();

  try {
    const output = execSync(`git diff --name-only main...${branch}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    try {
      const output = execSync(`git diff --name-only master...${branch}`, {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
      });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
