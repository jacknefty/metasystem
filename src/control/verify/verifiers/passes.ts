/**
 * Passes Verifier — Run command, pass if exit 0
 */

import { execSync } from 'child_process';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';
import { parseVerifier } from '../registry.js';

export async function verifyPasses(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const { args } = parseVerifier(condition.verifier);
  const command = args.join(':');

  if (!command) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: 'No command specified (use passes:command)',
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  try {
    const output = execSync(command, {
      cwd: context.workingDir,
      encoding: 'utf-8',
      timeout: 5 * 60 * 1000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      passed: true,
      confidence: 1.0,
      evidence: `Command passed: ${command}\n${output.slice(0, 500)}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    return {
      passed: false,
      confidence: 1.0,
      evidence: `Command failed: ${command}\n${e.stderr || e.message}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }
}
