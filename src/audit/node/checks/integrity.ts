/**
 * Contribution Integrity Check (S3* only)
 *
 * Does credit:earned match actual deliverables?
 * Retrospective by nature — only makes sense after credit exists.
 */

import type { AuditFinding } from '../../types.js';
import { getChain } from '../../../coordination/channels/chain.js';
import { getWork } from '../../../coordination/resources/work.js';

export async function checkCreditIntegrity(
  nodeId: string
): Promise<AuditFinding | null> {
  const credits = await getChain().recall({ subject: nodeId, type: 'credit:earned' });

  if (credits.length === 0) return null;

  const credit = credits[Math.floor(Math.random() * credits.length)];
  const payload = credit.payload as { workId?: string };
  const workId = payload.workId;

  if (!workId) return null;

  const work = await getWork(workId);

  if (!work) {
    return {
      check: 'contribution-integrity',
      evidence: `Credit earned for non-existent work: ${workId}`,
    };
  }

  if (work.status !== 'fulfilled') {
    return {
      check: 'contribution-integrity',
      evidence: `Credit earned for non-fulfilled work: ${workId} (status: ${work.status})`,
    };
  }

  if (work.claim?.nodeId !== nodeId) {
    return {
      check: 'contribution-integrity',
      evidence: `Credit earned for work claimed by different node: ${workId} (claimed by: ${work.claim?.nodeId ?? 'none'})`,
    };
  }

  return null;
}
