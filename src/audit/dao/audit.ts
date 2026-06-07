/**
 * DAO S3* (Sample Contexts)
 *
 * Samples one context's audit. Re-runs the same verification.
 * Checks if context got it right.
 */

import type { DaoAuditResult, ContextAuditResult } from '../types.js';
import { reVerify } from '../../control/verify/completion.js';
import { getChain } from '../../coordination/channels/chain.js';
import { emitPain } from '../../coordination/channels/algedonic.js';

const LOOKBACK_DAYS = 7;

export async function auditContextAudit(
  daoId: string
): Promise<DaoAuditResult | null> {
  const contextAudits = await getChain().recall({ type: 'audit:context' });

  const now = Date.now();
  const cutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const recent = contextAudits.filter(e => e.timestamp > cutoff);

  if (recent.length === 0) return null;

  const selected = recent[Math.floor(Math.random() * recent.length)];
  const contextAudit = selected.payload as unknown as ContextAuditResult;

  const ourVerification = await reVerify(
    contextAudit.workId,
    contextAudit.nodeId
  );

  const contextSaidDrift = contextAudit.drift;
  const weSayDrift = contextAudit.nodeVerification.passed !== ourVerification.passed;

  const drift = contextSaidDrift !== weSayDrift;

  const result: DaoAuditResult = {
    daoId,
    contextId: contextAudit.contextId,
    nodeId: contextAudit.nodeId,
    workId: contextAudit.workId,
    timestamp: now,
    contextAudit,
    ourVerification,
    drift,
  };

  await getChain().append('audit:dao', daoId, contextAudit.contextId, {
    daoId: result.daoId,
    contextId: result.contextId,
    nodeId: result.nodeId,
    workId: result.workId,
    contextSaidDrift,
    weSayDrift,
    drift: result.drift,
  });

  if (drift) {
    await emitPain(
      'dao-audit',
      contextAudit.contextId,
      `Context audit drift: context said ${contextSaidDrift ? 'drift' : 'no drift'}, we found ${weSayDrift ? 'drift' : 'no drift'}`,
      2
    );
  }

  return result;
}
