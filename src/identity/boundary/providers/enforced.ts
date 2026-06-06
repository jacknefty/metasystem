/**
 * Enforced Security Provider
 *
 * Actually blocks scope violations at runtime.
 * Use for: multi-user, untrusted agents, production.
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
import { logAuditEntry, queryAuditLog } from '../../../audit/security.js';
import { getNode } from '../../node.js';
import { emitPain } from '../../../coordination/channels/algedonic.js';

const sessions = new Map<string, SecurityContext>();

export class EnforcedSecurityProvider implements SecurityProvider {
  readonly mode = 'enforced' as const;

  async checkAccess(ctx: SecurityContext, op: AccessOperation): Promise<AccessDecision> {
    let allowed = true;
    let reason = 'Access granted';

    switch (op.type) {
      case 'file:read':
      case 'file:write': {
        const inScope = isInScope(ctx.scope, op.path);
        if (!inScope) {
          allowed = false;
          reason = `BLOCKED: Path ${op.path} outside scope [${ctx.scope.join(', ')}]`;
          console.error(`[SECURITY:ENFORCED] ${ctx.identity} ${op.type} ${op.path} — BLOCKED (out of scope)`);
        }
        break;
      }

      case 'chain:emit': {
        const isOwnIdentity = op.subject === ctx.identity;
        const isOwnWork = ctx.workId && op.subject === ctx.workId;
        const isChildSubject = op.subject.startsWith(`${ctx.identity}/`);

        if (!isOwnIdentity && !isOwnWork && !isChildSubject) {
          allowed = false;
          reason = `BLOCKED: Cannot emit for subject ${op.subject} (identity: ${ctx.identity}, work: ${ctx.workId || 'none'})`;
          console.error(`[SECURITY:ENFORCED] ${ctx.identity} chain:emit for ${op.subject} — BLOCKED`);
        }
        break;
      }

      case 'execute': {
        reason = `Execute work: ${op.workId}`;
        console.log(`[SECURITY:ENFORCED] ${ctx.identity} executing ${op.workId}`);
        break;
      }

      case 'network:fetch': {
        reason = `Network fetch allowed: ${op.url}`;
        console.log(`[SECURITY:ENFORCED] ${ctx.identity} fetching ${op.url}`);
        break;
      }
    }

    const decision: AccessDecision = {
      allowed,
      reason,
      logged: true,
      algedonicEmitted: !allowed,
    };

    if (!allowed) {
      await emitPain(
        'security:enforced',
        ctx.identity,
        reason,
        2,
        ctx.workId
      );
    }

    logAuditEntry(ctx, op, decision);

    return decision;
  }

  async createContext(params: CreateContextParams): Promise<SecurityContext> {
    const identity = await getNode(params.identity);
    if (!identity) {
      throw new Error(`Identity not found: ${params.identity}`);
    }

    let scope = params.scope || identity.scope || ['**'];

    if (params.scope && identity.scope && !params.contractAuthorized) {
      if (!isScopeSubset(params.scope, identity.scope)) {
        throw new Error(
          `Scope violation: Requested scope [${params.scope.join(', ')}] ` +
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
      expiresAt: params.ttlMs ? Date.now() + params.ttlMs : undefined,
    };

    sessions.set(ctx.sessionId, ctx);

    console.log(`[SECURITY:ENFORCED] Session created: ${ctx.sessionId} for ${ctx.identity} (scope: ${scope.join(', ')})`);

    return ctx;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    const ctx = sessions.get(sessionId);
    if (ctx) {
      console.log(`[SECURITY:ENFORCED] Session invalidated: ${sessionId}`);
      sessions.delete(sessionId);
    }
  }

  async getAuditLog(filter: AuditFilter): Promise<AuditEntry[]> {
    return queryAuditLog(filter);
  }
}
