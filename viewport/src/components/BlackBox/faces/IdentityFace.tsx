/**
 * IDENTITY FACE
 *
 * Who I am and what I consume from the network.
 * Maps to: src/identity/
 * - Work assigned to me (bounties/contracts)
 * - Dependencies (external resources I consume)
 * - Pending credits (earned not claimed)
 * - Policy and self-definition
 */

import { useState, useEffect } from 'react';
import { COLORS } from '../../../design-system';
import {
  fetchWork,
  fetchPendingCredits,
  fetchScopeDependencies,
  type Work,
  type PendingCredit,
  type Dependency as ApiDependency,
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

interface IdentityFaceProps {
  scopeId: string;
  active?: boolean;
}

interface DisplayDependency {
  id: string;
  name: string;
  provider: string;
  status: 'connected' | 'pending' | 'error';
  lastUpdate: string;
}

function formatTimeAgo(timestamp?: number): string {
  if (!timestamp) return 'unknown';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${hours}h ago`;
}

export function IdentityFace({ scopeId, active }: IdentityFaceProps) {
  const [assignedWork, setAssignedWork] = useState<Work[]>([]);
  const [dependencies, setDependencies] = useState<DisplayDependency[]>([]);
  const [pendingCredits, setPendingCredits] = useState<PendingCredit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!active) return;

    Promise.all([
      fetchWork().catch(() => []),
      fetchPendingCredits().catch(() => []),
      fetchScopeDependencies(scopeId).catch(() => []),
    ])
      .then(([workData, creditsData, depsData]) => {
        // Filter work assigned to this scope
        const assigned = workData.filter((w: Work) => w.executorId === scopeId);
        setAssignedWork(assigned);

        // Filter credits for this scope
        const myCredits = creditsData.filter((c: PendingCredit) => c.identityId === scopeId);
        setPendingCredits(myCredits);

        // Transform dependencies
        const displayDeps: DisplayDependency[] = (depsData as ApiDependency[]).map((dep) => ({
          id: dep.id,
          name: dep.capability,
          provider: dep.providerId,
          status: dep.status,
          lastUpdate: formatTimeAgo(dep.connectedAt),
        }));
        setDependencies(displayDeps);
      })
      .finally(() => setLoading(false));
  }, [scopeId, active]);

  if (loading) {
    return <LoadingSpinner message="LOADING..." />;
  }

  // Calculate total pending credits
  const totalPending = pendingCredits.reduce(
    (sum, c) => sum + Number(BigInt(c.amount) / BigInt(10 ** 18)),
    0
  );

  const statusColors = {
    connected: COLORS.status.healthy,
    pending: COLORS.status.warning,
    error: COLORS.status.critical,
  };

  return (
    <div className="h-full flex flex-col p-3 overflow-hidden">
      {/* Work Assigned */}
      <div className="flex-1 overflow-auto min-h-0 mb-4">
        <SectionHeader icon="▶" label="WORK ASSIGNED" color={COLORS.status.executing} />

        {assignedWork.length > 0 ? (
          <div className="space-y-2">
            {assignedWork.map((work) => {
              const completedConditions = work.conditions.filter((c) => c.met).length;
              const totalConditions = work.conditions.length;
              const progress = totalConditions > 0 ? (completedConditions / totalConditions) * 100 : 0;

              return (
                <MiniCard key={work.id} highlight={work.status === 'executing'}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm truncate" style={{ color: COLORS.text.primary }}>
                      {work.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <TokenAmount amount={work.gap || 0} size="sm" color={COLORS.cyber.line} />
                      <StatusBadge
                        status={work.status === 'executing' ? 'executing' : work.status === 'active' ? 'active' : 'idle'}
                        size="xs"
                      />
                    </div>
                  </div>

                  {/* Conditions progress */}
                  <div className="space-y-1">
                    {work.conditions.slice(0, 3).map((cond) => (
                      <div key={cond.id} className="flex items-center gap-2 text-[10px]">
                        <span style={{ color: cond.met ? COLORS.status.healthy : COLORS.text.muted }}>
                          {cond.met ? '✓' : '○'}
                        </span>
                        <span
                          className="truncate"
                          style={{ color: cond.met ? COLORS.text.secondary : COLORS.text.muted }}
                        >
                          {cond.description}
                        </span>
                      </div>
                    ))}
                    {work.conditions.length > 3 && (
                      <div className="text-[10px]" style={{ color: COLORS.text.muted }}>
                        +{work.conditions.length - 3} more
                      </div>
                    )}
                  </div>

                  <div className="mt-2">
                    <ProgressBar
                      value={progress}
                      max={100}
                      color={COLORS.status.executing}
                      height={4}
                      showLabel
                    />
                  </div>
                </MiniCard>
              );
            })}
          </div>
        ) : (
          <EmptyState icon="▶" message="No work assigned" />
        )}
      </div>

      {/* Dependencies */}
      <div className="flex-shrink-0 mb-4">
        <SectionHeader icon="◁" label="DEPENDENCIES" color={COLORS.localHub.primary} />

        <div className="space-y-1">
          {dependencies.map((dep) => (
            <MiniCard key={dep.id}>
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: statusColors[dep.status],
                        boxShadow: dep.status === 'connected' ? `0 0 4px ${statusColors[dep.status]}` : 'none',
                      }}
                    />
                    <span className="text-sm truncate" style={{ color: COLORS.text.primary }}>
                      {dep.name}
                    </span>
                  </div>
                  <div className="text-[10px] ml-4" style={{ color: COLORS.text.muted }}>
                    from {dep.provider} · {dep.lastUpdate}
                  </div>
                </div>
                <StatusBadge status={dep.status} size="xs" />
              </div>
            </MiniCard>
          ))}
        </div>
      </div>

      {/* Pending Credits */}
      <div
        className="flex-shrink-0 p-3 rounded"
        style={{
          background: `${COLORS.cyber.line}10`,
          border: `1px solid ${COLORS.cyber.lineSubtle}`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <SectionHeader icon="◈" label="PENDING CREDITS" color={COLORS.cyber.line} />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <TokenAmount amount={totalPending} size="lg" color={COLORS.cyber.line} />
            <div className="text-[10px] mt-1" style={{ color: COLORS.text.muted }}>
              across {pendingCredits.length} contracts
            </div>
          </div>
          <div className="flex gap-2">
            <ActionButton variant="primary" size="sm">
              Claim All
            </ActionButton>
          </div>
        </div>

        {pendingCredits.length > 0 && (
          <div className="mt-3 pt-2 space-y-1" style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}>
            {pendingCredits.slice(0, 2).map((credit) => (
              <div key={credit.id} className="flex justify-between text-[10px]">
                <span className="truncate" style={{ color: COLORS.text.muted, maxWidth: '60%' }}>
                  {credit.contractId}
                </span>
                <span style={{ color: COLORS.cyber.line }}>
                  {Number(BigInt(credit.amount) / BigInt(10 ** 18))} LOOP
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex-shrink-0 mt-3 flex gap-2">
        <ActionButton variant="default" size="sm" fullWidth>
          Browse Bounties
        </ActionButton>
        <ActionButton variant="default" size="sm" fullWidth>
          Request Resource
        </ActionButton>
      </div>
    </div>
  );
}
