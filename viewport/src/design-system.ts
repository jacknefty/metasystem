/**
 * Design System — Standardized visual tokens
 *
 * Two recursion levels with distinct color palettes:
 *
 * LOCAL LEVEL (within user's workspace):
 * - Root Identity (e.g., jack): Green
 * - Hubs (Operations with members): Yellow/Gold
 * - Operations (no members): Orange
 * - Algedonic signals: Red
 *
 * NETWORK LEVEL (MetasystemDAO):
 * - MetasystemDAO Identity: Violet
 * - Hubs (Operations with members): Indigo
 * - Operations (no members): Cyan
 *
 * All nodes are futuristic black boxes with colored accents.
 */

// =============================================================================
// Node Types
// =============================================================================

export type NodeRole =
  | 'local-root'        // Root Identity at local level (green)
  | 'local-hub'         // Hub (operations with members) at local level (gold)
  | 'local-operations'  // Operations without members at local level (orange)
  | 'network-identity'  // MetasystemDAO Identity (violet)
  | 'network-hub'       // Hub (operations with members) at network level (indigo)
  | 'network-operations'// Operations without members at network level (cyan)
  | 'algedonic';        // Pain/pleasure signals (red)

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

  // Cyber/Tron accents
  cyber: {
    grid: '#1a2332',          // Subtle grid lines
    gridGlow: '#2a3a4a',      // Active grid
    line: '#00fff2',          // Tron cyan accent
    lineSubtle: '#00fff230',  // Faded accent lines
    pulse: '#00fff280',       // Pulsing glow
    warning: '#ff6b00',       // Orange alert
    danger: '#ff0055',        // Red critical
  },

  // LOCAL: Root Identity (green)
  localRoot: {
    primary: '#10b981',
    glow: '#34d399',
    border: '#059669',
    text: '#6ee7b7',
  },

  // LOCAL: Hubs - Operations with members (orange)
  localHub: {
    primary: '#ea580c',
    glow: '#f97316',
    border: '#c2410c',
    text: '#fb923c',
  },

  // LOCAL: Operations without members (bright yellow)
  localOperations: {
    primary: '#facc15',
    glow: '#fde047',
    border: '#eab308',
    text: '#fef08a',
  },

  // NETWORK: MetasystemDAO Identity (violet)
  networkIdentity: {
    primary: '#8b5cf6',
    glow: '#a78bfa',
    border: '#7c3aed',
    text: '#c4b5fd',
  },

  // NETWORK: Hubs - Operations with members (indigo)
  networkHub: {
    primary: '#6366f1',
    glow: '#818cf8',
    border: '#4f46e5',
    text: '#a5b4fc',
  },

  // NETWORK: Operations without members (cyan)
  networkOperations: {
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

  // Identity color (alias for localRoot for general use)
  identity: {
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
  operationsRadius: 200, // Distance of Operations nodes from center
  nodeGap: 20,

  // Zoom
  localZoom: 1,
  networkZoom: 0.5,
  zoomTransition: '0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94)',

  // FocusPanel
  panelHeight: '85%',

  // Black Box Cube
  cube: {
    base: 600,        // Base cube face size
    expanded: 800,    // Expanded face size
    perspective: 1500, // 3D perspective
  },

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
    case 'local-hub':
      return COLORS.localHub;
    case 'local-operations':
      return COLORS.localOperations;
    case 'network-identity':
      return COLORS.networkIdentity;
    case 'network-hub':
      return COLORS.networkHub;
    case 'network-operations':
      return COLORS.networkOperations;
    case 'algedonic':
      return COLORS.algedonic;
    default:
      return COLORS.localOperations;
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
    if (hasMembers) return 'local-hub';
    return 'local-operations';
  } else {
    if (isRoot) return 'network-identity';
    if (hasMembers) return 'network-hub';
    return 'network-operations';
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
export function getLegacyNodeColors(role: 'identity' | 'member' | 'dao') {
  switch (role) {
    case 'identity':
      return COLORS.identity;
    case 'member':
      return COLORS.member;
    case 'dao':
      return COLORS.dao;
    default:
      return COLORS.member;
  }
}
