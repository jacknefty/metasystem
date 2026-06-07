/**
 * S4 Perception — Scan environment for variety
 *
 * Perception IS variety generation. What S4 perceives becomes
 * variety:env:in that S3 must absorb.
 */

import { execSync } from 'child_process';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getNode } from '../../identity/node.js';
import { emitVariety } from '../../coordination/resources/token.js';
import { createWork, type CreateWorkInput } from '../../coordination/resources/work.js';

export interface Finding {
  type: 'issue' | 'opportunity' | 'risk' | 'debt';
  source: string;
  description: string;
  severity: 1 | 2 | 3;
  suggestedAction?: string;
  file?: string;
  line?: number;
}

export interface PerceptionResult {
  hubId: string;
  hubPath?: string;
  findings: Finding[];
  varietyEmitted: number;
  perceivedAt: number;
}

export interface ScanOptions {
  includeGit?: boolean;
  includeTodo?: boolean;
  includeTests?: boolean;
  includeDeps?: boolean;
  createWork?: boolean;
}

const DEFAULT_OPTIONS: ScanOptions = {
  includeGit: true,
  includeTodo: true,
  includeTests: true,
  includeDeps: false,
  createWork: false,
};

export async function perceiveEnvironment(
  hubId: string,
  options: ScanOptions = {}
): Promise<PerceptionResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const context = await getNode(hubId);

  if (!context?.settings.path) {
    return {
      hubId,
      findings: [],
      varietyEmitted: 0,
      perceivedAt: Date.now(),
    };
  }

  const hubPath = context.settings.path;
  const findings: Finding[] = [];

  if (opts.includeGit) {
    findings.push(...scanGitStatus(hubPath));
  }

  if (opts.includeTodo) {
    findings.push(...scanTodoComments(hubPath));
  }

  if (opts.includeTests) {
    findings.push(...scanMissingTests(hubPath));
  }

  if (opts.includeDeps) {
    findings.push(...scanDependencies(hubPath));
  }

  let varietyEmitted = 0;
  for (const finding of findings) {
    const bits = finding.severity * 5;
    await emitVariety('env', 'in', 's4', hubId, bits, {
      context: finding.source,
    });
    varietyEmitted += bits;
  }

  if (opts.createWork && findings.length > 0) {
    await createWorkFromFindings(hubId, hubPath, findings);
  }

  if (findings.length > 0) {
    console.log(`[S4] Perceived ${findings.length} findings (${varietyEmitted} bits) in ${hubId}`);
  }

  return {
    hubId,
    hubPath,
    findings,
    varietyEmitted,
    perceivedAt: Date.now(),
  };
}

function scanGitStatus(hubPath: string): Finding[] {
  const findings: Finding[] = [];

  try {
    const status = execSync('git status --porcelain', {
      cwd: hubPath,
      encoding: 'utf-8',
    }).trim();

    if (status) {
      const lines = status.split('\n').filter(Boolean);
      const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M '));
      const untracked = lines.filter(l => l.startsWith('??'));

      if (modified.length > 0) {
        findings.push({
          type: 'issue',
          source: 'git',
          description: `${modified.length} modified files not committed`,
          severity: 1,
          suggestedAction: 'Review and commit changes',
        });
      }

      if (untracked.length > 5) {
        findings.push({
          type: 'debt',
          source: 'git',
          description: `${untracked.length} untracked files`,
          severity: 1,
          suggestedAction: 'Add to .gitignore or commit',
        });
      }
    }

    try {
      const unpushed = execSync('git log @{u}..HEAD --oneline 2>/dev/null || echo ""', {
        cwd: hubPath,
        encoding: 'utf-8',
      }).trim();

      if (unpushed) {
        const count = unpushed.split('\n').filter(Boolean).length;
        findings.push({
          type: 'risk',
          source: 'git',
          description: `${count} commits not pushed to remote`,
          severity: 2,
          suggestedAction: 'Push commits to remote',
        });
      }
    } catch {
      // No upstream branch
    }

    try {
      const branches = execSync('git branch --merged main 2>/dev/null | grep -v main | wc -l', {
        cwd: hubPath,
        encoding: 'utf-8',
      }).trim();

      const staleCount = parseInt(branches, 10);
      if (staleCount > 3) {
        findings.push({
          type: 'debt',
          source: 'git',
          description: `${staleCount} branches already merged to main`,
          severity: 1,
          suggestedAction: 'Delete stale branches',
        });
      }
    } catch {
      // Ignore
    }
  } catch {
    // Not a git repo
  }

  return findings;
}

