/**
 * Shared components for cube faces
 */

import { COLORS } from '../../../design-system';

// =============================================================================
// Section Header
// =============================================================================

export function SectionHeader({
  icon,
  label,
  color = COLORS.text.muted,
  right,
}: {
  icon: string;
  label: string;
  color?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span style={{ color }}>{icon}</span>
      <span className="text-xs uppercase tracking-wider" style={{ color: COLORS.text.muted }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: COLORS.border.subtle }} />
      {right}
    </div>
  );
}

// =============================================================================
// Energy Gauge - Shows free energy (F) value
// =============================================================================

export function EnergyGauge({
  value,
  max = 50,
  label = 'F',
  color = COLORS.cyber.line,
}: {
  value: number;
  max?: number;
  label?: string;
  color?: string;
}) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));
  const isHigh = value > max * 0.6;
  const barColor = isHigh ? COLORS.status.warning : color;

  return (
    <div className="p-2 rounded" style={{ background: COLORS.bg.elevated }}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-mono" style={{ color: COLORS.text.muted }}>{label}</span>
        <span className="text-sm font-mono font-medium" style={{ color: barColor }}>{value}</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: COLORS.bg.panel }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: barColor,
            boxShadow: `0 0 8px ${barColor}`,
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Status Badge
// =============================================================================

