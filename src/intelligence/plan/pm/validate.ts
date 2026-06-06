/**
 * Verifier Validation
 */

import { parseVerifier } from '../../../control/verify/registry.js';

const VALID_VERIFIERS = ['exists', 'contains', 'passes', 'script', 'llm', 'attestation'];

export interface ValidationResult {
  valid: boolean;
  warning?: string;
}

export function validateVerifier(verifier: string): ValidationResult {
  const { type } = parseVerifier(verifier);

  if (!VALID_VERIFIERS.includes(type)) {
    return { valid: false, warning: `Unknown verifier type: ${type}` };
  }

  if (type === 'attestation') {
    return { valid: true, warning: 'Requires external attestation — work will block until attested' };
  }

  return { valid: true };
}

export function validateConditions(
  conditions: Array<{ verifier: string; description: string }>
): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const condition of conditions) {
    const result = validateVerifier(condition.verifier);

    if (!result.valid) {
      errors.push(`Invalid verifier "${condition.verifier}": ${result.warning}`);
    } else if (result.warning) {
      warnings.push(`${condition.description}: ${result.warning}`);
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
