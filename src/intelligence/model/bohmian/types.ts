/**
 * Bohmian Types
 *
 * Wave/particle dynamics for guiding agents through capability space.
 */

export interface Configuration {
  verified: number;   // 0-1: completed work / total capacity
  active: number;     // 0-1: current utilization
  resources: number;  // 0-1: remaining budget / allocated
}

export interface Vector {
  verified: number;
  active: number;
  resources: number;
}

export interface WaveFunction {
  amplitude: (q: Configuration) => number;
  phase: (q: Configuration) => number;
  velocity: (q: Configuration) => Vector;
  potential: (q: Configuration) => number;
}

export interface S4Field {
  gaps: CapabilityGap[];
  opportunities: Opportunity[];
  threats: Threat[];
  values: Vector;
  timestamp: number;
}

export interface CapabilityGap {
  id: string;
  center: Configuration;
  radius: number;
  description: string;
}

export interface Opportunity {
  id: string;
  center: Configuration;
  radius: number;
  boost: number;
  description: string;
}

export interface Threat {
  id: string;
  center: Configuration;
  radius: number;
  severity: number;
  description: string;
}

export interface BohmianState {
  nodeId: string;
  Q: Configuration;
  velocity: Vector;
  quantumPotential: number;
  mass: number;
  lastEvolved: number;
}

export interface Measurement {
  Q: Configuration;
  quantumPotential: number;
  tokenMultiplier: number;
  collapsedBranch: string[];
  emptyBranches: EmptyBranch[];
}

export interface EmptyBranch {
  conditionId: string;
  configAtFork: Configuration;
  reason: string;
}
