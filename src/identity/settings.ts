/**
 * Node Settings — S5 Policy Parameters
 *
 * Locally, node owners set them via updateSettings().
 * At network level, changes require governance votes.
 */

export type SecurityMode = 'advisory' | 'enforced' | 'signed';
export type AutonomyLevel = 'locked' | 'supervised' | 'autonomous';

export interface NodeSettings {
  // Autonomy
  autonomyLevel: AutonomyLevel;

  // Security
  securityMode: SecurityMode;

  // Execution
  executor: string;
  maxAttempts: number;
  maxExecutionTime: number;

  // Verification
  confidenceThreshold: number;

  // Work acceptance
  availableForWork: boolean;
  maxConcurrentWork: number;
  minBounty: number;

  // Resource limits
  maxVarietyDebt: number;

  // Network
  allowNetworkExecution: boolean;
  revealIdentity: boolean;

  // Context path (for perception)
  path?: string;
  isRoot?: boolean;
}

export const DEFAULT_SETTINGS: NodeSettings = {
  // Autonomy
  autonomyLevel: 'supervised',

  // Security
  securityMode: 'advisory',

  // Execution
  executor: 'claude',
  maxAttempts: 3,
  maxExecutionTime: 300,

  // Verification
  confidenceThreshold: 0.7,

  // Work
  availableForWork: true,
  maxConcurrentWork: 5,
  minBounty: 0,

  // Resources
  maxVarietyDebt: 100,

  // Network
  allowNetworkExecution: false,
  revealIdentity: false,
};

export function resolveSettings(settings: Partial<NodeSettings>): NodeSettings {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

export function getSetting<K extends keyof NodeSettings>(
  settings: Partial<NodeSettings>,
  key: K
): NodeSettings[K] {
  return settings[key] ?? DEFAULT_SETTINGS[key];
}
