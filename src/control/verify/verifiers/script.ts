/**
 * Script Verifier — Run script file, parse JSON output
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';
import { parseVerifier } from '../registry.js';

export async function verifyScript(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const { args } = parseVerifier(condition.verifier);
  const scriptPath = args[0];

  if (!scriptPath) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: 'No script path specified (use script:./path/to/verify.sh)',
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const fullPath = join(context.workingDir, scriptPath);

  if (!existsSync(fullPath)) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: `Script not found: ${scriptPath}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  try {
    const output = execSync(fullPath, {
      cwd: context.workingDir,
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000,
      env: {
        ...process.env,
        CONDITION_ID: condition.id,
        CONDITION_DESC: condition.description,
        WORK_ID: context.workId,
        CHANGED_FILES: context.changedFiles.join('\n'),
      },
    });

    const parsed = JSON.parse(output.trim());

    return {
      passed: !!parsed.passed,
      confidence: Math.min(1, Math.max(0, parsed.confidence ?? 1.0)),
      evidence: parsed.evidence || 'Script completed',
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  } catch (err: unknown) {
    const e = err as { message?: string; stderr?: string };

    if (e.message?.includes('JSON')) {
      return {
        passed: false,
        confidence: 0.5,
        evidence: `Script output is not valid JSON: ${e.message}`,
        conditionId: condition.id,
        verifiedAt: Date.now(),
        sourceType: 'deterministic',
      };
    }

    return {
      passed: false,
      confidence: 1.0,
      evidence: `Script failed: ${e.stderr || e.message}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }
}
