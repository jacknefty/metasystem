/**
 * COORDINATION FACE
 *
 * Lateral coordination with peers and network.
 * Maps to: src/coordination/
 * - Capabilities (skills/services I offer)
 * - Bounties created (work I'm offering)
 * - Coordination signals (dampening oscillation)
 */

import { useState, useEffect } from 'react';
import { COLORS } from '../../../design-system';
import {
  fetchScopeCapabilities,
  fetchWork,
  fetchWorkerReputation,
  type Capability as ApiCapability,
  type Work,
} from '../../../api/client';
import {
  SectionHeader,
  StatusBadge,
  ProgressBar,
  MiniCard,
  LoadingSpinner,
  EmptyState,
  ActionButton,
  TokenAmount,
} from './shared';

interface CoordinationFaceProps {
  scopeId: string;
  active?: boolean;
}

interface DisplayCapability {
  id: string;
  name: string;
  type: 'service' | 'data' | 'resource';
  availability: number;
  status: 'available' | 'busy' | 'offline';
}

interface BountyOffered {
  id: string;
  name: string;
  reward: number;
  status: 'open' | 'claimed' | 'completed';
  claimedBy?: string;
}

interface MarketingSignals {
  reputation: number;
  maxReputation: number;
  availability: number;
  responseTime: string;
  completionRate: number;
}

export function CoordinationFace({ scopeId, active }: CoordinationFaceProps) {
  const [capabilities, setCapabilities] = useState<DisplayCapability[]>([]);
  const [bounties, setBounties] = useState<BountyOffered[]>([]);
  const [marketing, setMarketing] = useState<MarketingSignals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;

    Promise.all([
      fetchScopeCapabilities(scopeId).catch(() => []),
      fetchWork().catch(() => []),
      fetchWorkerReputation(scopeId).catch(() => null),
    ])
      .then(([capsData, workData, repData]) => {
        // Transform API capabilities to display format
        const displayCaps: DisplayCapability[] = (capsData as ApiCapability[]).map((cap) => ({
          id: cap.id,
          name: cap.name,
          type: cap.type,
          availability: cap.availability,
          status: cap.availability > 50 ? 'available' : cap.availability > 0 ? 'busy' : 'offline',
        }));
        setCapabilities(displayCaps);

        // Filter bounties created by this scope
        const myBounties: BountyOffered[] = (workData as Work[])
          .filter((w) => w.ownerId === scopeId)
          .map((w) => ({
            id: w.id,
            name: w.name,
            reward: w.gap || 0,
            status: w.status === 'posted' ? 'open' : w.executorId ? 'claimed' : 'open',
            claimedBy: w.executorId,
          }));
        setBounties(myBounties);

        // Set marketing signals from reputation
        if (repData) {
          setMarketing({
            reputation: Math.min(5, repData.completionRate * 5),
            maxReputation: 5,
            availability: displayCaps.length > 0
              ? displayCaps.reduce((sum, c) => sum + c.availability, 0) / displayCaps.length
              : 0,
            responseTime: '~2 min',
            completionRate: Math.round(repData.completionRate * 100),
          });
        }
      })
      .finally(() => setLoading(false));
  }, [scopeId, active]);

  if (loading) {
    return <LoadingSpinner message="LOADING..." />;
  }

  const typeIcons = {
    service: '⚡',
    data: '◈',
    resource: '◇',
  };

  const avgAvailability = capabilities.length > 0
    ? Math.round(capabilities.reduce((sum, c) => sum + c.availability, 0) / capabilities.length)
    : 0;

  return (
    <div className="h-full flex flex-col p-3 overflow-hidden">
      {/* Capabilities */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader
          icon="⚡"
          label="CAPABILITIES"
          color={COLORS.localHub.primary}
          right={
            <span className="text-[10px]" style={{ color: COLORS.text.muted }}>
              {avgAvailability}% available
            </span>
          }
        />

        <div className="space-y-2">
          {capabilities.map((cap) => (
            <MiniCard key={cap.id}>
              <div className="flex items-center gap-2">
                <span style={{ color: COLORS.localHub.primary }}>{typeIcons[cap.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm truncate" style={{ color: COLORS.text.primary }}>
                      {cap.name}
                    </span>
                    <StatusBadge
                      status={cap.status === 'available' ? 'active' : cap.status === 'busy' ? 'executing' : 'offline'}
                      size="xs"
                    />
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: COLORS.text.muted }}>
                    {cap.type} · {cap.availability}% available
                  </div>
                </div>
              </div>
            </MiniCard>
          ))}
        </div>

        <div className="mt-2">
          <ActionButton variant="default" size="xs">
            + Add Capability
          </ActionButton>
        </div>
      </div>

      {/* Bounties Offered */}
      <div className="flex-1 overflow-auto min-h-0 mb-4">
        <SectionHeader icon="◆" label="BOUNTIES OFFERED" color={COLORS.status.warning} />

        {bounties.length > 0 ? (
          <div className="space-y-2">
            {bounties.map((bounty) => (
              <MiniCard key={bounty.id} highlight={bounty.status === 'open'}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate" style={{ color: COLORS.text.primary }}>
                      {bounty.name}
                    </div>
                    {bounty.claimedBy && (
                      <div className="text-[10px] mt-0.5" style={{ color: COLORS.text.muted }}>
                        Claimed by {bounty.claimedBy}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <TokenAmount amount={bounty.reward} size="sm" color={COLORS.status.warning} />
                    <StatusBadge
                      status={bounty.status === 'open' ? 'active' : bounty.status === 'claimed' ? 'executing' : 'idle'}
                      size="xs"
                    />
                  </div>
                </div>
              </MiniCard>
            ))}
          </div>
        ) : (
          <EmptyState icon="◆" message="No bounties offered" />
        )}

        <div className="mt-2">
          <ActionButton variant="primary" size="xs">
            + Create Bounty
          </ActionButton>
        </div>
      </div>

      {/* Marketing Signals */}
      {marketing && (
        <div className="flex-shrink-0">
          <SectionHeader icon="📊" label="MARKETING" color={COLORS.text.muted} />

          <div
            className="p-3 rounded space-y-3"
            style={{ background: COLORS.bg.elevated }}
          >
            {/* Reputation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.text.muted }}>Reputation</span>
                <span className="text-sm font-mono" style={{ color: COLORS.status.healthy }}>
                  {marketing.reputation.toFixed(1)}★
                </span>
              </div>
              <ProgressBar
                value={marketing.reputation}
                max={marketing.maxReputation}
                color={COLORS.status.healthy}
                height={6}
              />
            </div>

            {/* Availability */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs" style={{ color: COLORS.text.muted }}>Availability</span>
                <span className="text-sm font-mono" style={{ color: COLORS.cyber.line }}>
                  {marketing.availability}%
                </span>
              </div>
              <ProgressBar
                value={marketing.availability}
                max={100}
                color={COLORS.cyber.line}
                height={6}
              />
            </div>

            {/* Stats row */}
            <div className="flex justify-between text-xs pt-2" style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}>
              <div>
                <span style={{ color: COLORS.text.muted }}>Response: </span>
                <span style={{ color: COLORS.text.secondary }}>{marketing.responseTime}</span>
              </div>
              <div>
                <span style={{ color: COLORS.text.muted }}>Completion: </span>
                <span style={{ color: COLORS.status.healthy }}>{marketing.completionRate}%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
