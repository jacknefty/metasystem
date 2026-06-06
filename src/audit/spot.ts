/**
 * Audit — Sporadic Verification (S3*)
 *
 * Random audits of completed work. Catches drift and gaming.
 * Runs unpredictably, not on schedule.
 */

import { listWork } from '../coordination/resources/work.js';
import { getChain } from '../coordination/channels/chain.js';

export interface AuditResult {
  workId: string;
  passed: boolean;
  findings: string[];
  auditedAt: number;
}

export interface AuditRecord {
  auditedAt: number;
  passed: boolean;
  findings: string[];
}

const SAMPLE_RATE = 0.1;

export async function selectForAudit(): Promise<string[]> {
  const allWork = await listWork({});
  const completed = allWork.filter(w => w.status === 'fulfilled');

  const selected: string[] = [];
  for (const work of completed) {
    if (Math.random() < SAMPLE_RATE) {
      selected.push(work.id);
    }
  }

  return selected;
}

export async function performAudit(workId: string): Promise<AuditResult> {
  const work = await listWork({}).then(all => all.find(w => w.id === workId));

  if (!work) {
    return {
      workId,
      passed: false,
      findings: ['Work not found'],
      auditedAt: Date.now(),
    };
  }

  // Stub audit — in reality this would re-run verifiers
  const findings: string[] = [];
  const passed = true;

  // Record audit event (using algedonic for now)
  if (!passed) {
    await getChain().append('algedonic:pain', 'audit', workId, {
      severity: 2,
      source: 'audit',
      message: `Audit failed: ${findings.join(', ')}`,
    });
  }

  return {
    workId,
    passed,
    findings,
    auditedAt: Date.now(),
  };
}

export async function getAuditHistory(workId: string): Promise<AuditRecord[]> {
  const events = await getChain().recall({ subject: workId });

  const records: AuditRecord[] = [];
  for (const event of events) {
    if (event.type === 'algedonic:pain') {
      const p = event.payload as { source: string; message: string };
      if (p.source === 'audit') {
        records.push({
          auditedAt: event.timestamp,
          passed: false,
          findings: [p.message],
        });
      }
    }
  }

  return records;
}

export async function runAuditPass(): Promise<AuditResult[]> {
  const workIds = await selectForAudit();
  const results: AuditResult[] = [];

  for (const workId of workIds) {
    const result = await performAudit(workId);
    results.push(result);
  }

  return results;
}
