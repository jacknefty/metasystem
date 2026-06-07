/**
 * Node S3* (Self-Audit)
 *
 * Sporadically re-verifies own past work.
 */

import type { NodeAuditResult } from '../types.js';
import type { VerificationResult, CheckResult } from '../../control/verify/checks/types.js';
import { reVerify } from '../../control/verify/completion.js';
import { getChain } from '../../coordination/channels/chain.js';
import { emitPain } from '../../coordination/channels/algedonic.js';

const LOOKBACK_DAYS = 14;

export async function auditOwnWork(nodeId: string): Promise<NodeAuditResult | null> {
  const verifications = await getChain().recall({
    emitter: nodeId,
    type: 'verify:completion',
  });

  const now = Date.now();
  const cutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const candidates = verifications
    .filter(v => (v.payload as VerificationResult).passed)
    .filter(v => v.timestamp > cutoff);

  if (candidates.length === 0) return null;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const original = selected.payload as VerificationResult;

  const reVerification = await reVerify(original.workId, nodeId);

  const drift =
    original.passed !== reVerification.passed ||
    !checksMatch(original.checks, reVerification.checks);

  const result: NodeAuditResult = {
    nodeId,
    workId: original.workId,
    timestamp: now,
    originalVerification: original,
    reVerification,
    drift,
    driftDetails: drift ? describeDrift(original, reVerification) : undefined,
  };

  await getChain().append('audit:node', nodeId, original.workId, {
    nodeId: result.nodeId,
    workId: result.workId,
    originalPassed: original.passed,
    reVerificationPassed: reVerification.passed,
    drift: result.drift,
    driftDetails: result.driftDetails,
  });

  if (drift) {
    await emitPain(
      'self-audit',
      nodeId,
      `Verification drift on ${original.workId}: ${result.driftDetails}`,
      2
    );
  }

  return result;
}

function checksMatch(a: CheckResult[], b: CheckResult[]): boolean {
  if (a.length !== b.length) return false;
  for (const checkA of a) {
    const checkB = b.find(c => c.check === checkA.check);
    if (!checkB || checkA.passed !== checkB.passed) return false;
  }
  return true;
}

function describeDrift(
  original: VerificationResult,
  reVerification: VerificationResult
): string {
  const diffs: string[] = [];
  for (const checkA of original.checks) {
    const checkB = reVerification.checks.find(c => c.check === checkA.check);
    if (checkB && checkA.passed !== checkB.passed) {
      diffs.push(`${checkA.check}: was ${checkA.passed}, now ${checkB.passed}`);
    }
  }
  return diffs.join('; ') || 'unknown drift';
}
