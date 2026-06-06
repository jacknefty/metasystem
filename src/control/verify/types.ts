/**
 * Verification Types
 */

export type SourceType =
  | 'deterministic'
  | 'code-review'
  | 'behavioral'
  | 'historical'
  | 'attestation';

export interface VerifierResult {
  passed: boolean;
  confidence: number;
  evidence: string;
  conditionId: string;
  verifiedAt: number;
  sourceType: SourceType;
}

export interface ConditionInput {
  id: string;
  description: string;
  verifier: string;
  varietyWeight?: number;
}

export interface VerifyContext {
  workId: string;
  contextId: string;
  branch: string;
  workingDir: string;
  changedFiles: string[];
}

export type VerifierFn = (
  condition: ConditionInput,
  context: VerifyContext
) => Promise<VerifierResult>;
