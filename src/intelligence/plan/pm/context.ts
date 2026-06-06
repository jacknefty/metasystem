/**
 * Context Perception — Read project state to pre-fill contract
 *
 * S4 perceives before asking. Reads:
 * - Project files (README, package.json, source structure)
 * - Chain events (prior work, what succeeded, what failed)
 * - Existing patterns (test frameworks, languages, architectures)
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { getNode } from '../../../identity/node.js';
import { getChain } from '../../../coordination/channels/chain.js';
import type { HubContext, PartialContract, InferredField, ContractConstraints, Risk } from './types.js';

export async function perceiveContext(hubId: string): Promise<HubContext> {
  const node = await getNode(hubId);
  const contextDir = node?.settings?.path || process.cwd();

  const files = existsSync(contextDir)
    ? scanDirectory(contextDir)
    : [];

  const readme = readFileIfExists(join(contextDir, 'README.md'));
  const packageJson = readJsonIfExists(join(contextDir, 'package.json'));

  const { languages, frameworks } = detectStack(files, packageJson);
  const { hasTests, testPattern } = detectTestSetup(files, packageJson);

  const events = await getChain().recall({ subject: hubId });
  const workEvents = events.filter(e => e.type.startsWith('work:'));
  const priorWork = extractPriorWork(workEvents);

  const conditionMet = events.filter(e => e.type === 'condition:met');
  const priorPatterns = extractVerifierPatterns(conditionMet);

  return {
    hubId,
    contextDir,
    files,
    readme,
    packageJson,
    languages,
    frameworks,
    hasTests,
    testPattern,
    priorWork,
    priorPatterns,
  };
}

export function inferFromContext(
  context: HubContext,
  userMessage: string
): PartialContract {
  const partial: PartialContract = {
    problem: null,
    successMetric: null,
    scopeIn: null,
    scopeOut: null,
    constraints: null,
    assumptions: null,
    risks: null,
  };

  if (context.readme) {
    const projectDesc = extractFirstParagraph(context.readme);
    partial.problem = {
      value: `Extend ${projectDesc}: ${userMessage}`,
      confidence: 'medium',
      source: 'README.md + user message',
    };
  } else {
    partial.problem = {
      value: userMessage,
      confidence: 'low',
      source: 'user message only',
    };
  }

  if (context.files.length > 0) {
    const topDirs = extractTopLevelDirs(context.files);
    partial.scopeIn = {
      value: topDirs.map(d => `${d}/**`),
      confidence: 'medium',
      source: 'existing file structure',
    };
  }

  const constraints: ContractConstraints = {};
  if (context.hasTests) {
    constraints.agentCount = constraints.agentCount || 1;
  }
  if (Object.keys(constraints).length > 0) {
    partial.constraints = {
      value: constraints,
      confidence: 'low',
      source: 'file analysis',
    };
  }

  const assumptions: string[] = [];
  if (context.languages.length > 0) {
    assumptions.push(...context.languages.map(l => `Language: ${l}`));
  }
  if (context.frameworks.length > 0) {
    assumptions.push(...context.frameworks.map(f => `Framework: ${f}`));
  }
  if (context.hasTests && context.testPattern) {
    assumptions.push(`Testing: ${context.testPattern}`);
  }
  if (context.priorPatterns.length > 0) {
    assumptions.push(`Verified patterns: ${context.priorPatterns.slice(0, 3).join(', ')}`);
  }
  if (assumptions.length > 0) {
    partial.assumptions = {
      value: assumptions,
      confidence: 'high',
      source: 'file analysis + chain history',
    };
  }

  return partial;
}

function scanDirectory(dir: string, prefix = ''): string[] {
  const results: string[] = [];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        results.push(path + '/');
        if (results.length < 200) {
          results.push(...scanDirectory(join(dir, entry.name), path));
        }
      } else {
        results.push(path);
      }
    }
  } catch {
    // Directory read failed
  }

  return results.slice(0, 200);
}

function readFileIfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : null;
  } catch {
    return null;
  }
}

function readJsonIfExists(path: string): any | null {
  const content = readFileIfExists(path);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function detectStack(files: string[], packageJson: any): { languages: string[]; frameworks: string[] } {
  const languages: string[] = [];
  const frameworks: string[] = [];

  const extensions = new Set(files.map(f => extname(f).slice(1)).filter(Boolean));
  if (extensions.has('ts') || extensions.has('tsx')) languages.push('TypeScript');
  if (extensions.has('js') || extensions.has('jsx')) languages.push('JavaScript');
  if (extensions.has('sol')) languages.push('Solidity');
  if (extensions.has('py')) languages.push('Python');
  if (extensions.has('rs')) languages.push('Rust');
  if (extensions.has('go')) languages.push('Go');

  if (packageJson?.dependencies) {
    const deps = Object.keys(packageJson.dependencies);
    if (deps.includes('react')) frameworks.push('React');
    if (deps.includes('next')) frameworks.push('Next.js');
    if (deps.includes('express')) frameworks.push('Express');
    if (deps.includes('hardhat')) frameworks.push('Hardhat');
    if (deps.includes('ethers')) frameworks.push('Ethers.js');
  }

  if (files.some(f => f.includes('contracts/') && f.endsWith('.sol'))) {
    if (!frameworks.includes('Hardhat')) frameworks.push('Solidity project');
  }

  return { languages, frameworks };
}

function detectTestSetup(files: string[], packageJson: any): { hasTests: boolean; testPattern: string | null } {
  const testFiles = files.filter(f =>
    f.includes('test/') ||
    f.includes('__tests__/') ||
    f.endsWith('.test.ts') ||
    f.endsWith('.test.js') ||
    f.endsWith('.spec.ts') ||
    f.endsWith('.spec.js')
  );

  if (testFiles.length === 0) {
    return { hasTests: false, testPattern: null };
  }

  let testPattern = 'tests exist';
  if (packageJson?.scripts?.test) {
    testPattern = packageJson.scripts.test;
  } else if (packageJson?.devDependencies?.vitest) {
    testPattern = 'npx vitest';
  } else if (packageJson?.devDependencies?.jest) {
    testPattern = 'npx jest';
  } else if (packageJson?.devDependencies?.hardhat) {
    testPattern = 'npx hardhat test';
  }

  return { hasTests: true, testPattern };
}

function extractPriorWork(events: any[]): Array<{ id: string; name: string; status: string; conditions: number }> {
  const workMap = new Map<string, any>();

  for (const e of events) {
    const id = e.subject;
    if (!workMap.has(id)) {
      workMap.set(id, { id, name: id, status: 'unknown', conditions: 0 });
    }
    const w = workMap.get(id)!;

    if (e.type === 'work:created') {
      w.name = e.payload.name || id;
      w.conditions = e.payload.conditions?.length || 0;
      w.status = 'active';
    } else if (e.type === 'work:fulfilled') {
      w.status = 'fulfilled';
    } else if (e.type === 'work:rejected') {
      w.status = 'rejected';
    }
  }

  return Array.from(workMap.values());
}

function extractVerifierPatterns(conditionMetEvents: any[]): string[] {
  const patterns = new Set<string>();

  for (const e of conditionMetEvents) {
    const evidence = e.payload.evidence || '';
    if (evidence.includes('passes:')) patterns.add('passes');
    if (evidence.includes('exists:')) patterns.add('exists');
    if (evidence.includes('contains:')) patterns.add('contains');
  }

  return Array.from(patterns);
}

function extractFirstParagraph(text: string): string {
  const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  return lines[0]?.slice(0, 200) || '';
}

function extractTopLevelDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.split('/');
    if (parts.length > 1) {
      dirs.add(parts[0]);
    }
  }
  return Array.from(dirs).slice(0, 5);
}
