/**
 * Contains Verifier — Check if file contains string/pattern
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';
import { parseVerifier } from '../registry.js';

export async function verifyContains(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const { args } = parseVerifier(condition.verifier);
  const filePath = args[0];
  const pattern = args.slice(1).join(':');

  if (!filePath || !pattern) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: 'Invalid format (use contains:file:pattern)',
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const fullPath = join(context.workingDir, filePath);

  if (!existsSync(fullPath)) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: `File not found: ${filePath}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const content = readFileSync(fullPath, 'utf-8');

  let contains = content.includes(pattern);
  if (!contains) {
    try {
      const regex = new RegExp(pattern);
      contains = regex.test(content);
    } catch {
      // Invalid regex, stick with literal result
    }
  }

  return {
    passed: contains,
    confidence: 1.0,
    evidence: contains
      ? `Found "${pattern}" in ${filePath}`
      : `"${pattern}" not found in ${filePath}`,
    conditionId: condition.id,
    verifiedAt: Date.now(),
    sourceType: 'deterministic',
  };
}
