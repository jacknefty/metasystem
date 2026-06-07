/**
 * Audit Module (S3*)
 *
 * Sporadic re-verification at each recursion level.
 */

export type {
  NodeAuditResult,
  ContextAuditResult,
  DaoAuditResult,
  AuditFinding,
} from './types.js';

export { auditOwnWork } from './node/audit.js';
export { checkCreditIntegrity } from './node/checks/index.js';
export { auditNodeVerification } from './context/audit.js';
export { auditContextAudit } from './dao/audit.js';

export { selfAssess } from './assess.js';
