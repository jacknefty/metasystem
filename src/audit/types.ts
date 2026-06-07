/**
 * Audit Types (S3*)
 *
 * Sporadic re-verification of past verifications.
 */

import type { VerificationResult } from '../control/verify/checks/types.js';

export interface NodeAuditResult {
  nodeId: string;
  workId: string;
  timestamp: number;
  originalVerification: VerificationResult;
  reVerification: VerificationResult;
  drift: boolean;
  driftDetails?: string;
}

export interface ContextAuditResult {
  contextId: string;
  nodeId: string;
  workId: string;
  timestamp: number;
  nodeVerification: VerificationResult;
  ourVerification: VerificationResult;
  drift: boolean;
  driftDetails?: string;
}

export interface DaoAuditResult {
  daoId: string;
  contextId: string;
  nodeId: string;
  workId: string;
  timestamp: number;
  contextAudit: ContextAuditResult;
  ourVerification: VerificationResult;
  drift: boolean;
}

export interface AuditFinding {
  check: string;
  evidence: string;
}
