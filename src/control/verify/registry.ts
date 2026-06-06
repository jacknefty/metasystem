/**
 * Verifier Registry
 *
 * Single source of truth for all verifier metadata:
 * - Categories and weights (variety bits)
 * - Autonomy flags and confidence caps
 * - 2-bit capability encoding (S1 existence / S3 correctness)
 * - Prompt generation for LLM decomposition
 */

import type { VerifierFn } from './types.js';
import {
  verifyExists,
  verifyContains,
  verifyPasses,
  verifyScript,
  verifyWithLLM,
  verifyAttestation,
  verifyValid,
} from './verifiers/index.js';
import { loadExtensionVerifiers } from './extensions.js';

// Verifier function names
export type VerifierFunction = 'exists' | 'contains' | 'valid' | 'passes' | 'script' | 'meets' | 'needs';

// Categories map to verification quality
export type VerifierCategory =
  | 'deterministic'       // exists: file/dir exists
  | 'syntactic'           // contains:, valid: text search, format check
  | 'semantic-local'      // passes: lint, typecheck (fast, local)
  | 'semantic-integrated' // passes: test, build (slower, full)
  | 'behavioral'          // meets: LLM judgment
  | 'environmental';      // needs: human attestation

export interface VerifierDef {
  fn: VerifierFunction;
  category: VerifierCategory;
  weight: number;           // variety bits
  description: string;
  examples: string[];
  autonomous: boolean;      // can resolve without human
  maxConfidence: number;    // cap for this verifier type (1.0 = certain)
  runner: VerifierFn;
}

// Local semantic targets - lint/typecheck/format (vs full test/build)
const LOCAL_SEMANTIC_TARGETS = ['lint', 'typecheck', 'format', 'eslint', 'tsc', 'prettier', 'check'];

export const VERIFIER_REGISTRY: Record<VerifierFunction, VerifierDef> = {
  exists: {
    fn: 'exists',
    category: 'deterministic',
    weight: 1,
    description: 'File or directory exists',
    examples: [
      'exists:src/index.ts',
      'exists:public/favicon.ico',
      'exists:README.md',
    ],
    autonomous: true,
    maxConfidence: 1.0,
    runner: verifyExists,
  },
  contains: {
    fn: 'contains',
    category: 'syntactic',
    weight: 2,
    description: 'File contains specific text (path:pattern)',
    examples: [
      'contains:package.json:"react"',
      'contains:index.html:<canvas',
      'contains:game.js:function minimax',
    ],
    autonomous: true,
    maxConfidence: 1.0,
    runner: verifyContains,
  },
  valid: {
    fn: 'valid',
    category: 'syntactic',
    weight: 2,
    description: 'File parses as valid format (JSON, YAML, HTML)',
    examples: [
      'valid:package.json',
      'valid:tsconfig.json',
      'valid:index.html',
    ],
    autonomous: true,
    maxConfidence: 1.0,
    runner: verifyValid,
  },
  passes: {
    fn: 'passes',
    category: 'semantic-integrated', // refined by target in getCategory()
    weight: 8, // refined by target in inferWeight()
    description: 'Command exits with code 0',
    examples: [
      'passes:npm test',
      'passes:npx tsc --noEmit',
      'passes:node -e "require(\'./game\').test()"',
      'passes:npm run build',
    ],
    autonomous: true,
    maxConfidence: 1.0,
    runner: verifyPasses,
  },
  script: {
    fn: 'script',
    category: 'semantic-integrated',
    weight: 8,
    description: 'Run verification script from extensions',
    examples: [
      'script:security-audit',
      'script:performance-check',
    ],
    autonomous: true,
    maxConfidence: 1.0,
    runner: verifyScript,
  },
  meets: {
    fn: 'meets',
    category: 'behavioral',
    weight: 16,
    description: 'LLM judges requirement is satisfied (capped at 60%)',
    examples: [
      'meets:error messages are user-friendly',
      'meets:code follows project conventions',
    ],
    autonomous: false, // LLM can run but confidence is capped
    maxConfidence: 0.6,
    runner: verifyWithLLM,
  },
  needs: {
    fn: 'needs',
    category: 'environmental',
    weight: 32,
    description: 'Requires human attestation - blocks autonomous flow',
    examples: [
      'needs:stakeholder approval',
      'needs:design review',
    ],
    autonomous: false,
    maxConfidence: 1.0, // human attestation is certain
    runner: verifyAttestation,
  },
};

