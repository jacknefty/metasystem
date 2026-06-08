/**
 * FaceWrapper — Shared Tron-style container for cube faces
 */

import { ReactNode } from 'react';
import { COLORS } from '../../../design-system';

interface FaceWrapperProps {
  icon: string;
  label: string;
  sublabel: string;
  color: string;
  active?: boolean;
  children: ReactNode;
}

export function FaceWrapper({ icon, label, sublabel, color, active, children }: FaceWrapperProps) {
  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 pb-3 mb-3 flex-shrink-0"
        style={{ borderBottom: `1px solid ${color}40` }}
      >
        <div
          className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0"
          style={{
            background: `${color}20`,
            border: `1px solid ${color}50`,
            boxShadow: `0 0 12px ${color}30`,
          }}
        >
          <span style={{ color, fontSize: '1.1rem' }}>{icon}</span>
        </div>
        <div className="min-w-0">
          <div
            className="text-sm uppercase tracking-wider font-medium truncate"
            style={{ color, textShadow: `0 0 8px ${color}` }}
          >
            {label}
          </div>
          <div className="text-xs truncate" style={{ color: COLORS.text.muted }}>
            {sublabel}
          </div>
        </div>
        {active && (
          <div
            className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded text-xs flex-shrink-0"
            style={{
              background: `${color}15`,
              border: `1px solid ${color}30`,
              color,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            />
            LIVE
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {children}
      </div>
    </div>
  );
}
