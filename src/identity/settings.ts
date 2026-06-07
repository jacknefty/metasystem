/**
 * Node Settings — S5 Policy Parameters
 *
 * Re-exports from shared types for backward compatibility.
 * New code should import from 'types/' directly.
 */

// Re-export types from shared
export {
  type SecurityMode,
  type AutonomyLevel,
  type NodeSettings,
  DEFAULT_NODE_SETTINGS,
} from '../types/identity.js';

// Alias for backward compatibility
import { DEFAULT_NODE_SETTINGS } from '../types/identity.js';
export const DEFAULT_SETTINGS = DEFAULT_NODE_SETTINGS;

// Local utilities (not in shared types)
import type { NodeSettings } from '../types/identity.js';

export function resolveSettings(settings: Partial<NodeSettings>): NodeSettings {
  return {
    ...DEFAULT_NODE_SETTINGS,
    ...settings,
  };
}

export function getSetting<K extends keyof NodeSettings>(
  settings: Partial<NodeSettings>,
  key: K
): NodeSettings[K] {
  return settings[key] ?? DEFAULT_NODE_SETTINGS[key];
}
