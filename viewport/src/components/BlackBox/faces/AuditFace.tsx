/**
 * AUDIT FACE
 *
 * Sporadic audit channel, governance, and closure.
 * Maps to: src/audit/
 * - Accounting (token balance, flows)
 * - Audit trail (verified actions)
 * - Governance (proposals, votes)
 * - Settings (variety engineering tuning)
 */

import { useState, useEffect } from 'react';
import { COLORS } from '../../../design-system';
import {
  fetchIdentity,
  fetchTotalCredits,
  fetchPendingCredits,
  fetchExecutors,
  fetchScopeGovernance,
  fetchProposals,
  updateIdentitySettings,
  type Identity,
  type ExecutorInfo,
  type PendingCredit,
  type GovernanceView,
  type Proposal,
} from '../../../api/client';
import {
  SectionHeader,
  StatBox,
  MiniCard,
  LoadingSpinner,
  ActionButton,
} from './shared';

interface AuditFaceProps {
  scopeId: string;
  active?: boolean;
}

type SettingsTab = 'gates' | 'attenuators' | 'transducers';

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function AuditFace({ scopeId, active }: AuditFaceProps) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [executors, setExecutors] = useState<ExecutorInfo[]>([]);
  const [totalCredits, setTotalCredits] = useState<string>('0');
  const [pendingCredits, setPendingCredits] = useState<PendingCredit[]>([]);
  const [governance, setGovernance] = useState<GovernanceView | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('gates');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;

    Promise.all([
      fetchIdentity(scopeId).catch(() => null),
      fetchExecutors().catch(() => []),
      fetchTotalCredits().catch(() => '0'),
      fetchPendingCredits().catch(() => []),
      fetchScopeGovernance(scopeId).catch(() => null),
      fetchProposals().catch(() => []),
    ])
      .then(([identityData, executorData, credits, pending, governanceData, proposalsData]) => {
        setIdentity(identityData);
        setExecutors(executorData);
        setTotalCredits(credits);
        setPendingCredits(pending.filter((c: PendingCredit) => c.identityId === scopeId));
        setGovernance(governanceData);
        setProposals(proposalsData);
      })
      .finally(() => setLoading(false));
  }, [scopeId, active]);

  const handleSettingsChange = async (updates: Partial<Identity['settings']>) => {
    if (identity) {
      setIdentity({
        ...identity,
        settings: { ...identity.settings, ...updates },
      });
      await updateIdentitySettings(scopeId, updates);
    }
  };

  if (loading) {
    return <LoadingSpinner message="LOADING..." />;
  }

  const pendingAmount = pendingCredits.reduce(
    (sum, c) => sum + Number(BigInt(c.amount) / BigInt(10 ** 18)),
    0
  );

  const typeIcons = {
    action: '◆',
    decision: '◈',
    alert: '⚠',
  };

  const typeColors = {
    action: COLORS.status.healthy,
    decision: COLORS.networkIdentity.primary,
    alert: COLORS.status.warning,
  };

  return (
    <div className="h-full flex flex-col p-3 overflow-hidden">
      {/* Accounting */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader icon="◈" label="ACCOUNTING" color={COLORS.cyber.line} />

        <div className="grid grid-cols-3 gap-2">
          <StatBox
            label="Balance"
            value={Number(BigInt(totalCredits) / BigInt(10 ** 18))}
            color={COLORS.text.primary}
            subtext="LOOP"
          />
          <StatBox
            label="Pending"
            value={`+${pendingAmount}`}
            color={COLORS.status.healthy}
            subtext="LOOP"
          />
          <StatBox
            label="This Week"
            value="-45"
            color={COLORS.status.warning}
            subtext="LOOP"
          />
        </div>
      </div>

      {/* Activity Trail (from recent events) */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader
          icon="◎"
          label="RECENT ACTIVITY"
          color={COLORS.networkIdentity.primary}
          right={
            <ActionButton variant="default" size="xs">
              View Full
            </ActionButton>
          }
        />

        <div className="space-y-1">
          {(governance?.recentEvents || []).slice(0, 3).map((event) => {
            const eventType = event.type.includes('audit') ? 'decision'
              : event.type.includes('escalation') || event.type.includes('alarm') ? 'alert'
              : 'action';
            const timeAgo = formatTimeAgo(event.timestamp);
            const summary = event.type.replace(/:/g, ' ').replace(/^./, c => c.toUpperCase());
            return (
              <MiniCard key={event.id}>
                <div className="flex items-start gap-2">
                  <span style={{ color: typeColors[eventType] || COLORS.text.muted, fontSize: '0.75rem' }}>
                    {typeIcons[eventType] || '•'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs truncate" style={{ color: COLORS.text.primary }}>
                      {summary}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px]" style={{ color: COLORS.text.muted }}>
                      <span>{timeAgo}</span>
                    </div>
                  </div>
                </div>
              </MiniCard>
            );
          })}
          {(!governance?.recentEvents || governance.recentEvents.length === 0) && (
            <div className="text-xs text-center py-2" style={{ color: COLORS.text.muted }}>
              No recent activity
            </div>
          )}
        </div>
      </div>

      {/* Governance */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader icon="⚖" label="GOVERNANCE" color={COLORS.dao.primary} />

        <div className="space-y-1">
          {proposals.slice(0, 3).map((proposal) => (
            <MiniCard key={proposal.id}>
              <div className="flex items-center justify-between">
                <span className="text-xs truncate" style={{ color: COLORS.text.primary }}>
                  {proposal.target}
                </span>
                {proposal.status === 'open' ? (
                  <ActionButton variant="primary" size="xs">
                    VOTE
                  </ActionButton>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    background: proposal.status === 'passed' ? `${COLORS.status.healthy}20` : `${COLORS.status.critical}20`,
                    color: proposal.status === 'passed' ? COLORS.status.healthy : COLORS.status.critical
                  }}>
                    {proposal.status.toUpperCase()}
                  </span>
                )}
              </div>
            </MiniCard>
          ))}
          {proposals.length === 0 && (
            <div className="text-xs text-center py-2" style={{ color: COLORS.text.muted }}>
              No active proposals
            </div>
          )}
        </div>
      </div>

      {/* Identity Settings */}
      <div className="flex-1 overflow-auto min-h-0">
        <SectionHeader icon="⚙" label="SETTINGS" color={COLORS.text.muted} />

        {/* Settings tabs */}
        <div className="flex gap-1 mb-3">
          {(['gates', 'attenuators', 'transducers'] as SettingsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setSettingsTab(tab)}
              className="flex-1 py-1 rounded text-[10px] uppercase"
              style={{
                background: settingsTab === tab ? `${COLORS.cyber.line}20` : COLORS.bg.elevated,
                color: settingsTab === tab ? COLORS.cyber.line : COLORS.text.muted,
                border: `1px solid ${settingsTab === tab ? COLORS.cyber.lineSubtle : COLORS.border.subtle}`,
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Settings content */}
        {identity && (
          <div className="space-y-3">
            {settingsTab === 'gates' && (
              <>
                <ToggleSetting
                  label="Autonomous Mode"
                  value={identity.settings?.autonomousMode || false}
                  onChange={(v) => handleSettingsChange({ autonomousMode: v })}
                />
                <ToggleSetting
                  label="Available for Bounties"
                  value={identity.settings?.availableForWork ?? true}
                  onChange={(v) => handleSettingsChange({ availableForWork: v })}
                />
                <SelectSetting
                  label="Security Mode"
                  value={identity.settings?.securityMode || 'advisory'}
                  options={[
                    { value: 'advisory', label: 'Advisory' },
                    { value: 'enforced', label: 'Enforced' },
                    { value: 'signed', label: 'Signed' },
                  ]}
                  onChange={(v) => handleSettingsChange({ securityMode: v as 'advisory' | 'enforced' | 'signed' })}
                />
              </>
            )}

            {settingsTab === 'attenuators' && (
              <>
                <SliderSetting
                  label="Max Attempts"
                  value={identity.settings?.maxAttempts || 3}
                  min={1}
                  max={10}
                  onChange={(v) => handleSettingsChange({ maxAttempts: v })}
                />
                <SliderSetting
                  label="Confidence Threshold"
                  value={Math.round((identity.settings?.confidenceThreshold ?? 0.7) * 100)}
                  min={30}
                  max={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => handleSettingsChange({ confidenceThreshold: v / 100 })}
                />
              </>
            )}

            {settingsTab === 'transducers' && (
              <>
                <SelectSetting
                  label="Executor"
                  value={identity.settings?.executor || 'claude'}
                  options={executors.map((ex) => ({
                    value: ex.name,
                    label: `${ex.name} — ${ex.description}`,
                    disabled: !ex.installed,
                  }))}
                  onChange={(v) => handleSettingsChange({ executor: v })}
                />
                <SliderSetting
                  label="Exploration (γ)"
                  value={Math.round((identity.settings?.γ ?? 0.1) * 100)}
                  min={0}
                  max={50}
                  format={(v) => (v / 100).toFixed(2)}
                  onChange={(v) => handleSettingsChange({ γ: v / 100 })}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Setting Components
// =============================================================================

function ToggleSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className="p-2 rounded flex items-center justify-between"
      style={{ background: COLORS.bg.elevated }}
    >
      <span className="text-xs" style={{ color: COLORS.text.primary }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        className="relative w-8 h-4 rounded-full transition-colors"
        style={{ background: value ? COLORS.status.healthy : COLORS.bg.panel }}
      >
        <div
          className="absolute w-3 h-3 rounded-full bg-white transition-transform"
          style={{ top: 2, left: value ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

function SelectSetting({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="p-2 rounded" style={{ background: COLORS.bg.elevated }}>
      <label className="text-[10px] block mb-1" style={{ color: COLORS.text.muted }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1 rounded text-xs"
        style={{
          background: COLORS.bg.panel,
          border: `1px solid ${COLORS.border.subtle}`,
          color: COLORS.text.primary,
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} disabled={opt.disabled}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SliderSetting({
  label,
  value,
  min,
  max,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="p-2 rounded" style={{ background: COLORS.bg.elevated }}>
      <div className="flex justify-between text-[10px] mb-1">
        <span style={{ color: COLORS.text.muted }}>{label}</span>
        <span style={{ color: COLORS.text.primary }}>{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
        style={{ accentColor: COLORS.cyber.line }}
      />
    </div>
  );
}
