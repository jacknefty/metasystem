/**
 * Attestation Verifier — Wait for external attestation
 * Also handles needs:env:<VAR> for environment variable checks
 */

import { getChain } from '../../../coordination/channels/chain.js';
import { parseVerifier } from '../registry.js';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';

export async function verifyAttestation(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const { type, args } = parseVerifier(condition.verifier);

  // Handle needs:env:<VAR> — check if environment variable exists
  if (type === 'needs' && args[0] === 'env' && args[1]) {
    const varName = args[1];
    const exists = process.env[varName] !== undefined;
    return {
      passed: exists,
      confidence: 1.0,
      evidence: exists ? `Environment variable ${varName} is set` : `Missing env var: ${varName}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const events = await getChain().recall({
    subject: context.workId,
    type: 'condition:met',
  });

  const attestEvent = events.find(e => {
    const payload = e.payload as { conditionId: string };
    return payload.conditionId === condition.id;
  });

  if (attestEvent) {
    const payload = attestEvent.payload as { conditionId: string; evidence: string };
    return {
      passed: true,
      confidence: 1.0,
      evidence: payload.evidence || 'Attested externally',
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'attestation',
    };
  }

  return {
    passed: false,
    confidence: 0,
    evidence: 'Awaiting attestation (POST /api/work/:id/attest)',
    conditionId: condition.id,
    verifiedAt: Date.now(),
    sourceType: 'attestation',
  };
}
