/**
 * Context S3* (Sample Nodes)
 *
 * Samples one node's verification record. Re-runs. Compares.
 */

import type { ContextAuditResult } from '../types.js';
import type { VerificationResult, CheckResult } from '../../control/verify/checks/types.js';
import { reVerify } from '../../control/verify/completion.js';
import { getChain } from '../../coordination/channels/chain.js';
import { emitPain } from '../../coordination/channels/algedonic.js';
import { getMembers } from '../../coordination/resources/membership.js';

const LOOKBACK_DAYS = 7;

export async function auditNodeVerification(
  contextId: string
): Promise<ContextAuditResult | null> {
  const members = await getMembers(contextId);
  if (members.length === 0) return null;

  const member = members[Math.floor(Math.random() * members.length)];
  const nodeId = member.nodeId;

  const verifications = await getChain().recall({
    emitter: nodeId,
    type: 'verify:completion',
  });

  const now = Date.now();
  const cutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const recent = verifications.filter(v => v.timestamp > cutoff);

  if (recent.length === 0) return null;

  const selected = recent[Math.floor(Math.random() * recent.length)];
  const nodeVerification = selected.payload as VerificationResult;

  const ourVerification = await reVerify(nodeVerification.workId, nodeId);

  const drift =
    nodeVerification.passed !== ourVerification.passed ||
    !checksMatch(nodeVerification.checks, ourVerification.checks);

  const result: ContextAuditResult = {
    contextId,
    nodeId,
    workId: nodeVerification.workId,
    timestamp: now,
    nodeVerification,
    ourVerification,
    drift,
    driftDetails: drift ? describeDrift(nodeVerification, ourVerification) : undefined,
  };

  await getChain().append('audit:context', contextId, nodeId, {
    contextId: result.contextId,
    nodeId: result.nodeId,
    workId: result.workId,
    nodeVerificationPassed: nodeVerification.passed,
    ourVerificationPassed: ourVerification.passed,
    drift: result.drift,
    driftDetails: result.driftDetails,
  });

  if (drift) {
    await emitPain(
      'context-audit',
      nodeId,
      `Node verification drift: ${result.driftDetails}`,
      2,
      contextId
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
