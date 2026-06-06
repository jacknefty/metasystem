/**
 * Exists Verifier — Check if file/path exists
 */

import { existsSync } from 'fs';
import { join } from 'path';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';
import { parseVerifier } from '../registry.js';

export async function verifyExists(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const { args } = parseVerifier(condition.verifier);
  const targetPath = args[0];

  if (!targetPath) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: 'No path specified in verifier (use exists:path/to/file)',
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const fullPath = join(context.workingDir, targetPath);
  const exists = existsSync(fullPath);

  return {
    passed: exists,
    confidence: 1.0,
    evidence: exists ? `Path exists: ${targetPath}` : `Path not found: ${targetPath}`,
    conditionId: condition.id,
    verifiedAt: Date.now(),
    sourceType: 'deterministic',
  };
}
