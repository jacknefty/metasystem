/**
 * Audit Log — Persistent record of all access decisions
 *
 * This is S5 policy enforcement logging, not S3* sporadic audit.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { paths } from '../paths.js';
import type { AuditEntry, AuditFilter, AccessOperation, AccessDecision, SecurityContext } from './types.js';

function getAuditDir(): string {
  const dir = join(paths.root(), 'security-audit');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getAuditLogPath(): string {
  const date = new Date().toISOString().split('T')[0];
  return join(getAuditDir(), `audit-${date}.jsonl`);
}

export function logAuditEntry(
  ctx: SecurityContext,
  operation: AccessOperation,
  decision: AccessDecision,
  context?: Record<string, unknown>
): AuditEntry {
  const entry: AuditEntry = {
    id: `audit_${randomUUID()}`,
    timestamp: Date.now(),
    identity: ctx.identity,
    sessionId: ctx.sessionId,
    workId: ctx.workId,
    operation,
    decision,
    context,
  };

  appendFileSync(getAuditLogPath(), JSON.stringify(entry) + '\n');

  return entry;
}

export function queryAuditLog(filter: AuditFilter): AuditEntry[] {
  const results: AuditEntry[] = [];
  const auditDir = getAuditDir();

  if (!existsSync(auditDir)) return results;

  const files = readdirSync(auditDir)
    .filter((f: string) => f.startsWith('audit-') && f.endsWith('.jsonl'))
    .sort()
    .reverse();

  for (const file of files) {
    const content = readFileSync(join(auditDir, file), 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    for (const line of lines) {
      try {
        const entry: AuditEntry = JSON.parse(line);

        if (filter.identity && entry.identity !== filter.identity) continue;
        if (filter.sessionId && entry.sessionId !== filter.sessionId) continue;
        if (filter.workId && entry.workId !== filter.workId) continue;
        if (filter.since && entry.timestamp < filter.since) continue;
        if (filter.until && entry.timestamp > filter.until) continue;
        if (filter.operationType && entry.operation.type !== filter.operationType) continue;
        if (filter.allowedOnly && !entry.decision.allowed) continue;
        if (filter.deniedOnly && entry.decision.allowed) continue;

        results.push(entry);

        if (filter.limit && results.length >= filter.limit) {
          return results;
        }
      } catch {
        // Skip malformed entries
      }
    }
  }

  return results;
}

export function getAuditSummary(identity: string, since?: number): {
  totalOperations: number;
  allowed: number;
  denied: number;
  byType: Record<string, { allowed: number; denied: number }>;
} {
  const entries = queryAuditLog({ identity, since });

  const summary = {
    totalOperations: entries.length,
    allowed: 0,
    denied: 0,
    byType: {} as Record<string, { allowed: number; denied: number }>,
  };

  for (const entry of entries) {
    if (entry.decision.allowed) {
      summary.allowed++;
    } else {
      summary.denied++;
    }

    const type = entry.operation.type;
    if (!summary.byType[type]) {
      summary.byType[type] = { allowed: 0, denied: 0 };
    }
    if (entry.decision.allowed) {
      summary.byType[type].allowed++;
    } else {
      summary.byType[type].denied++;
    }
  }

  return summary;
}
