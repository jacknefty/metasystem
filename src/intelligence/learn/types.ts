/**
 * Learning Types
 */

export interface LearningRecord {
  workId: string;
  nodeId: string;
  contextId: string;
  outcome: 'success' | 'failure' | 'partial';
  conditions: ConditionOutcome[];
  executorUsed: string;
  durationMs: number;
  attempts: number;
  recordedAt: number;
}

export interface ConditionOutcome {
  id: string;
  description: string;
  met: boolean;
  confidence: number;
  verifier: string;
  varietyWeight: number;
}

export interface LearningStats {
  totalRecords: number;
  successRate: number;
  avgDuration: number;
  avgAttempts: number;
  verifierAccuracy: Record<string, number>;
  executorPerformance: Record<string, { successRate: number; avgDuration: number }>;
  commonFailurePatterns: string[];
}

export interface NodeLearning {
  nodeId: string;
  completedCount: number;
  failedCount: number;
  successRate: number;
  avgDuration: number;
  strongVerifiers: string[];
  weakVerifiers: string[];
}
