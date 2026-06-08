/**
 * BountyPanel — Shows bounties for a node
 *
 * Every node can be both Identity (to its members) and Operations (to contexts it joined).
 * This panel shows both views when applicable:
 * - Posted bounties (if this node has members or owns work)
 * - Available bounties (from contexts this node is a member of)
 */

import { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../design-system';
import {
  fetchBountyPool,
  fetchWork,
  fetchWorkerReputation,
  fetchWorkerClaims,
  fetchMembers,
  claimBounty,
  releaseBounty,
  type BountyWork,
  type WorkerReputation,
  type Identity,
} from '../api/client';

interface BountyPanelProps {
  nodeId: string;
  isRoot: boolean;
  memberships: Array<{ hub: string; role?: string }>;
}

export function BountyPanel({ nodeId, isRoot, memberships }: BountyPanelProps) {
  const [postedBounties, setPostedBounties] = useState<BountyWork[]>([]);
  const [availableBounties, setAvailableBounties] = useState<BountyWork[]>([]);
  const [myClaims, setMyClaims] = useState<BountyWork[]>([]);
  const [reputation, setReputation] = useState<WorkerReputation | null>(null);
  const [members, setMembers] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pool, projectWork, memberList, claims, rep] = await Promise.all([
        fetchBountyPool(),
        fetchWork(nodeId),
        fetchMembers(nodeId),
        fetchWorkerClaims(nodeId),
        fetchWorkerReputation(nodeId),
      ]);

      setMembers(memberList);
      setMyClaims(claims);
      setReputation(rep);

      // Posted bounties: ALL work for this project (not just available pool)
      // This includes claimed, submitted, completed work
      const posted = projectWork.filter(w =>
        (w as BountyWork).bounty || (w as BountyWork).bountyStatus
      ) as BountyWork[];
      setPostedBounties(posted);

      // Available bounties: work from contexts we're members of (excluding our own)
      const memberContexts = memberships.map(m => m.hub);
      const available = pool.filter(b =>
        memberContexts.includes(b.hubId) &&
        b.hubId !== nodeId &&
        b.bountyStatus === 'posted' &&
        !b.claim
      );
      setAvailableBounties(available);

    } catch (err) {
      console.error('Failed to load bounty data:', err);
    } finally {
      setLoading(false);
    }
  }, [nodeId, memberships]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleClaim = async (workId: string) => {
    setActionLoading(workId);
    try {
      const result = await claimBounty(workId, nodeId);
      if (result.success) {
        await loadData();
      } else {
        alert(result.error || 'Failed to claim bounty');
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = async (workId: string) => {
    setActionLoading(workId);
    try {
      await releaseBounty(workId, 'quit');
      await loadData();
    } finally {
      setActionLoading(null);
    }
  };

  const getBountyStatusColor = (status?: string) => {
    switch (status) {
      case 'posted': return COLORS.status.healthy;
      case 'claimed': return COLORS.status.warning;
      case 'submitted': return COLORS.localHub.primary;
      case 'verified': return COLORS.localRoot.primary;
      case 'completed': return COLORS.status.healthy;
      case 'failed': return COLORS.status.critical;
      default: return COLORS.text.muted;
    }
  };

  if (loading) {
    return (
      <div className="p-4" style={{ color: COLORS.text.muted }}>
        Loading bounties...
      </div>
    );
  }

  const hasMembers = members.length > 0;
  const hasPostedBounties = postedBounties.length > 0;
  const showIdentityView = hasMembers || hasPostedBounties || isRoot;

  return (
    <div className="space-y-6">
      {/* Identity View: Posted bounties (if this node has members or posted work) */}
      {showIdentityView && (
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORS.localRoot.text }}>
            Posted Bounties ({postedBounties.length})
          </div>

          {/* Stats */}
          {postedBounties.length > 0 && (
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="p-2 rounded text-center" style={{ background: COLORS.bg.elevated }}>
                <div className="text-lg font-mono" style={{ color: COLORS.status.healthy }}>
                  {postedBounties.filter(b => b.bountyStatus === 'posted').length}
                </div>
                <div className="text-xs" style={{ color: COLORS.text.muted }}>Posted</div>
              </div>
              <div className="p-2 rounded text-center" style={{ background: COLORS.bg.elevated }}>
                <div className="text-lg font-mono" style={{ color: COLORS.status.warning }}>
                  {postedBounties.filter(b => b.bountyStatus === 'claimed').length}
                </div>
                <div className="text-xs" style={{ color: COLORS.text.muted }}>Claimed</div>
              </div>
              <div className="p-2 rounded text-center" style={{ background: COLORS.bg.elevated }}>
                <div className="text-lg font-mono" style={{ color: COLORS.localHub.primary }}>
                  {postedBounties.filter(b => b.bountyStatus === 'submitted').length}
                </div>
                <div className="text-xs" style={{ color: COLORS.text.muted }}>Submitted</div>
              </div>
              <div className="p-2 rounded text-center" style={{ background: COLORS.bg.elevated }}>
                <div className="text-lg font-mono" style={{ color: COLORS.localRoot.primary }}>
                  {postedBounties.filter(b => b.bountyStatus === 'completed').length}
                </div>
                <div className="text-xs" style={{ color: COLORS.text.muted }}>Complete</div>
              </div>
            </div>
          )}

          {postedBounties.length === 0 ? (
            <div style={{ color: COLORS.text.muted }}>No bounties posted yet</div>
          ) : (
            <div className="space-y-2">
              {postedBounties.map(b => (
                <div
                  key={b.id}
                  className="p-3 rounded"
                  style={{ background: COLORS.bg.elevated, border: `1px solid ${COLORS.border.subtle}` }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div style={{ color: COLORS.text.primary }}>{b.name}</div>
                      <div className="text-xs mt-1" style={{ color: COLORS.text.muted }}>
                        {b.bounty?.amount || 0} variety
                      </div>
                    </div>
                    <div
                      className="px-2 py-0.5 rounded text-xs"
                      style={{
                        background: `${getBountyStatusColor(b.bountyStatus)}20`,
                        color: getBountyStatusColor(b.bountyStatus),
                      }}
                    >
                      {b.bountyStatus || 'pending'}
                    </div>
                  </div>
                  {b.claim && (
                    <div className="mt-2 text-xs" style={{ color: COLORS.text.secondary }}>
                      Claimed by: {members.find(m => m.id === b.claim?.workerId)?.name || b.claim.workerId}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Divider if showing both views */}
      {showIdentityView && !isRoot && (
        <div style={{ borderTop: `1px solid ${COLORS.border.subtle}`, marginTop: 16, marginBottom: 16 }} />
      )}

      {/* Operations View: Available bounties and reputation (if not just root) */}
      {!isRoot && (
        <>
          {/* Reputation */}
          {reputation && (
            <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wide" style={{ color: COLORS.text.muted }}>
                  Your Reputation
                </div>
                <div className="text-sm font-mono" style={{ color: COLORS.localOperations.primary }}>
                  {Math.round(reputation.completionRate * 100)}%
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-mono" style={{ color: COLORS.status.healthy }}>
                    {reputation.completedCount}
                  </div>
                  <div className="text-xs" style={{ color: COLORS.text.muted }}>Completed</div>
                </div>
                <div>
                  <div className="text-lg font-mono" style={{ color: COLORS.status.critical }}>
                    {reputation.releasedCount}
                  </div>
                  <div className="text-xs" style={{ color: COLORS.text.muted }}>Released</div>
                </div>
                <div>
                  <div className="text-lg font-mono" style={{ color: COLORS.localOperations.primary }}>
                    {reputation.totalEarned}
                  </div>
                  <div className="text-xs" style={{ color: COLORS.text.muted }}>Earned</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-center" style={{ color: COLORS.text.muted }}>
                Max claims: {reputation.maxConcurrentClaims} · Active: {myClaims.length}
              </div>
            </div>
          )}

          {/* My Active Claims */}
          {myClaims.length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORS.status.warning }}>
                My Active Claims ({myClaims.length})
              </div>
              <div className="space-y-2">
                {myClaims.map(c => (
                  <div
                    key={c.id}
                    className="p-3 rounded"
                    style={{
                      background: `${COLORS.status.warning}10`,
                      border: `1px solid ${COLORS.status.warning}30`,
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div style={{ color: COLORS.text.primary }}>{c.name}</div>
                        <div className="text-xs mt-1" style={{ color: COLORS.text.muted }}>
                          {c.bounty?.amount || 0} variety · {c.bountyStatus}
                        </div>
                      </div>
                      {c.bountyStatus === 'claimed' && (
                        <button
                          onClick={() => handleRelease(c.id)}
                          disabled={actionLoading === c.id}
                          className="px-2 py-1 rounded text-xs"
                          style={{
                            background: COLORS.status.critical,
                            color: '#fff',
                            opacity: actionLoading === c.id ? 0.5 : 1,
                          }}
                        >
                          {actionLoading === c.id ? '...' : 'Release'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Available Bounties (from contexts we're members of) */}
          <div>
            <div className="text-xs uppercase tracking-wide mb-2" style={{ color: COLORS.text.muted }}>
              Available Bounties ({availableBounties.length})
            </div>
            {availableBounties.length === 0 ? (
              <div style={{ color: COLORS.text.muted }}>
                {memberships.length === 0
                  ? 'Join a context to see available bounties'
                  : 'No bounties available right now'
                }
              </div>
            ) : (
              <div className="space-y-2">
                {availableBounties.map(b => {
                  const canClaim = reputation && myClaims.length < reputation.maxConcurrentClaims;
                  return (
                    <div
                      key={b.id}
                      className="p-3 rounded"
                      style={{ background: COLORS.bg.elevated, border: `1px solid ${COLORS.border.subtle}` }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div style={{ color: COLORS.text.primary }}>{b.name}</div>
                          <div className="text-xs mt-1 flex items-center gap-2" style={{ color: COLORS.text.muted }}>
                            <span className="font-mono" style={{ color: COLORS.localOperations.primary }}>
                              {b.bounty?.amount || 0} variety
                            </span>
                            <span>·</span>
                            <span>{b.conditions.length} conditions</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleClaim(b.id)}
                          disabled={!canClaim || actionLoading === b.id}
                          className="px-3 py-1.5 rounded text-sm"
                          style={{
                            background: canClaim ? COLORS.status.healthy : COLORS.bg.panel,
                            color: canClaim ? '#fff' : COLORS.text.muted,
                            opacity: actionLoading === b.id ? 0.5 : 1,
                          }}
                        >
                          {actionLoading === b.id ? '...' : 'Claim'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
