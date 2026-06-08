/**
 * Audit Probe Types
 *
 * Pluggable probes for sporadic verification.
 */

export type ProbeType =
  | 'spine'
  | 'circulatory'
  | 'informational'
  | 'recursion'
  | 'closure'
  | 'identity';

export interface ProbeResult {
  probeType: ProbeType;
  scopeId: string;
  timestamp: number;
  healthy: boolean;
  findings: ProbeFinding[];
  metrics: Record<string, number>;
}

export interface ProbeFinding {
  severity: 1 | 2 | 3;
  category: string;
  message: string;
  evidence?: Record<string, unknown>;
}

export interface ProbeFunction {
  (scopePath: string): Promise<ProbeResult>;
}
