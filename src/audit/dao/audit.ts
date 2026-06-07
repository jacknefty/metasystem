/**
 * DAO S3* (Sample Contexts)
 *
 * Samples one context's audit. Re-runs the same verification.
 * Checks if context got it right.
 */

import type { DaoAuditResult, HubAuditResult } from '../types.js';
import { reVerify } from '../../control/verify/completion.js';
import { getChain } from '../../coordination/channels/chain.js';
import { emitPain } from '../../coordination/channels/algedonic.js';

const LOOKBACK_DAYS = 7;

export async function auditContextAudit(
  daoId: string
): Promise<DaoAuditResult | null> {
  const hubAudits = await getChain().recall({ type: 'audit:hub' });

  const now = Date.now();
  const cutoff = now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

  const recent = hubAudits.filter(e => e.timestamp > cutoff);

  if (recent.length === 0) return null;

  const selected = recent[Math.floor(Math.random() * recent.length)];
  const hubAudit = selected.payload as unknown as HubAuditResult;

  const ourVerification = await reVerify(
    hubAudit.workId,
    hubAudit.nodeId
  );

  const hubSaidDrift = hubAudit.drift;
  const weSayDrift = hubAudit.nodeVerification.passed !== ourVerification.passed;

  const drift = hubSaidDrift !== weSayDrift;

  const result: DaoAuditResult = {
    daoId,
    hubId: hubAudit.hubId,
    nodeId: hubAudit.nodeId,
    workId: hubAudit.workId,
    timestamp: now,
    hubAudit,
    ourVerification,
    drift,
  };

  await getChain().append('audit:dao', daoId, hubAudit.hubId, {
    daoId: result.daoId,
    hubId: result.hubId,
    nodeId: result.nodeId,
    workId: result.workId,
    hubSaidDrift,
    weSayDrift,
    drift: result.drift,
  });

  if (drift) {
    await emitPain(
      'dao-audit',
      hubAudit.hubId,
      `Hub audit drift: hub said ${hubSaidDrift ? 'drift' : 'no drift'}, we found ${weSayDrift ? 'drift' : 'no drift'}`,
      2
    );
  }

  return result;
}
