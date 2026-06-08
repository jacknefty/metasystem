/**
 * Verification Check Types (Control)
 */

export interface CheckFinding {
  check: string;
  evidence: string;
}

export interface CheckResult {
  check: string;
  passed: boolean;
  evidence?: string;
}

export interface CompletionCheck {
  name: string;
  run: (nodeId: string, workId?: string) => Promise<CheckFinding | null>;
}

export interface VerificationResult {
  workId: string;
  nodeId: string;
  timestamp: number;
  checks: CheckResult[];
  passed: boolean;
}
