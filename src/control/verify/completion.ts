/**
 * Completion Verification (S3)
 *
 * Runs all checks on work completion. Produces verification record.
 */

import type { CheckResult, VerificationResult } from './checks/types.js';
import { COMPLETION_CHECKS } from './checks/index.js';
import { getChain } from '../../coordination/channels/chain.js';
import { emitPain } from '../../coordination/channels/algedonic.js';

export type { CheckResult, VerificationResult };

export async function runChecks(
  nodeId: string,
  workId: string
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of COMPLETION_CHECKS) {
    const finding = await check.run(nodeId, workId);
    results.push({
      check: check.name,
      passed: finding === null,
      evidence: finding?.evidence,
    });
  }

  return results;
}

export async function verifyCompletion(
  workId: string,
  nodeId: string
): Promise<VerificationResult> {
  const checks = await runChecks(nodeId, workId);
  const passed = checks.every(c => c.passed);

  const result: VerificationResult = {
    workId,
    nodeId,
    timestamp: Date.now(),
    checks,
    passed,
  };

  await getChain().append('verify:completion', nodeId, workId, {
    workId: result.workId,
    nodeId: result.nodeId,
    timestamp: result.timestamp,
    checks: result.checks,
    passed: result.passed,
  });

  if (!passed) {
    const failures = checks.filter(c => !c.passed);
    await emitPain(
      'verification',
      nodeId,
      `Verification failed: ${failures.map(f => f.check).join(', ')}`,
      2,
      workId
    );
  }

  return result;
}

export async function reVerify(
  workId: string,
  nodeId: string
): Promise<VerificationResult> {
  const checks = await runChecks(nodeId, workId);
  const passed = checks.every(c => c.passed);

  return {
    workId,
    nodeId,
    timestamp: Date.now(),
    checks,
    passed,
  };
}