function scanTodoComments(hubPath: string): Finding[] {
  const findings: Finding[] = [];

  try {
    const result = execSync(
      'grep -rn --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" ' +
      '"TODO\\|FIXME\\|HACK\\|XXX" . 2>/dev/null | head -50',
      { cwd: hubPath, encoding: 'utf-8' }
    ).trim();

    if (result) {
      const lines = result.split('\n').filter(Boolean);
      const fixmes = lines.filter(l => l.includes('FIXME'));
      const hacks = lines.filter(l => l.includes('HACK'));
      const todos = lines.filter(l => l.includes('TODO') && !l.includes('FIXME'));

      if (fixmes.length > 0) {
        findings.push({
          type: 'issue',
          source: 'code-scan',
          description: `${fixmes.length} FIXME comments need attention`,
          severity: 2,
          suggestedAction: 'Address FIXME comments',
        });
      }

      if (hacks.length > 0) {
        findings.push({
          type: 'debt',
          source: 'code-scan',
          description: `${hacks.length} HACK comments indicate technical debt`,
          severity: 2,
          suggestedAction: 'Refactor HACK workarounds',
        });
      }

      if (todos.length > 10) {
        findings.push({
          type: 'debt',
          source: 'code-scan',
          description: `${todos.length} TODO comments accumulating`,
          severity: 1,
          suggestedAction: 'Convert TODOs to tracked work items',
        });
      }
    }
  } catch {
    // grep not available
  }

  return findings;
}

function scanMissingTests(hubPath: string): Finding[] {
  const findings: Finding[] = [];

  try {
    const srcDir = join(hubPath, 'src');
    if (!existsSync(srcDir)) return findings;

    const sourceFiles = findFiles(srcDir, /\.(ts|js|tsx|jsx)$/)
      .filter(f => !f.includes('.test.') && !f.includes('.spec.') && !f.includes('__tests__'));

    const testFiles = new Set(
      findFiles(hubPath, /\.(test|spec)\.(ts|js|tsx|jsx)$/)
        .map(f => f.replace(/\.(test|spec)\./, '.'))
    );

    const untestedFiles = sourceFiles.filter(f => {
      const baseName = f.replace(/\.(ts|js|tsx|jsx)$/, '');
      return !testFiles.has(f) &&
             !testFiles.has(baseName + '.ts') &&
             !testFiles.has(baseName + '.js');
    });

    if (untestedFiles.length > 5) {
      findings.push({
        type: 'risk',
        source: 'test-coverage',
        description: `${untestedFiles.length} source files have no corresponding test file`,
        severity: 2,
        suggestedAction: 'Add tests for uncovered files',
      });
    }
  } catch {
    // Ignore
  }

  return findings;
}

function scanDependencies(hubPath: string): Finding[] {
  const findings: Finding[] = [];

  const pkgPath = join(hubPath, 'package.json');
  if (!existsSync(pkgPath)) return findings;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const wildcards = Object.entries(deps).filter(([_, v]) =>
      v === '*' || v === 'latest'
    );

    if (wildcards.length > 0) {
      findings.push({
        type: 'risk',
        source: 'dependencies',
        description: `${wildcards.length} dependencies use wildcard versions`,
        severity: 2,
        suggestedAction: 'Pin dependency versions',
      });
    }

    const possiblyOutdated = Object.entries(deps).filter(([_, version]) => {
      const v = String(version);
      const match = v.match(/\d+/);
      return match && parseInt(match[0], 10) === 0;
    });

    if (possiblyOutdated.length > 5) {
      findings.push({
        type: 'debt',
        source: 'dependencies',
        description: `${possiblyOutdated.length} dependencies on pre-1.0 versions`,
        severity: 1,
        suggestedAction: 'Consider upgrading dependencies',
      });
    }
  } catch {
    // Ignore
  }

  return findings;
}

async function createWorkFromFindings(
  hubId: string,
  hubPath: string,
  findings: Finding[]
): Promise<void> {
  const byType = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = `${f.type}:${f.source}`;
    const group = byType.get(key) || [];
    group.push(f);
    byType.set(key, group);
  }

  for (const [key, group] of byType) {
    if (group.length === 0) continue;

    const representative = group[0];
    const description = group.length === 1
      ? representative.description
      : `${group.length} ${representative.type}s from ${representative.source}`;

    const input: CreateWorkInput = {
      name: `Address ${representative.source} ${representative.type}s`,
      hubId,
      hubPath,
      ownerId: hubId,
      conditions: [
        {
          id: `${key}-resolved`,
          description: representative.suggestedAction || `Resolve ${representative.type}`,
          verifier: 'llm:Verify the issue has been addressed',
          varietyWeight: representative.severity * 5,
        },
      ],
    };

    await createWork(input);
  }
}

function findFiles(dir: string, pattern: RegExp, maxDepth = 4, depth = 0): string[] {
  if (depth > maxDepth) return [];

  const files: string[] = [];

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const path = join(dir, entry.name);

      if (entry.isFile() && pattern.test(entry.name)) {
        files.push(path);
      } else if (entry.isDirectory()) {
        files.push(...findFiles(path, pattern, maxDepth, depth + 1));
      }
    }
  } catch {
    // Ignore
  }

  return files;
}