/**
 * Parse verifier string into function and target
 * Returns both new format (fn, target) and legacy format (type, args) for compatibility
 */
export function parseVerifier(verifier: string): {
  fn: VerifierFunction;
  target: string;
  type: string;    // legacy: same as fn
  args: string[];  // legacy: target split by :
} {
  const colonIndex = verifier.indexOf(':');
  if (colonIndex === -1) {
    return {
      fn: 'exists',
      target: verifier,
      type: 'exists',
      args: [verifier],
    };
  }
  const fn = verifier.slice(0, colonIndex) as VerifierFunction;
  const target = verifier.slice(colonIndex + 1);
  const args = target.split(':');

  return {
    fn,
    target,
    type: fn,
    args,
  };
}

/**
 * Get category for a verifier string
 * Refines passes: based on target (lint vs test)
 */
export function getCategory(verifier: string): VerifierCategory {
  const { fn, target } = parseVerifier(verifier);
  const def = VERIFIER_REGISTRY[fn];

  if (!def) return 'deterministic';

  // Refine passes: based on target
  if (fn === 'passes') {
    if (LOCAL_SEMANTIC_TARGETS.some(t => target.toLowerCase().includes(t))) {
      return 'semantic-local';
    }
    return 'semantic-integrated';
  }

  return def.category;
}

/**
 * Get weight (variety bits) for a verifier string
 * Refines passes: based on target
 */
export function inferWeight(verifier: string): number {
  const { fn, target } = parseVerifier(verifier);
  const def = VERIFIER_REGISTRY[fn];

  if (!def) return 1;

  // Refine passes: weight based on target
  if (fn === 'passes') {
    if (LOCAL_SEMANTIC_TARGETS.some(t => target.toLowerCase().includes(t))) {
      return 4; // semantic-local (lint, typecheck)
    }
    return 8; // semantic-integrated (test, build)
  }

  return def.weight;
}

/**
 * Check if verifier can resolve autonomously
 */
export function isAutonomous(verifier: string): boolean {
  const { fn } = parseVerifier(verifier);
  return VERIFIER_REGISTRY[fn]?.autonomous ?? false;
}

/**
 * Get max confidence for verifier type
 */
export function getMaxConfidence(verifier: string): number {
  const { fn } = parseVerifier(verifier);
  return VERIFIER_REGISTRY[fn]?.maxConfidence ?? 1.0;
}

/**
 * 2-bit capability encoding for token minting
 *
 * bit 0: checksExistence (S1 - flow verified)
 *        "Does the thing exist / flow through?"
 *
 * bit 1: checksCorrectness (S3 - state verified)
 *        "Is the state correct / behavior right?"
 *
 * 00 = nothing verified (shouldn't happen)
 * 01 = existence only (exists, contains)
 * 10 = correctness only (meets, needs - judgment without structure check)
 * 11 = both (valid, passes - structure AND behavior)
 */
export function encodeCapabilityBits(verifier: string): number {
  const { fn } = parseVerifier(verifier);
  let bits = 0;

  // Bit 0: existence/structure check
  if (fn === 'exists' || fn === 'contains') {
    bits |= 1;
  }

  // Bit 1: correctness/state check
  if (fn === 'valid' || fn === 'passes' || fn === 'script' || fn === 'meets' || fn === 'needs') {
    bits |= 2;
  }

  // valid and passes also check structure implicitly
  if (fn === 'valid' || fn === 'passes' || fn === 'script') {
    bits |= 1;
  }

  return bits;
}

/**
 * Build prompt section explaining verifier types with examples
 * Used by decomposition to guide LLM in selecting verifiers
 */
