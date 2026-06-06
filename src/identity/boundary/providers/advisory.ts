/**
 * Advisory Security Provider
 *
 * Logs all access decisions but never blocks.
 * Use for: single-user development, building audit trail, debugging.
 */

import { randomUUID } from 'crypto';
import type {
  SecurityProvider,
  SecurityContext,
  AccessOperation,
  AccessDecision,
  CreateContextParams,
  AuditFilter,
  AuditEntry,
} from '../types.js';
import { isInScope, isScopeSubset } from '../scope.js';
import { logAuditEntry, queryAuditLog } from '../audit-log.js';
import { getNode } from '../../node.js';

const sessions = new Map<string, SecurityContext>();

export class AdvisorySecurityProvider implements SecurityProvider {
  readonly mode = 'advisory' as const;

  async checkAccess(ctx: SecurityContext, op: AccessOperation): Promise<AccessDecision> {
    let inScope = true;
    let reason = 'Advisory mode: access logged';

    switch (op.type) {
      case 'file:read':
      case 'file:write':
        inScope = isInScope(ctx.scope, op.path);
        if (!inScope) {
          reason = `Path ${op.path} outside scope [${ctx.scope.join(', ')}]`;
          console.warn(`[SECURITY:ADVISORY] ${ctx.identity} ${op.type} ${op.path} — OUT OF SCOPE`);
        }
        break;

      case 'chain:emit':
        if (op.subject !== ctx.identity && !op.subject.startsWith(ctx.identity)) {
          reason = `Emitting for subject ${op.subject} (own identity: ${ctx.identity})`;
          console.warn(`[SECURITY:ADVISORY] ${ctx.identity} emitting for ${op.subject}`);
        }
        break;

      case 'execute':
        reason = `Execute work: ${op.workId}`;
        console.log(`[SECURITY:ADVISORY] ${ctx.identity} executing ${op.workId}`);
        break;

      case 'network:fetch':
        reason = `Network fetch: ${op.url}`;
        console.log(`[SECURITY:ADVISORY] ${ctx.identity} fetching ${op.url}`);
        break;
    }

    const decision: AccessDecision = {
      allowed: true,
      reason,
      logged: true,
    };

    logAuditEntry(ctx, op, decision);

    return decision;
  }

  async createContext(params: CreateContextParams): Promise<SecurityContext> {
    const identity = await getNode(params.identity);
    if (!identity) {
      throw new Error(`Identity not found: ${params.identity}`);
    }

    let scope = params.scope || identity.scope || ['**'];

    if (params.scope && identity.scope) {
      if (!isScopeSubset(params.scope, identity.scope)) {
        console.warn(
          `[SECURITY:ADVISORY] Requested scope [${params.scope.join(', ')}] ` +
          `exceeds identity scope [${identity.scope.join(', ')}]`
        );
      }
    }

    const ctx: SecurityContext = {
      identity: params.identity,
      scope,
      capabilities: params.capabilities || [],
      sessionId: `session_${randomUUID()}`,
      workId: params.workId,
    };

    sessions.set(ctx.sessionId, ctx);

    console.log(`[SECURITY:ADVISORY] Session created: ${ctx.sessionId} for ${ctx.identity}`);

    return ctx;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const ctx = sessions.get(sessionId);
    if (ctx) {
      console.log(`[SECURITY:ADVISORY] Session invalidated: ${sessionId}`);
      sessions.delete(sessionId);
    }
  }

  async getAuditLog(filter: AuditFilter): Promise<AuditEntry[]> {
    return queryAuditLog(filter);
  }
}