export function StatusBadge({
  status,
  size = 'sm'
}: {
  status: 'active' | 'idle' | 'executing' | 'pending' | 'error' | 'connected' | 'offline';
  size?: 'xs' | 'sm';
}) {
  const config = {
    active: { color: COLORS.status.healthy, label: 'ACTIVE' },
    idle: { color: COLORS.text.muted, label: 'IDLE' },
    executing: { color: COLORS.status.executing, label: 'EXEC' },
    pending: { color: COLORS.status.warning, label: 'PEND' },
    error: { color: COLORS.status.critical, label: 'ERR' },
    connected: { color: COLORS.status.healthy, label: 'LIVE' },
    offline: { color: COLORS.text.muted, label: 'OFF' },
  }[status];

  const sizeClass = size === 'xs' ? 'text-[10px] px-1 py-0.5' : 'text-xs px-1.5 py-0.5';

  return (
    <span
      className={`${sizeClass} rounded font-mono uppercase`}
      style={{
        background: `${config.color}20`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}

// =============================================================================
// Token Amount
// =============================================================================

export function TokenAmount({
  amount,
  label = 'LOOP',
  size = 'md',
  color = COLORS.cyber.line,
}: {
  amount: number | string;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  color?: string;
}) {
  const sizeStyles = {
    sm: { amount: 'text-sm', label: 'text-[10px]' },
    md: { amount: 'text-lg', label: 'text-xs' },
    lg: { amount: 'text-2xl', label: 'text-sm' },
  }[size];

  return (
    <div className="flex items-baseline gap-1">
      <span className={`${sizeStyles.amount} font-mono font-medium`} style={{ color }}>
        {amount}
      </span>
      <span className={sizeStyles.label} style={{ color: COLORS.text.muted }}>
        {label}
      </span>
    </div>
  );
}

// =============================================================================
// Alert Item
// =============================================================================

export function AlertItem({
  type,
  message,
  time,
  onDismiss,
}: {
  type: 'critical' | 'warning' | 'info';
  message: string;
  time?: string;
  onDismiss?: () => void;
}) {
  const config = {
    critical: { color: COLORS.status.critical, icon: '🔴' },
    warning: { color: COLORS.status.warning, icon: '🟡' },
    info: { color: COLORS.cyber.line, icon: '🔵' },
  }[type];

  return (
    <div
      className="p-2 rounded text-xs flex items-start gap-2"
      style={{
        background: `${config.color}10`,
        borderLeft: `2px solid ${config.color}`,
      }}
    >
      <span>{config.icon}</span>
      <div className="flex-1 min-w-0">
        <span style={{ color: COLORS.text.primary }}>{message}</span>
        {time && (
          <span style={{ color: COLORS.text.muted }}> · {time}</span>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-xs opacity-50 hover:opacity-100"
          style={{ color: COLORS.text.muted }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

// =============================================================================
// Progress Bar
// =============================================================================

export function ProgressBar({
  value,
  max = 100,
  color = COLORS.cyber.line,
  showLabel = false,
  height = 6,
}: {
  value: number;
  max?: number;
  color?: string;
  showLabel?: boolean;
  height?: number;
}) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 rounded-full overflow-hidden"
        style={{ background: COLORS.bg.panel, height }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-mono" style={{ color: COLORS.text.muted }}>
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Mini Card
// =============================================================================

export function MiniCard({
  children,
  highlight = false,
  onClick,
}: {
  children: React.ReactNode;
  highlight?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`p-2 rounded ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      style={{
        background: highlight ? `${COLORS.cyber.line}10` : COLORS.bg.elevated,
        border: highlight ? `1px solid ${COLORS.cyber.lineSubtle}` : `1px solid ${COLORS.border.subtle}`,
      }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// =============================================================================
// Stat Box
// =============================================================================

export function StatBox({
  label,
  value,
  color = COLORS.text.primary,
  subtext,
}: {
  label: string;
  value: string | number;
  color?: string;
  subtext?: string;
}) {
  return (
    <div className="p-2 rounded text-center" style={{ background: COLORS.bg.elevated }}>
      <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>{label}</div>
      <div className="text-lg font-mono" style={{ color }}>{value}</div>
      {subtext && (
        <div className="text-[10px] mt-0.5" style={{ color: COLORS.text.muted }}>{subtext}</div>
      )}
    </div>
  );
}

// =============================================================================
// Action Button
// =============================================================================

export function ActionButton({
  children,
  onClick,
  variant = 'default',
  size = 'sm',
  fullWidth = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  size?: 'xs' | 'sm';
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  const variants = {
    default: { bg: COLORS.bg.elevated, color: COLORS.text.secondary, border: COLORS.border.subtle },
    primary: { bg: `${COLORS.cyber.line}20`, color: COLORS.cyber.line, border: COLORS.cyber.lineSubtle },
    danger: { bg: `${COLORS.status.critical}15`, color: COLORS.status.critical, border: `${COLORS.status.critical}30` },
  }[variant];

  const sizeClass = size === 'xs' ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${sizeClass} rounded transition-opacity ${fullWidth ? 'w-full' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
      style={{
        background: variants.bg,
        color: variants.color,
        border: `1px solid ${variants.border}`,
      }}
    >
      {children}
    </button>
  );
}

// =============================================================================
// Mode Selector (Archetype quick-switch)
// =============================================================================

export function ModeSelector({
  current,
  onChange,
}: {
  current: string;
  onChange: (mode: string) => void;
}) {
  const modes = [
    { id: 'scout', label: 'Scout', icon: '🔭' },
    { id: 'worker', label: 'Worker', icon: '⚡' },
    { id: 'balanced', label: 'Balanced', icon: '⚖️' },
    { id: 'explorer', label: 'Explorer', icon: '🧭' },
  ];

  return (
    <div className="flex gap-1">
      {modes.map((mode) => (
        <button
          key={mode.id}
          onClick={() => onChange(mode.id)}
          className="flex-1 py-1.5 px-2 rounded text-xs transition-all"
          style={{
            background: current === mode.id ? `${COLORS.cyber.line}20` : COLORS.bg.elevated,
            color: current === mode.id ? COLORS.cyber.line : COLORS.text.muted,
            border: `1px solid ${current === mode.id ? COLORS.cyber.lineSubtle : COLORS.border.subtle}`,
          }}
        >
          <span className="mr-1">{mode.icon}</span>
          {mode.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Loading Spinner
// =============================================================================

export function LoadingSpinner({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: COLORS.cyber.line, borderTopColor: 'transparent' }}
        />
        <span style={{ color: COLORS.text.muted }}>{message}</span>
      </div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

export function EmptyState({
  icon,
  message
}: {
  icon: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-8" style={{ color: COLORS.text.muted }}>
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm">{message}</div>
    </div>
  );
}