export function buildVerifierPromptSection(): string {
  const lines: string[] = [
    'VERIFIER TYPES (use the FIRST one that works - prefer deterministic):',
    '',
  ];

  const order: VerifierFunction[] = ['exists', 'contains', 'valid', 'passes', 'meets', 'needs'];

  for (const fn of order) {
    const def = VERIFIER_REGISTRY[fn];
    const autonomyNote = def.autonomous ? '✓ autonomous' : '✗ blocks autonomous';
    const confidenceNote = def.maxConfidence < 1.0 ? ` (max ${Math.round(def.maxConfidence * 100)}% confidence)` : '';

    lines.push(`${fn}: → ${def.weight} bits (${def.category}) ${autonomyNote}${confidenceNote}`);
    lines.push(`  ${def.description}`);
    lines.push(`  Examples:`);
    for (const ex of def.examples) {
      lines.push(`    ${ex}`);
    }
    lines.push('');
  }

  lines.push('DECISION TREE:');
  lines.push('1. Can a file existence prove it? → exists:');
  lines.push('2. Can a text pattern prove it? → contains:');
  lines.push('3. Can parsing prove it? → valid:');
  lines.push('4. Can a command/test prove it? → passes: (PREFERRED for behavior)');
  lines.push('5. Is it genuinely subjective? → meets: (capped confidence)');
  lines.push('6. Does a human NEED to decide? → needs: (last resort)');
  lines.push('');
  lines.push('CRITICAL: "AI plays optimally" → passes:node -e "test code", NOT needs:');

  return lines.join('\n');
}

/**
 * Analyze verifier distribution for quality audit
 */
export interface VerifierDistribution {
  total: number;
  byCategory: Record<VerifierCategory, number>;
  autonomousCount: number;
  autonomousPercent: number;
  totalBits: number;
  capabilityBits: number; // OR of all verifier capability bits
  warnings: string[];
}

export function analyzeVerifiers(verifiers: string[]): VerifierDistribution {
  const byCategory: Record<VerifierCategory, number> = {
    'deterministic': 0,
    'syntactic': 0,
    'semantic-local': 0,
    'semantic-integrated': 0,
    'behavioral': 0,
    'environmental': 0,
  };

  let autonomousCount = 0;
  let totalBits = 0;
  let capabilityBits = 0;
  const warnings: string[] = [];

  for (const v of verifiers) {
    const category = getCategory(v);
    byCategory[category]++;

    if (isAutonomous(v)) autonomousCount++;
    totalBits += inferWeight(v);
    capabilityBits |= encodeCapabilityBits(v);
  }

  const autonomousPercent = verifiers.length > 0
    ? Math.round((autonomousCount / verifiers.length) * 100)
    : 0;

  if (autonomousPercent < 80) {
    warnings.push(`Only ${autonomousPercent}% autonomous - aim for 80%+`);
  }

  if (byCategory.environmental > 0) {
    warnings.push(`${byCategory.environmental} verifier(s) require human attestation`);
  }

  if (byCategory.behavioral > byCategory['semantic-integrated']) {
    warnings.push('More LLM judgment than tests - consider adding passes: verifiers');
  }

  return {
    total: verifiers.length,
    byCategory,
    autonomousCount,
    autonomousPercent,
    totalBits,
    capabilityBits,
    warnings,
  };
}

// Runtime registry for verifier functions
const verifierFns = new Map<string, VerifierFn>();
let extensionsLoaded = false;

export function registerVerifier(name: string, fn: VerifierFn): void {
  verifierFns.set(name, fn);
}

export function getVerifier(name: string): VerifierFn | undefined {
  return verifierFns.get(name);
}

export function listVerifiers(): string[] {
  return Array.from(verifierFns.keys());
}

export async function initRegistry(): Promise<void> {
  if (extensionsLoaded) return;

  // Register built-ins from VERIFIER_REGISTRY
  for (const [name, def] of Object.entries(VERIFIER_REGISTRY)) {
    verifierFns.set(name, def.runner);
  }

  // Load extensions (can override built-ins)
  const extensions = await loadExtensionVerifiers();
  for (const [name, fn] of extensions) {
    verifierFns.set(name, fn);
  }

  extensionsLoaded = true;
}

// Register built-in verifiers immediately (before async init)
for (const [name, def] of Object.entries(VERIFIER_REGISTRY)) {
  verifierFns.set(name, def.runner);
}
