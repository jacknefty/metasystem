/**
 * Design System — Standardized visual tokens
 *
 * Two recursion levels with distinct color palettes:
 *
 * LOCAL LEVEL (within user's workspace):
 * - Root S5 (e.g., jack): Green
 * - Projects (S1s with members): Yellow/Gold
 * - S1s (no members): Orange
 * - Algedonic signals: Red
 *
 * NETWORK LEVEL (MetasystemDAO):
 * - MetasystemDAO S5: Violet
 * - Projects (S1s with members): Indigo
 * - S1s (no members): Cyan
 *
 * All nodes are futuristic black boxes with colored accents.
 */

// =============================================================================
// Node Types
// =============================================================================

export type NodeRole =
  | 'local-root'      // Root S5 at local level (green)
  | 'local-project'   // S1 with members at local level (gold)
  | 'local-s1'        // S1 without members at local level (orange)
  | 'network-s5'      // MetasystemDAO S5 (violet)
  | 'network-project' // S1 with members at network level (indigo)
  | 'network-s1'      // S1 without members at network level (cyan)
  | 'algedonic';      // Pain/pleasure signals (red)

export type RecursionLevel = 'local' | 'network';

// =============================================================================
// Colors
// =============================================================================

export const COLORS = {
  // Background layers - deep space black
  bg: {
    void: '#000000',
    deep: '#050608',
    surface: '#0a0d10',
    elevated: '#0f1318',
    panel: '#141920',
  },

  // LOCAL: Root S5 (green)
  localRoot: {
    primary: '#10b981',
    glow: '#34d399',
    border: '#059669',
    text: '#6ee7b7',
  },

  // LOCAL: Projects - S1s with members (orange)
  localProject: {
    primary: '#ea580c',
    glow: '#f97316',
    border: '#c2410c',
    text: '#fb923c',
  },

  // LOCAL: S1s without members (bright yellow)
  localS1: {
    primary: '#facc15',
    glow: '#fde047',
    border: '#eab308',
    text: '#fef08a',
  },

  // NETWORK: MetasystemDAO S5 (violet)
  networkS5: {
    primary: '#8b5cf6',
    glow: '#a78bfa',
    border: '#7c3aed',
    text: '#c4b5fd',
  },

  // NETWORK: Projects - S1s with members (indigo)
  networkProject: {
    primary: '#6366f1',
    glow: '#818cf8',
    border: '#4f46e5',
    text: '#a5b4fc',
  },

  // NETWORK: S1s without members (cyan)
  networkS1: {
    primary: '#06b6d4',
    glow: '#22d3ee',
    border: '#0891b2',
    text: '#67e8f9',
  },

  // Algedonic (red)
  algedonic: {
    primary: '#ef4444',
    glow: '#f87171',
    border: '#dc2626',
    text: '#fca5a5',
  },

  // Legacy aliases for backward compatibility
  s5: {
    primary: '#10b981',
    glow: '#34d399',
    border: '#059669',
    text: '#6ee7b7',
  },

  member: {
    primary: '#f97316',
    glow: '#fb923c',
    border: '#ea580c',
    text: '#fdba74',
  },

  project: {
    primary: '#f59e0b',
    glow: '#fbbf24',
    border: '#d97706',
    text: '#fcd34d',
  },

  dao: {
    primary: '#8b5cf6',
    glow: '#a78bfa',
    border: '#7c3aed',
    text: '#c4b5fd',
  },

  // Status
  status: {
    healthy: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
    inactive: '#6b7280',
    executing: '#06b6d4',
  },

  // Text
  text: {
    primary: '#f3f4f6',
    secondary: '#9ca3af',
    muted: '#6b7280',
  },

  // Borders
  border: {
    subtle: '#1f2937',
    default: '#374151',
    glow: '#4b5563',
  },
} as const;

// =============================================================================
// Node Box Styling
// =============================================================================

export const NODE_BOX = {
  // Base dimensions
  width: 120,
  height: 80,

  // Border
  borderWidth: 1,
  borderRadius: 4,

  // Glow effect
  glowBlur: 20,
  glowSpread: 0,

  // Animation
  hoverScale: 1.05,
  selectScale: 1.1,
} as const;

// =============================================================================
// Layout
// =============================================================================

export const LAYOUT = {
  // Topology
  centerOffset: { x: 0, y: 0 },
  s1Radius: 200, // Distance of S1 nodes from center
  nodeGap: 20,

  // Zoom
  localZoom: 1,
  networkZoom: 0.5,
  zoomTransition: '0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',

  // FocusPanel
  panelHeight: '85%',

  // Animation
  transitionDuration: '0.4s',
  transitionEasing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
} as const;

// =============================================================================
// Typography
// =============================================================================

export const TYPOGRAPHY = {
  fontSans: "'Inter', system-ui, sans-serif",
  fontMono: "'JetBrains Mono', monospace",

  // Sizes
  xs: '0.75rem',
  sm: '0.875rem',
  base: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
} as const;

// =============================================================================
// Helpers
// =============================================================================

export function getNodeColors(role: NodeRole) {
  switch (role) {
    case 'local-root':
      return COLORS.localRoot;
    case 'local-project':
      return COLORS.localProject;
    case 'local-s1':
      return COLORS.localS1;
    case 'network-s5':
      return COLORS.networkS5;
    case 'network-project':
      return COLORS.networkProject;
    case 'network-s1':
      return COLORS.networkS1;
    case 'algedonic':
      return COLORS.algedonic;
    default:
      return COLORS.localS1;
  }
}

/**
 * Determine node role based on context
 */
export function determineNodeRole(
  isRoot: boolean,
  hasMembers: boolean,
  level: RecursionLevel,
  hasAlgedonic: boolean = false
): NodeRole {
  if (hasAlgedonic) return 'algedonic';

  if (level === 'local') {
    if (isRoot) return 'local-root';
    if (hasMembers) return 'local-project';
    return 'local-s1';
  } else {
    if (isRoot) return 'network-s5';
    if (hasMembers) return 'network-project';
    return 'network-s1';
  }
}

export function getNodeGlow(role: NodeRole): string {
  const colors = getNodeColors(role);
  return `0 0 ${NODE_BOX.glowBlur}px ${colors.glow}40`;
}

export function getNodeBorder(role: NodeRole, selected: boolean = false): string {
  const colors = getNodeColors(role);
  return selected ? colors.glow : colors.border;
}

// Legacy helper for backward compatibility
export function getLegacyNodeColors(role: 's5' | 'member' | 'dao') {
  switch (role) {
    case 's5':
      return COLORS.s5;
    case 'member':
      return COLORS.member;
    case 'dao':
      return COLORS.dao;
    default:
      return COLORS.member;
  }
}
