/**
 * GovernancePanel — Shows tunable governance parameters and voting state
 *
 * Displays:
 * - System constants (dynamics, governance, audit, housekeeping)
 * - Current voting power breakdown
 * - Active proposals (placeholder for simulation mode)
 */

import { useState, useEffect } from 'react';
import { COLORS } from '../design-system';
import {
  fetchSystemConstants,
  fetchVotingPower,
  fetchProposals,
  fetchFreeEnergyAggregate,
  type SystemConstants,
  type VotingPower,
  type Proposal,
  type FreeEnergyAggregateState,
} from '../api/client';

interface GovernancePanelProps {
  nodeId: string;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  return `${Math.round(ms / 86_400_000)}d`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function ConstantRow({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <div className="flex items-center gap-2">
        <span style={{ color: COLORS.text.secondary }}>{label}</span>
        {hint && (
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: COLORS.bg.elevated, color: COLORS.text.muted }}
          >
            {hint}
          </span>
        )}
      </div>
      <span className="font-mono" style={{ color: COLORS.text.primary }}>
        {value}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div
        className="text-xs uppercase tracking-wide mb-3 pb-2"
        style={{ color: COLORS.text.muted, borderBottom: `1px solid ${COLORS.border.subtle}` }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function isEthereumAddress(s: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}

export function GovernancePanel({ nodeId }: GovernancePanelProps) {
  const [constants, setConstants] = useState<SystemConstants | null>(null);
  const [votingPower, setVotingPower] = useState<VotingPower | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [freeEnergy, setFreeEnergy] = useState<FreeEnergyAggregateState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [c, vp, p] = await Promise.all([
        fetchSystemConstants(),
        fetchVotingPower(nodeId),
        fetchProposals(),
      ]);
      setConstants(c);
      setVotingPower(vp);
      setProposals(p);

      // Fetch F based on scope type
      const isDAO = isEthereumAddress(nodeId);
      const fe = isDAO
        ? await fetchFreeEnergyAggregate('dao', undefined, nodeId)
        : await fetchFreeEnergyAggregate('context', nodeId);
      setFreeEnergy(fe);

      setLoading(false);
    }
    load();
  }, [nodeId]);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center" style={{ color: COLORS.text.muted }}>
        Loading governance data...
      </div>
    );
  }

  if (!constants) {
    return (
      <div className="p-6" style={{ color: COLORS.text.muted }}>
        Failed to load system constants
      </div>
    );
  }

  const openProposals = proposals.filter(p => p.status === 'open');

  return (
    <div className="p-6 overflow-auto" style={{ maxHeight: '100%' }}>
      {/* Aggregate Free Energy */}
      {freeEnergy && (
        <Section title="Free Energy (F)">
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
              <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Local</div>
              <div className="text-xl font-mono" style={{
                color: freeEnergy.F_local > 0 ? COLORS.status.warning : COLORS.status.healthy
              }}>
                {freeEnergy.F_local}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
              <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Children ({freeEnergy.childCount})</div>
              <div className="text-xl font-mono" style={{
                color: freeEnergy.F_children > 0 ? COLORS.status.warning : COLORS.status.healthy
              }}>
                {freeEnergy.F_children}
              </div>
            </div>
            <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
              <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Total</div>
              <div className="text-xl font-mono" style={{
                color: freeEnergy.F_total > 0 ? COLORS.status.warning : COLORS.status.healthy
              }}>
                {freeEnergy.F_total}
              </div>
            </div>
          </div>
          <div className="text-xs" style={{ color: COLORS.text.muted }}>
            F = perceived - resolved. Positive F means unresolved variety (work to do).
            Children's F propagates up — a DAO's F is the sum of all contexts' F.
          </div>
        </Section>
      )}

      {/* Voting Power */}
      {votingPower && (
        <Section title="Your Voting Power">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div
              className="p-3 rounded"
              style={{ background: COLORS.bg.elevated }}
            >
              <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Contribution</div>
              <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                {votingPower.contribution.toFixed(0)}
              </div>
            </div>
            <div
              className="p-3 rounded"
              style={{ background: COLORS.bg.elevated }}
            >
              <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Precision (τ)</div>
              <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                {votingPower.τ.toFixed(3)}
              </div>
            </div>
          </div>
          <div
            className="p-3 rounded text-sm"
            style={{ background: `${COLORS.s5.primary}10`, border: `1px solid ${COLORS.s5.border}` }}
          >
            <div className="font-mono mb-1" style={{ color: COLORS.s5.text }}>
              β = {votingPower.β.toFixed(3)}
            </div>
            <div style={{ color: COLORS.text.muted }}>
              Inverse temperature: controls vote conviction based on expected free energy
            </div>
          </div>
        </Section>
      )}

      {/* Vote Formula */}
      <Section title="Vote Formula">
        <div
          className="p-4 rounded font-mono text-sm mb-3"
          style={{ background: COLORS.bg.elevated }}
        >
          <div style={{ color: COLORS.text.primary }}>{constants.governance.voteFormula.description}</div>
        </div>
        <ConstantRow label="γ (epistemic weight)" value={constants.governance.voteFormula.γ} hint="in G = F + γH" />
      </Section>

      {/* Threshold Formula */}
      <Section title="Approval Threshold">
        <div
          className="p-4 rounded font-mono text-sm mb-3"
          style={{ background: COLORS.bg.elevated, color: COLORS.text.secondary }}
        >
          threshold = base + scale × (requested / total)
        </div>
        <ConstantRow label="Base threshold" value={formatPercent(constants.governance.thresholdFormula.baseThreshold)} />
        <ConstantRow label="Scale factor" value={constants.governance.thresholdFormula.scaleFactor} />
        <ConstantRow label="Max threshold" value={formatPercent(constants.governance.thresholdFormula.maxThreshold)} />
        <ConstantRow label="Default quorum" value={formatPercent(constants.governance.defaultQuorum)} />
      </Section>

      {/* Voting Periods */}
      <Section title="Voting Periods">
        {Object.entries(constants.governance.votingPeriods).map(([level, ms]) => (
          <ConstantRow key={level} label={level} value={formatDuration(ms)} />
        ))}
      </Section>

      {/* Dynamics Parameters */}
      <Section title="Dynamics (Free Energy)">
        <ConstantRow label="β_base" value={constants.dynamics.β_base} hint="inverse temperature" />
        <ConstantRow label="γ" value={constants.dynamics.γ} hint="exploration weight" />
        <ConstantRow label="Invocation threshold" value={constants.dynamics.invocationThreshold} hint="F above triggers work" />
        <ConstantRow label="Perception threshold" value={constants.dynamics.perceptionThreshold} hint="F below triggers scan" />
        <ConstantRow label="τ change threshold" value={constants.dynamics.τChangeThreshold} />
        <ConstantRow label="Learning samples" value={constants.dynamics.learningThreshold} hint="for full τ confidence" />
      </Section>

      {/* Audit Rates */}
      <Section title="S3* Audit (Sporadic)">
        <ConstantRow label="Node self-audit rate" value={formatPercent(constants.audit.nodeRate)} />
        <ConstantRow label="Context audit rate" value={formatPercent(constants.audit.contextRate)} />
        <ConstantRow label="DAO audit rate" value={formatPercent(constants.audit.daoRate)} />
        <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}>
          <ConstantRow label="Node lookback" value={`${constants.audit.lookbackDays.node}d`} />
          <ConstantRow label="Context lookback" value={`${constants.audit.lookbackDays.context}d`} />
          <ConstantRow label="DAO lookback" value={`${constants.audit.lookbackDays.dao}d`} />
        </div>
      </Section>

      {/* Housekeeping */}
      <Section title="S2 Housekeeping">
        <ConstantRow label="Starvation threshold" value={formatDuration(constants.housekeeping.starvationThresholdMs)} hint="unclaimed work" />
        <ConstantRow label="Hoarding threshold" value={formatDuration(constants.housekeeping.hoardingThresholdMs)} hint="held claims" />
        <ConstantRow label="Min interval" value={formatDuration(constants.housekeeping.minIntervalMs)} />
      </Section>

      {/* Active Proposals */}
      <Section title={`Proposals (${openProposals.length} open)`}>
        {openProposals.length === 0 ? (
          <div
            className="p-4 rounded text-center"
            style={{ background: COLORS.bg.elevated, color: COLORS.text.muted }}
          >
            No active proposals
          </div>
        ) : (
          <div className="space-y-2">
            {openProposals.slice(0, 5).map(p => (
              <div
                key={p.id}
                className="p-3 rounded"
                style={{ background: COLORS.bg.elevated }}
              >
                <div className="flex justify-between items-start mb-1">
                  <span style={{ color: COLORS.text.primary }}>{p.target}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded"
                    style={{ background: `${COLORS.status.healthy}20`, color: COLORS.status.healthy }}
                  >
                    {p.type}
                  </span>
                </div>
                <div className="text-xs" style={{ color: COLORS.text.muted }}>
                  {p.resourcesRequested} resources • ends {new Date(p.deadline).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Simulation Mode Notice */}
      <div
        className="p-4 rounded text-center"
        style={{
          background: `${COLORS.border.subtle}20`,
          border: `1px dashed ${COLORS.border.subtle}`,
          color: COLORS.text.muted,
        }}
      >
        Simulation mode coming soon
      </div>
    </div>
  );
}
