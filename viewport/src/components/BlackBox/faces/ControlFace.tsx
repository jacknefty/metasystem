/**
 * CONTROL FACE
 *
 * Managing children, monitoring variety flow.
 * Maps to: src/control/
 * - Variety flow (wave graph - perceived vs resolved)
 * - Children list with status
 * - Dispatch controls
 */

import { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../../../design-system';
import {
  fetchVarietyBalance,
  fetchScopeChildren,
  interveneChild,
  createHub,
  type VarietyBalance,
  type ScopeChildSummary,
} from '../../../api/client';
import {
  SectionHeader,
  StatusBadge,
  ProgressBar,
  MiniCard,
  LoadingSpinner,
  EmptyState,
  ActionButton,
} from './shared';

interface ControlFaceProps {
  scopeId: string;
  active?: boolean;
}

export function ControlFace({ scopeId, active }: ControlFaceProps) {
  const [children, setChildren] = useState<ScopeChildSummary[]>([]);
  const [variety, setVariety] = useState<VarietyBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const loadData = useCallback(async () => {
    const [childrenData, varietyData] = await Promise.all([
      fetchScopeChildren(scopeId).catch(() => []),
      fetchVarietyBalance(scopeId).catch(() => null),
    ]);
    setChildren(childrenData);
    setVariety(varietyData);
  }, [scopeId]);

  useEffect(() => {
    if (!active) return;
    loadData().finally(() => setLoading(false));
  }, [scopeId, active]);

  if (loading) {
    return <LoadingSpinner message="LOADING..." />;
  }

  const stressedCount = children.filter((c) => c.status === 'stressed' || c.status === 'critical').length;
  const totalEnergy = children.reduce((sum, c) => sum + c.F, 0);

  return (
    <div className="h-full flex flex-col p-3 overflow-hidden">
      {/* Variety Flow */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader icon="∿" label="VARIETY FLOW" color={COLORS.cyber.line} />

        <div
          className="p-3 rounded"
          style={{ background: COLORS.bg.elevated, border: `1px solid ${COLORS.border.subtle}` }}
        >
          {/* Perceived (Intelligence) */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: COLORS.text.muted }}>
                Perceived
              </span>
              <span className="text-sm font-mono" style={{ color: COLORS.cyber.line }}>
                {variety?.perceived || 0} bits
              </span>
            </div>
            <ProgressBar
              value={variety?.perceived || 0}
              max={200}
              color={COLORS.cyber.line}
              height={8}
            />
          </div>

          {/* Resolved (Control) */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: COLORS.text.muted }}>
                Resolved
              </span>
              <span className="text-sm font-mono" style={{ color: COLORS.status.healthy }}>
                {variety?.resolved || 0} bits
              </span>
            </div>
            <ProgressBar
              value={variety?.resolved || 0}
              max={200}
              color={COLORS.status.healthy}
              height={8}
            />
          </div>

          {/* Ratio indicator */}
          <div
            className="flex items-center justify-between pt-2"
            style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
          >
            <span className="text-xs" style={{ color: COLORS.text.muted }}>
              Ratio
            </span>
            <div
              className="flex items-center gap-2"
              style={{ color: variety?.healthy ? COLORS.status.healthy : COLORS.status.warning }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: 'currentColor', boxShadow: `0 0 6px currentColor` }}
              />
              <span className="text-sm font-mono">
                {variety?.ratio?.toFixed(2) || '1.00'}
              </span>
              <span className="text-xs">
                {variety?.healthy ? 'Healthy' : variety?.ratio && variety.ratio > 1.5 ? 'Over-perceiving' : 'Under-perceiving'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Children Summary */}
      <div className="flex-shrink-0 flex gap-2 mb-3">
        <div
          className="flex-1 p-2 rounded text-center"
          style={{ background: COLORS.bg.elevated }}
        >
          <div className="text-lg font-mono" style={{ color: COLORS.text.primary }}>
            {children.length}
          </div>
          <div className="text-[10px]" style={{ color: COLORS.text.muted }}>Children</div>
        </div>
        <div
          className="flex-1 p-2 rounded text-center"
          style={{ background: stressedCount > 0 ? `${COLORS.status.warning}10` : `${COLORS.status.healthy}10` }}
        >
          <div className="text-lg font-mono" style={{ color: stressedCount > 0 ? COLORS.status.warning : COLORS.status.healthy }}>
            {stressedCount}
          </div>
          <div className="text-[10px]" style={{ color: COLORS.text.muted }}>Stressed</div>
        </div>
        <div
          className="flex-1 p-2 rounded text-center"
          style={{ background: COLORS.bg.elevated }}
        >
          <div className="text-lg font-mono" style={{ color: COLORS.cyber.line }}>
            {totalEnergy}
          </div>
          <div className="text-[10px]" style={{ color: COLORS.text.muted }}>Total F</div>
        </div>
      </div>

      {/* Children List */}
      <div className="flex-1 overflow-auto min-h-0">
        <SectionHeader icon="▽" label="CHILDREN" color={COLORS.networkOperations.primary} />

        {children.length > 0 ? (
          <div className="space-y-2">
            {children.map((child) => {
              const statusColor = child.status === 'critical'
                ? COLORS.status.critical
                : child.status === 'stressed'
                ? COLORS.status.warning
                : COLORS.status.healthy;
              return (
                <MiniCard key={child.id}>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{
                        background: statusColor,
                        boxShadow: child.status !== 'healthy' ? `0 0 6px ${statusColor}` : 'none',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate" style={{ color: COLORS.text.primary }}>
                          {child.name}
                        </span>
                        <StatusBadge status={child.status === 'healthy' ? 'active' : child.status === 'stressed' ? 'executing' : 'offline'} size="xs" />
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[10px]" style={{ color: COLORS.text.muted }}>
                          F = {child.F}
                        </span>
                        <span className="text-[10px]" style={{ color: COLORS.text.muted }}>
                          {child.type}
                        </span>
                      </div>
                    </div>
                  </div>
                </MiniCard>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="▽" message="No child operations" />
        )}
      </div>

      {/* Dispatch Controls */}
      <div
        className="flex-shrink-0 mt-3 pt-3 flex gap-2"
        style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
      >
        <ActionButton
          variant="primary"
          size="sm"
          disabled={acting}
          onClick={async () => {
            const name = prompt('Child name:');
            if (!name) return;
            const purpose = prompt('Child purpose:');
            if (!purpose) return;
            setActing(true);
            try {
              await createHub({ name, purpose, parentId: scopeId });
              await loadData();
            } finally {
              setActing(false);
            }
          }}
        >
          + New Child
        </ActionButton>
        <ActionButton
          variant="default"
          size="sm"
          disabled={acting}
        >
          Rebalance
        </ActionButton>
        <ActionButton
          variant="danger"
          size="sm"
          disabled={acting || children.length === 0}
          onClick={async () => {
            setActing(true);
            try {
              for (const child of children) {
                await interveneChild(scopeId, child.id, 'halt', 'Manual halt all');
              }
              await loadData();
            } finally {
              setActing(false);
            }
          }}
        >
          {acting ? 'Halting...' : 'Halt All'}
        </ActionButton>
      </div>
    </div>
  );
}
