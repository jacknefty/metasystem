/**
 * OPERATIONS FACE
 *
 * Primary interface for real-time operations.
 * Maps to: src/operations/
 * - Mode bar (archetype quick-switch)
 * - Alerts (algedonic signals)
 * - Energy gauge (F value)
 * - Chat (primary interaction)
 * - Current task status
 */

import { useState, useEffect } from 'react';
import { COLORS } from '../../../design-system';
import { ChatPanel } from '../../ChatPanel';
import {
  fetchIdentity,
  fetchWork,
  fetchVarietyBalance,
  fetchScopeOperations,
  updateIdentitySettings,
  type Identity,
  type Work,
  type VarietyBalance,
} from '../../../api/client';
import {
  SectionHeader,
  EnergyGauge,
  AlertItem,
  StatusBadge,
  ModeSelector,
  LoadingSpinner,
  ProgressBar,
} from './shared';

interface OperationsFaceProps {
  scopeId: string;
  active?: boolean;
  onClose?: () => void;
}

interface AlgedonicSignal {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  time: string;
}

export function OperationsFace({ scopeId, active }: OperationsFaceProps) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [variety, setVariety] = useState<VarietyBalance | null>(null);
  const [currentWork, setCurrentWork] = useState<Work | null>(null);
  const [alerts, setAlerts] = useState<AlgedonicSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showChat, setShowChat] = useState(true);

  useEffect(() => {
    if (!active) return;

    Promise.all([
      fetchIdentity(scopeId).catch(() => null),
      fetchVarietyBalance(scopeId).catch(() => null),
      fetchWork().catch(() => []),
      fetchScopeOperations(scopeId).catch(() => null),
    ])
      .then(([identityData, varietyData, workData, humanData]) => {
        setIdentity(identityData);
        setVariety(varietyData);

        // Find current executing work
        const executing = workData.find(
          (w: Work) => w.executorId === scopeId && w.status === 'executing'
        );
        setCurrentWork(executing || null);

        // Convert attention items from humanView to alerts
        const derivedAlerts: AlgedonicSignal[] = [];
        if (humanData?.attention) {
          for (const item of humanData.attention.slice(0, 3)) {
            derivedAlerts.push({
              id: item.id,
              type: item.type === 'alarm' ? 'critical' : item.type === 'escalation' ? 'warning' : 'info',
              message: item.summary,
              time: 'now',
            });
          }
        }
        // Fallback: derive from variety if no attention items
        if (derivedAlerts.length === 0 && varietyData && varietyData.ratio != null && !varietyData.healthy) {
          derivedAlerts.push({
            id: 'variety-imbalance',
            type: 'warning',
            message: `Variety ratio ${varietyData.ratio.toFixed(2)} — ${varietyData.ratio > 1.5 ? 'over-perceiving' : 'under-perceiving'}`,
            time: 'now',
          });
        }
        setAlerts(derivedAlerts);
      })
      .finally(() => setLoading(false));
  }, [scopeId, active]);

  const handleModeChange = async (mode: string) => {
    const modeParams: Record<string, Partial<Identity['settings']>> = {
      scout: { perceptionThreshold: 0, invocationThreshold: 10, γ: 0.3, β_base: 1.0 },
      worker: { perceptionThreshold: -20, invocationThreshold: 0, γ: 0.05, β_base: 2.0 },
      balanced: { perceptionThreshold: -10, invocationThreshold: 0, γ: 0.1, β_base: 1.0 },
      explorer: { perceptionThreshold: -5, invocationThreshold: 5, γ: 0.4, β_base: 0.5 },
    };

    if (identity && modeParams[mode]) {
      const updates = modeParams[mode];
      setIdentity({
        ...identity,
        settings: { ...identity.settings, ...updates },
      });
      await updateIdentitySettings(scopeId, updates);
    }
  };

  const getCurrentMode = (): string => {
    if (!identity?.settings) return 'balanced';
    const { γ, invocationThreshold } = identity.settings;
    if (γ && γ >= 0.3 && invocationThreshold && invocationThreshold >= 10) return 'scout';
    if (γ && γ <= 0.05 && invocationThreshold !== undefined && invocationThreshold <= 0) return 'worker';
    if (γ && γ >= 0.4) return 'explorer';
    return 'balanced';
  };

  const dismissAlert = (id: string) => {
    setAlerts(alerts.filter((a) => a.id !== id));
  };

  if (loading) {
    return <LoadingSpinner message="CONNECTING..." />;
  }

  // Calculate free energy from variety balance
  const freeEnergy = variety ? Math.round((variety.perceived - variety.resolved) * 0.5) : 0;

  return (
    <div className="h-full flex flex-col p-3 overflow-hidden">
      {/* Mode Bar */}
      <div className="flex-shrink-0 mb-3">
        <ModeSelector current={getCurrentMode()} onChange={handleModeChange} />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
        {/* Left sidebar - Alerts & Energy */}
        <div className="w-32 flex-shrink-0 flex flex-col gap-3">
          {/* Alerts */}
          <div className="flex-shrink-0">
            <SectionHeader icon="⚡" label="ALERTS" color={COLORS.status.warning} />
            {alerts.length > 0 ? (
              <div className="space-y-1">
                {alerts.slice(0, 3).map((alert) => (
                  <AlertItem
                    key={alert.id}
                    type={alert.type}
                    message={alert.message}
                    time={alert.time}
                    onDismiss={() => dismissAlert(alert.id)}
                  />
                ))}
              </div>
            ) : (
              <div
                className="p-2 rounded text-xs text-center"
                style={{ background: COLORS.bg.elevated, color: COLORS.text.muted }}
              >
                No alerts
              </div>
            )}
          </div>

          {/* Energy Gauge */}
          <div className="flex-shrink-0">
            <SectionHeader icon="◈" label="ENERGY" color={COLORS.cyber.line} />
            <EnergyGauge value={freeEnergy} max={30} label="F" />
          </div>

          {/* Variety indicators */}
          {variety && (
            <div className="flex-shrink-0">
              <SectionHeader icon="∿" label="VARIETY" color={COLORS.text.muted} />
              <div className="space-y-2 text-xs">
                <div>
                  <div className="flex justify-between mb-1">
                    <span style={{ color: COLORS.text.muted }}>Perceived</span>
                    <span style={{ color: COLORS.cyber.line }}>{variety.perceived}</span>
                  </div>
                  <ProgressBar value={variety.perceived} max={200} color={COLORS.cyber.line} />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span style={{ color: COLORS.text.muted }}>Resolved</span>
                    <span style={{ color: COLORS.status.healthy }}>{variety.resolved}</span>
                  </div>
                  <ProgressBar value={variety.resolved} max={200} color={COLORS.status.healthy} />
                </div>
                <div
                  className="flex items-center gap-1 mt-1"
                  style={{ color: variety.healthy !== false ? COLORS.status.healthy : COLORS.status.warning }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: 'currentColor' }} />
                  <span>Ratio: {variety.ratio?.toFixed(2) ?? '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {showChat ? (
            <div className="flex-1 overflow-hidden rounded" style={{ border: `1px solid ${COLORS.border.subtle}` }}>
              <ChatPanel
                nodeId={scopeId}
                executor={identity?.settings?.executor || 'claude'}
              />
            </div>
          ) : (
            <div
              className="flex-1 flex items-center justify-center rounded cursor-pointer"
              style={{ background: COLORS.bg.elevated }}
              onClick={() => setShowChat(true)}
            >
              <span style={{ color: COLORS.text.muted }}>Click to open chat</span>
            </div>
          )}
        </div>
      </div>

      {/* Current Task Bar */}
      <div
        className="flex-shrink-0 mt-3 p-2 rounded flex items-center gap-3"
        style={{ background: COLORS.bg.elevated, border: `1px solid ${COLORS.border.subtle}` }}
      >
        {currentWork ? (
          <>
            <span style={{ color: COLORS.status.executing }}>▶</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm truncate" style={{ color: COLORS.text.primary }}>
                  {currentWork.name}
                </span>
                <StatusBadge status="executing" size="xs" />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <ProgressBar
                  value={currentWork.conditions.filter((c) => c.met).length}
                  max={currentWork.conditions.length}
                  color={COLORS.status.executing}
                  height={4}
                />
                <span className="text-[10px]" style={{ color: COLORS.text.muted }}>
                  {currentWork.conditions.filter((c) => c.met).length}/{currentWork.conditions.length}
                </span>
              </div>
            </div>
            <button
              className="px-2 py-1 rounded text-xs"
              style={{ background: `${COLORS.status.warning}20`, color: COLORS.status.warning }}
            >
              Pause
            </button>
          </>
        ) : (
          <>
            <span style={{ color: COLORS.text.muted }}>○</span>
            <span className="text-sm" style={{ color: COLORS.text.muted }}>
              No active task
            </span>
            <div className="flex-1" />
            <button
              className="px-2 py-1 rounded text-xs"
              style={{ background: `${COLORS.cyber.line}20`, color: COLORS.cyber.line }}
            >
              Browse Work
            </button>
          </>
        )}
      </div>
    </div>
  );
}
