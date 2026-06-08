/**
 * INTELLIGENCE FACE
 *
 * View up the recursion and outward to environment.
 * Maps to: src/intelligence/
 * - Parent connection status
 * - Resource bargain (allocated vs consumed)
 * - Environmental signals (opportunities, threats)
 * - Planning and adaptation
 */

import { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../../../design-system';
import {
  fetchIdentity,
  fetchVarietyBalance,
  fetchScopeBargain,
  requestBargain,
  type Identity,
  type VarietyBalance,
  type BargainState,
} from '../../../api/client';
import {
  SectionHeader,
  StatBox,
  ProgressBar,
  StatusBadge,
  MiniCard,
  LoadingSpinner,
  ActionButton,
} from './shared';

interface IntelligenceFaceProps {
  scopeId: string;
  active?: boolean;
}

interface ResourceBargain {
  allocated: number;
  consumed: number;
  remaining: number;
  unit: string;
}

interface PerformanceMetrics {
  workCompleted: number;
  bitsResolved: number;
  compliance: number;
  slaMet: number;
}

export function IntelligenceFace({ scopeId, active }: IntelligenceFaceProps) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [variety, setVariety] = useState<VarietyBalance | null>(null);
  const [bargainState, setBargainState] = useState<BargainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!active) return;

    Promise.all([
      fetchIdentity(scopeId).catch(() => null),
      fetchVarietyBalance(scopeId).catch(() => null),
      fetchScopeBargain(scopeId).catch(() => null),
    ])
      .then(([identityData, varietyData, bargainData]) => {
        setIdentity(identityData);
        setVariety(varietyData);
        setBargainState(bargainData);
      })
      .finally(() => setLoading(false));
  }, [scopeId, active]);

  const handleRequestMore = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await requestBargain(scopeId, {
        type: 'capacity',
        amount: 50,
        justification: 'Additional capacity needed for current workload',
        urgency: 'normal',
      });
      if (result.ok && result.negotiation) {
        setBargainState((prev) => prev ? {
          ...prev,
          current: result.negotiation!,
          hasActive: true,
        } : null);
      }
    } finally {
      setRequesting(false);
    }
  }, [scopeId]);

  const handleAppealConstraint = useCallback(async () => {
    setRequesting(true);
    try {
      await requestBargain(scopeId, {
        type: 'scope',
        justification: 'Requesting scope expansion to complete assigned work',
        urgency: 'high',
      });
    } finally {
      setRequesting(false);
    }
  }, [scopeId]);

  if (loading) {
    return <LoadingSpinner message="LOADING..." />;
  }

  // Derive parent info from memberships
  const parentMembership = identity?.memberships?.[0];
  const parentName = parentMembership?.hub || 'Root Hub';
  const parentConnected = !!parentMembership || identity?.status === 'active';

  // Resource bargain from API or derive from variety
  const resourceBargain: ResourceBargain = {
    allocated: 100,
    consumed: variety?.resolved || 45,
    remaining: 100 - (variety?.resolved || 45),
    unit: 'tokens',
  };

  // Performance metrics derived from variety
  const performance: PerformanceMetrics = {
    workCompleted: variety?.resolved || 23,
    bitsResolved: (variety?.resolved || 0) * 37,
    compliance: 98,
    slaMet: 100,
  };

  // Constraints from identity settings/scope
  const constraints = [
    { label: 'Scope', value: identity?.scope?.join(', ') || '/src/**' },
    { label: 'Max spend', value: `${resourceBargain.allocated} ${resourceBargain.unit}/day` },
    { label: 'Security', value: identity?.settings?.securityMode || 'Advisory' },
  ];

  return (
    <div className="h-full flex flex-col p-3 overflow-auto">
      {/* Parent Connection */}
      <div
        className="flex-shrink-0 p-3 rounded mb-3 flex items-center justify-between"
        style={{
          background: COLORS.bg.elevated,
          borderLeft: `3px solid ${parentConnected ? COLORS.status.healthy : COLORS.text.muted}`,
        }}
      >
        <div>
          <div className="text-xs uppercase mb-1" style={{ color: COLORS.text.muted }}>
            Parent
          </div>
          <div className="text-sm font-medium" style={{ color: COLORS.text.primary }}>
            {parentName}
          </div>
        </div>
        <StatusBadge status={parentConnected ? 'connected' : 'offline'} />
      </div>

      {/* Resource Bargain */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader icon="◇" label="RESOURCE BARGAIN" color={COLORS.localRoot.primary} />

        <div className="grid grid-cols-3 gap-2 mb-3">
          <StatBox label="Allocated" value={resourceBargain.allocated} color={COLORS.text.primary} />
          <StatBox label="Consumed" value={resourceBargain.consumed} color={COLORS.status.warning} />
          <StatBox label="Remaining" value={resourceBargain.remaining} color={COLORS.status.healthy} />
        </div>

        <div className="mb-2">
          <ProgressBar
            value={resourceBargain.consumed}
            max={resourceBargain.allocated}
            color={resourceBargain.consumed > resourceBargain.allocated * 0.8
              ? COLORS.status.warning
              : COLORS.status.healthy}
            showLabel
          />
        </div>

        <ActionButton
          variant="default"
          size="xs"
          onClick={handleRequestMore}
          disabled={requesting || bargainState?.hasActive}
        >
          {bargainState?.hasActive ? 'Request Pending' : requesting ? 'Requesting...' : 'Request More'}
        </ActionButton>
      </div>

      {/* Performance Metrics */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader icon="△" label="PERFORMANCE" color={COLORS.cyber.line} />

        <div className="grid grid-cols-2 gap-2">
          <StatBox
            label="Work Done"
            value={performance.workCompleted}
            color={COLORS.text.primary}
          />
          <StatBox
            label="Bits Resolved"
            value={performance.bitsResolved}
            color={COLORS.cyber.line}
          />
          <StatBox
            label="Compliance"
            value={`${performance.compliance}%`}
            color={performance.compliance >= 95 ? COLORS.status.healthy : COLORS.status.warning}
          />
          <StatBox
            label="SLA Met"
            value={`${performance.slaMet}%`}
            color={performance.slaMet >= 95 ? COLORS.status.healthy : COLORS.status.warning}
          />
        </div>
      </div>

      {/* Constraints */}
      <div className="flex-1">
        <SectionHeader icon="▽" label="CONSTRAINTS" color={COLORS.text.muted} />

        <div className="space-y-2">
          {constraints.map((constraint, i) => (
            <MiniCard key={i}>
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: COLORS.text.muted }}>
                  {constraint.label}
                </span>
                <span
                  className="text-xs font-mono truncate ml-2"
                  style={{ color: COLORS.text.secondary, maxWidth: '60%' }}
                >
                  {constraint.value}
                </span>
              </div>
            </MiniCard>
          ))}
        </div>

        <div className="mt-3">
          <ActionButton
            variant="default"
            size="xs"
            onClick={handleAppealConstraint}
            disabled={requesting}
          >
            {requesting ? 'Appealing...' : 'Appeal Constraint'}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}
