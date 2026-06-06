/**
 * Security Types
 */

export interface SecurityContext {
  identity: string;
  scope: string[];
  capabilities: Capability[];
  sessionId: string;
  workId?: string;
  parentIdentity?: string;
  expiresAt?: number;
}

export interface Capability {
  type: 'file:read' | 'file:write' | 'chain:emit' | 'execute' | 'network:fetch';
  pattern: string;
  grantedBy: string;
  grantedAt: number;
  expiresAt?: number;
}

export type AccessOperation =
  | { type: 'file:read'; path: string }
  | { type: 'file:write'; path: string }
  | { type: 'chain:emit'; eventType: string; subject: string }
  | { type: 'execute'; workId: string }
  | { type: 'network:fetch'; url: string };

export interface AccessDecision {
  allowed: boolean;
  reason: string;
  logged: boolean;
  algedonicEmitted?: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: number;
  identity: string;
  sessionId: string;
  workId?: string;
  operation: AccessOperation;
  decision: AccessDecision;
  context?: Record<string, unknown>;
}

export interface AuditFilter {
  identity?: string;
  sessionId?: string;
  workId?: string;
  since?: number;
  until?: number;
  operationType?: AccessOperation['type'];
  allowedOnly?: boolean;
  deniedOnly?: boolean;
  limit?: number;
}

export interface CreateContextParams {
  identity: string;
  workId?: string;
  scope?: string[];
  capabilities?: Capability[];
  ttlMs?: number;
  contractAuthorized?: boolean;
}

export interface SecurityProvider {
  readonly mode: 'advisory' | 'enforced' | 'signed';

  checkAccess(ctx: SecurityContext, op: AccessOperation): Promise<AccessDecision>;
  createContext(params: CreateContextParams): Promise<SecurityContext>;
  invalidateSession(sessionId: string): Promise<void>;
  getAuditLog(filter: AuditFilter): Promise<AuditEntry[]>;
}
