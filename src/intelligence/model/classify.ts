/**
 * S4 Classification — Project archetype detection
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { minimatch } from 'minimatch';
import { ARCHETYPES, type Archetype, type VerifierRequirement } from '../perceive/archetypes.js';

export interface ClassificationResult {
  archetype: Archetype;
  confidence: number;
  matchedSignals: string[];
  suggestedVerifiers: VerifierRequirement[];
}

export async function classifyContext(contextPath: string): Promise<ClassificationResult | null> {
  if (!existsSync(contextPath)) return null;

  const files = listFilesRecursive(contextPath, 2);
  const packageJson = loadPackageJson(contextPath);
  const dependencies = packageJson ? Object.keys(packageJson.dependencies || {}) : [];

  const results: Array<{ archetype: Archetype; score: number; matched: string[] }> = [];

  for (const archetype of Object.values(ARCHETYPES)) {
    const { score, matched } = scoreArchetype(archetype, files, dependencies);
    if (score > 0) {
      results.push({ archetype, score, matched });
    }
  }

  if (results.length === 0) return null;

  results.sort((a, b) => b.score - a.score);
  const best = results[0];

  const maxScore = countSignals(best.archetype);

  return {
    archetype: best.archetype,
    confidence: best.score / maxScore,
    matchedSignals: best.matched,
    suggestedVerifiers: best.archetype.verifiers,
  };
}

function scoreArchetype(
  archetype: Archetype,
  files: string[],
  dependencies: string[]
): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];

  if (archetype.signals.files) {
    for (const pattern of archetype.signals.files) {
      if (files.some(f => minimatch(f, pattern, { dot: true }))) {
        score++;
        matched.push(`file:${pattern}`);
      }
    }
  }

  if (archetype.signals.dependencies) {
    for (const dep of archetype.signals.dependencies) {
      if (dependencies.includes(dep)) {
        score++;
        matched.push(`dep:${dep}`);
      }
    }
  }

  return { score, matched };
}

function countSignals(archetype: Archetype): number {
  return (archetype.signals.files?.length || 0) +
         (archetype.signals.dependencies?.length || 0) +
         (archetype.signals.contents?.length || 0);
}

function listFilesRecursive(dir: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];

  const files: string[] = [];

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const relativePath = entry.name;

      if (entry.isFile()) {
        files.push(relativePath);
      } else if (entry.isDirectory()) {
        const subFiles = listFilesRecursive(join(dir, entry.name), maxDepth, depth + 1);
        files.push(...subFiles.map(f => `${relativePath}/${f}`));
      }
    }
  } catch {
    // Ignore read errors
  }

  return files;
}

function loadPackageJson(dir: string): any {
  const path = join(dir, 'package.json');
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}
