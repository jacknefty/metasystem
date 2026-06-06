/**
 * Security Module — DEPRECATED
 *
 * Re-exports from identity/boundary/ for backwards compatibility.
 * Import from 'identity/boundary' directly in new code.
 */

export * from '../identity/boundary/index.js';
export {
  getBoundaryProvider as getSecurityProvider,
  createBoundaryContext as createSecurityContext,
  resetBoundaryProviders as resetSecurityProviders,
} from '../identity/boundary/index.js';

export {
  logAuditEntry,
  queryAuditLog,
  getAuditSummary,
} from '../audit/security.js';
