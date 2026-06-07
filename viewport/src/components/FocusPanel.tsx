/**
 * FocusPanel — Slide-up panel showing node details
 *
 * Handles both local identities (projects/members) and network DAOs.
 * Detects DAO addresses by the 0x prefix and length.
 */

import { useState, useEffect, useCallback } from 'react';
import { COLORS } from '../design-system';
import {
  fetchIdentity,
  fetchIdentities,
  fetchWork,
  fetchExecutors,
  fetchVarietyBalance,
  fetchTotalCredits,
  fetchPendingCredits,
  fetchPendingNeeds,
  fetchWorkspaceRoot,
  fetchMembers,
  updateIdentitySettings,
  approveNeed,
  deleteIdentity,
  purgeTerminated,
  fetchNetworkDAO,
  joinNode,
  leaveNode,
  type Identity,
  type Work,
  type ExecutorInfo,
  type VarietyBalance,
  type PendingNeed,
  type PendingCredit,
  type NetworkDAODetail,
} from '../api/client';
import { AttestationModal } from './AttestationModal';
import { useVarietyEvents, useCreditEvents } from '../hooks/useChainEvents';
import { ChatPanel } from './ChatPanel';
import { WaveGraph } from './WaveGraph';
import { AuditPanel } from './AuditPanel';
import { BountyPanel } from './BountyPanel';
import { GovernancePanel } from './GovernancePanel';

interface FocusPanelProps {
  nodeId: string;
  onClose: () => void;
}

function formatLoopAmount(amountWei: string): string {
  const wei = BigInt(amountWei);
  const loop = wei / BigInt(10 ** 18);
  return loop.toString();
}

function isEthereumAddress(id: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(id);
}

export function FocusPanel({ nodeId, onClose }: FocusPanelProps) {
  const isDAO = isEthereumAddress(nodeId);
  // Local identity state
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [members, setMembers] = useState<Identity[]>([]);
  const [work, setWork] = useState<Work[]>([]);
  const [executors, setExecutors] = useState<ExecutorInfo[]>([]);
  const [variety, setVariety] = useState<VarietyBalance | null>(null);
  const [credits, setCredits] = useState<string>('0');
  const [pendingNeeds, setPendingNeeds] = useState<PendingNeed[]>([]);
  const [pendingCredits, setPendingCredits] = useState<PendingCredit[]>([]);

  // DAO state
  const [daoDetail, setDAODetail] = useState<NetworkDAODetail | null>(null);

  // All projects (for join UI)
  const [allProjects, setAllProjects] = useState<Identity[]>([]);
  const [joinLoading, setJoinLoading] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'wave' | 'particle' | 'identity' | 'overview' | 'work' | 'settings' | 'audits' | 'bounties' | 'governance'>('chat');

  // Attestation modal state
  const [attestationTarget, setAttestationTarget] = useState<{
    workId: string;
    workName: string;
    conditionId: string;
    conditionDescription: string;
    verifier: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDAO) {
        // Load DAO details from network API
        const daoData = await fetchNetworkDAO(nodeId);
        setDAODetail(daoData);
        // Switch to identity tab for DAOs
        setActiveTab('identity');
      } else {
        // Load local identity data
        const [identityData, membersData, workData, executorData, varietyData, creditsData, needsData, allCredits, allNodes] = await Promise.all([
          fetchIdentity(nodeId),
          fetchMembers(nodeId),
          fetchWork(),
          fetchExecutors(),
          fetchVarietyBalance(nodeId),
          fetchTotalCredits(),
          fetchPendingNeeds(),
          fetchPendingCredits(),
          fetchIdentities(),
        ]);

        setIdentity(identityData);
        setMembers(membersData);
        setExecutors(executorData);
        setVariety(varietyData);
        setCredits(creditsData);
        setPendingNeeds(needsData);
        // Filter credits for this node (earned by this identity or under this root)
        setPendingCredits(allCredits.filter(c => c.identityId === nodeId));

        // Filter work owned by or assigned to this identity
        const relevantWork = workData.filter(
          (w) => w.ownerId === nodeId || w.executorId === nodeId
        );
        setWork(relevantWork);

        // All projects (nodes that aren't this node) - for join UI
        setAllProjects(allNodes.filter(n => n.id !== nodeId && n.status === 'active'));
      }
    } catch (err) {
      console.error('Failed to load node data:', err);
    } finally {
      setLoading(false);
    }
  }, [nodeId, isDAO]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh on variety/credit events
  useVarietyEvents(loadData);
  useCreditEvents(loadData);

  // Handler to update identity settings (optimistic update, no full reload)
  const handleSettingsChange = async (updates: Partial<Identity['settings']>) => {
    // Optimistically update local state
    if (identity) {
      setIdentity({
        ...identity,
        settings: { ...identity.settings, ...updates },
      });
    }
    // Persist to backend
    await updateIdentitySettings(nodeId, updates);
  };

  // State for root check
  const [isRoot, setIsRoot] = useState(false);
  useEffect(() => {
    fetchWorkspaceRoot().then(({ rootId }) => {
      setIsRoot(rootId === nodeId);
    });
  }, [nodeId]);

  // Different tabs for DAOs vs local identities
  const tabs = isDAO ? [
    { id: 'identity', label: 'Identity' },
    { id: 'governance', label: 'Governance' },
    { id: 'audits', label: 'Audits' },
    { id: 'overview', label: 'Overview' },
  ] as const : [
    { id: 'chat', label: 'Chat' },
    { id: 'wave', label: 'Wave' },
    { id: 'particle', label: 'Particle' },
    { id: 'identity', label: 'Identity' },
    { id: 'governance', label: 'Governance' },
    { id: 'bounties', label: 'Bounties' },
    { id: 'work', label: `Work (${work.length})` },
    { id: 'settings', label: 'Settings' },
  ] as const;

  return (
    <div className="focus-panel">
      {/* Header */}
      <div className="focus-panel-header">
        <div className="flex items-center gap-3">
          {/* Node indicator */}
          <div
            className="w-8 h-8 rounded flex items-center justify-center"
            style={{
              background: isDAO
                ? `${COLORS.dao.primary}20`
                : isRoot
                ? `${COLORS.s5.primary}20`
                : `${COLORS.member.primary}20`,
              border: `1px solid ${
                isDAO
                  ? COLORS.dao.border
                  : isRoot
                  ? COLORS.s5.border
                  : COLORS.member.border
              }`,
            }}
          >
            <span
              style={{
                color: isDAO
                  ? COLORS.dao.text
                  : isRoot
                  ? COLORS.s5.text
                  : COLORS.member.text,
              }}
            >
              {isDAO ? '◆' : isRoot ? '◆' : '●'}
            </span>
          </div>

          <div>
            <div className="font-medium" style={{ color: COLORS.text.primary }}>
              {isDAO ? (daoDetail?.name || `${nodeId.slice(0, 6)}...${nodeId.slice(-4)}`) : (identity?.name || nodeId)}
            </div>
            <div className="text-xs" style={{ color: COLORS.text.muted }}>
              {isDAO ? 'DAO' : isRoot ? 'Root (S5)' : 'Node'}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/10"
          style={{
            color: COLORS.text.secondary,
            fontSize: '1.25rem',
          }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 px-4 py-2"
        style={{ borderBottom: `1px solid ${COLORS.border.subtle}` }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className="px-3 py-1.5 rounded text-sm transition-colors"
            style={{
              background: activeTab === tab.id ? COLORS.bg.elevated : 'transparent',
              color: activeTab === tab.id ? COLORS.text.primary : COLORS.text.muted,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="focus-panel-content">
        {activeTab === 'audits' && isDAO && (
          <div className="h-full -mx-5 -mb-5 overflow-auto">
            <AuditPanel daoAddress={nodeId as `0x${string}`} />
          </div>
        )}

        {activeTab === 'chat' && !isDAO && (
          <div className="h-full -mx-5 -mb-5">
            <ChatPanel
              nodeId={nodeId}
              executor={identity?.settings?.executor || 'claude'}
            />
          </div>
        )}

        {activeTab === 'wave' && !isDAO && (
          <div className="h-full -mx-5 -mb-5">
            <WaveGraph projectId={nodeId} compact />
          </div>
        )}

        {activeTab === 'particle' && (
          <div className="h-full -mx-5 -mb-5" style={{ minHeight: 400 }}>
            <WaveGraph projectId={nodeId} />
          </div>
        )}

        {activeTab === 'governance' && (
          <div className="h-full -mx-5 -mb-5 overflow-auto">
            <GovernancePanel nodeId={nodeId} />
          </div>
        )}

        {/* Identity tab - local nodes */}
        {activeTab === 'identity' && !isDAO && identity && (
          <div className="space-y-6">
            {/* Name & Purpose */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Name
              </div>
              <div style={{ color: COLORS.text.primary, fontSize: '1.125rem' }}>
                {identity.name}
              </div>
            </div>

            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Purpose
              </div>
              <div style={{ color: COLORS.text.secondary }}>
                {identity.purpose || 'No purpose defined'}
              </div>
            </div>

            {/* Scope */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Scope
              </div>
              <div className="font-mono text-sm" style={{ color: COLORS.text.secondary }}>
                {identity.scope.join(', ')}
              </div>
            </div>

            {/* Status */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Status
              </div>
              <div
                className="inline-flex items-center gap-2 px-2 py-1 rounded text-sm"
                style={{
                  background: identity.status === 'active'
                    ? `${COLORS.status.healthy}20`
                    : `${COLORS.status.inactive}20`,
                  color: identity.status === 'active'
                    ? COLORS.status.healthy
                    : COLORS.status.inactive,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: identity.status === 'active'
                      ? COLORS.status.healthy
                      : COLORS.status.inactive,
                  }}
                />
                {identity.status}
              </div>
            </div>

            {/* Members (S1s that joined this node) */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Members ({members.length})
              </div>
              {members.length > 0 ? (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div
                      key={m.id}
                      className="p-2 rounded flex items-center justify-between"
                      style={{ background: COLORS.bg.elevated }}
                    >
                      <div>
                        <div style={{ color: COLORS.text.primary }}>{m.name}</div>
                        <div className="text-xs" style={{ color: COLORS.text.muted }}>
                          {m.purpose?.slice(0, 50) || m.id}
                        </div>
                      </div>
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: m.status === 'active'
                            ? COLORS.status.healthy
                            : COLORS.status.inactive,
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: COLORS.text.muted }}>No members yet</div>
              )}
            </div>

            {/* Member Of (S5s this node joined) */}
            {identity.memberships && identity.memberships.length > 0 && (
              <div>
                <div
                  className="text-xs uppercase tracking-wide mb-2"
                  style={{ color: COLORS.status.healthy }}
                >
                  Member Of ({identity.memberships.length})
                </div>
                <div className="space-y-1">
                  {identity.memberships.map((m) => {
                    const project = allProjects.find(p => p.id === m.context);
                    return (
                      <div
                        key={m.context}
                        className="px-2 py-1.5 rounded text-sm flex items-center justify-between"
                        style={{ background: COLORS.bg.elevated }}
                      >
                        <div className="flex-1 min-w-0">
                          <div style={{ color: COLORS.text.primary }} className="truncate">
                            {project?.name || m.context}
                          </div>
                          {m.role && (
                            <div className="text-xs" style={{ color: COLORS.text.muted }}>{m.role}</div>
                          )}
                        </div>
                        <button
                          onClick={async () => {
                            setJoinLoading(m.context);
                            await leaveNode(nodeId, m.context);
                            await loadData();
                            setJoinLoading(null);
                          }}
                          disabled={joinLoading === m.context}
                          className="ml-2 px-2 py-0.5 rounded text-xs"
                          style={{
                            background: `${COLORS.status.critical}20`,
                            color: COLORS.status.critical,
                            opacity: joinLoading === m.context ? 0.5 : 1,
                          }}
                        >
                          {joinLoading === m.context ? '...' : 'Leave'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Available to Join (projects this node hasn't joined) */}
            {(() => {
              const memberContexts = new Set(identity.memberships?.map(m => m.context) || []);
              const availableToJoin = allProjects.filter(p => !memberContexts.has(p.id));

              if (availableToJoin.length === 0) return null;

              return (
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Available to Join ({availableToJoin.length})
                  </div>
                  <div className="space-y-1 max-h-48 overflow-auto">
                    {availableToJoin.map((project) => (
                      <div
                        key={project.id}
                        className="px-2 py-1.5 rounded text-sm flex items-center justify-between"
                        style={{ background: COLORS.bg.elevated }}
                      >
                        <div className="flex-1 min-w-0">
                          <div style={{ color: COLORS.text.primary }} className="truncate">
                            {project.name}
                          </div>
                          <div className="text-xs truncate" style={{ color: COLORS.text.muted }}>
                            {project.purpose?.slice(0, 40) || project.id}
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            setJoinLoading(project.id);
                            await joinNode(nodeId, project.id);
                            await loadData();
                            setJoinLoading(null);
                          }}
                          disabled={joinLoading === project.id}
                          className="ml-2 px-2 py-0.5 rounded text-xs"
                          style={{
                            background: COLORS.status.healthy,
                            color: '#fff',
                            opacity: joinLoading === project.id ? 0.5 : 1,
                          }}
                        >
                          {joinLoading === project.id ? '...' : 'Join'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Pending Credits (LOOP tokens earned) */}
            {pendingCredits.length > 0 && (
              <div>
                <div
                  className="text-xs uppercase tracking-wide mb-2"
                  style={{ color: COLORS.text.muted }}
                >
                  Pending Credits ({pendingCredits.length})
                </div>
                <div
                  className="p-3 rounded mb-2"
                  style={{ background: COLORS.bg.elevated }}
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-mono" style={{ color: COLORS.member.primary }}>
                      {(pendingCredits.reduce((sum, c) => sum + BigInt(c.amount), BigInt(0)) / BigInt(10 ** 18)).toString()}
                    </span>
                    <span className="text-sm" style={{ color: COLORS.text.muted }}>LOOP</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: COLORS.text.muted }}>
                    {pendingCredits.reduce((sum, c) => sum + c.bits, 0)} bits resolved
                  </div>
                </div>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {pendingCredits.slice(0, 5).map((c) => (
                    <div
                      key={c.id}
                      className="px-2 py-1 rounded text-xs flex justify-between"
                      style={{ background: COLORS.bg.elevated, color: COLORS.text.secondary }}
                    >
                      <span className="truncate" style={{ maxWidth: '60%' }}>{c.contractId}</span>
                      <span style={{ color: COLORS.member.primary }}>
                        {(BigInt(c.amount) / BigInt(10 ** 18)).toString()} LOOP
                      </span>
                    </div>
                  ))}
                  {pendingCredits.length > 5 && (
                    <div className="text-xs text-center" style={{ color: COLORS.text.muted }}>
                      +{pendingCredits.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Identity tab - DAO (network) */}
        {activeTab === 'identity' && isDAO && daoDetail && (
          <div className="space-y-6">
            {/* Name & Purpose */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Name
              </div>
              <div style={{ color: COLORS.text.primary, fontSize: '1.125rem' }}>
                {daoDetail.name}
              </div>
            </div>

            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Purpose
              </div>
              <div style={{ color: COLORS.text.secondary }}>
                {daoDetail.purpose || 'No purpose defined'}
              </div>
            </div>

            {/* Contract Address */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Contract Address
              </div>
              <div className="font-mono text-sm" style={{ color: COLORS.text.secondary }}>
                {daoDetail.address}
              </div>
            </div>

            {/* Status */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Status
              </div>
              <div
                className="inline-flex items-center gap-2 px-2 py-1 rounded text-sm"
                style={{
                  background: !daoDetail.paused
                    ? `${COLORS.status.healthy}20`
                    : `${COLORS.status.critical}20`,
                  color: !daoDetail.paused
                    ? COLORS.status.healthy
                    : COLORS.status.critical,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: !daoDetail.paused
                      ? COLORS.status.healthy
                      : COLORS.status.critical,
                  }}
                />
                {daoDetail.paused ? 'Paused' : 'Active'}
              </div>
            </div>

            {/* Members */}
            <div>
              <div
                className="text-xs uppercase tracking-wide mb-2"
                style={{ color: COLORS.text.muted }}
              >
                Members ({daoDetail.memberCount})
              </div>
              {daoDetail.members && daoDetail.members.length > 0 ? (
                <div className="space-y-1 max-h-40 overflow-auto">
                  {daoDetail.members.map((addr) => (
                    <div
                      key={addr}
                      className="font-mono text-xs px-2 py-1 rounded"
                      style={{ background: COLORS.bg.elevated, color: COLORS.text.secondary }}
                    >
                      {addr.slice(0, 6)}...{addr.slice(-4)}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: COLORS.text.muted }}>No members</div>
              )}
            </div>

            {/* Join Button (network level) */}
            <div
              className="pt-4 mt-4"
              style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
            >
              <button
                className="w-full px-4 py-3 rounded-lg text-sm font-medium"
                style={{
                  background: COLORS.dao.primary,
                  color: COLORS.bg.void,
                }}
                onClick={() => {
                  alert('Join functionality requires wallet connection and NFT purchase');
                }}
              >
                Join DAO
              </button>
              <div
                className="mt-2 text-xs text-center"
                style={{ color: COLORS.text.muted }}
              >
                Purchase membership NFT to become a member
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ color: COLORS.text.muted }}>Loading...</div>
        ) : (
          <>
            {/* DAO Overview */}
            {activeTab === 'overview' && isDAO && daoDetail && (
              <div className="space-y-6">
                {/* Address */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Contract Address
                  </div>
                  <div className="font-mono text-sm" style={{ color: COLORS.text.secondary }}>
                    {daoDetail.address}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="p-3 rounded"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <div className="text-xs" style={{ color: COLORS.text.muted }}>
                      Members
                    </div>
                    <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                      {daoDetail.memberCount}
                    </div>
                  </div>
                  <div
                    className="p-3 rounded"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <div className="text-xs" style={{ color: COLORS.text.muted }}>
                      Work Items
                    </div>
                    <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                      {daoDetail.workCount}
                    </div>
                  </div>
                </div>

                {/* Purpose */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Purpose
                  </div>
                  <div style={{ color: COLORS.text.secondary }}>
                    {daoDetail.purpose || 'No purpose defined'}
                  </div>
                </div>

                {/* Guardian */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Guardian
                  </div>
                  <div className="font-mono text-sm" style={{ color: COLORS.text.secondary }}>
                    {daoDetail.guardian.slice(0, 6)}...{daoDetail.guardian.slice(-4)}
                  </div>
                </div>

                {/* Status */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Status
                  </div>
                  <div
                    className="inline-flex items-center gap-2 px-2 py-1 rounded text-sm"
                    style={{
                      background: !daoDetail.paused
                        ? `${COLORS.status.healthy}20`
                        : `${COLORS.status.critical}20`,
                      color: !daoDetail.paused
                        ? COLORS.status.healthy
                        : COLORS.status.critical,
                    }}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        background: !daoDetail.paused
                          ? COLORS.status.healthy
                          : COLORS.status.critical,
                      }}
                    />
                    {daoDetail.paused ? 'Paused' : 'Active'}
                  </div>
                </div>

                {/* Members List */}
                {daoDetail.members && daoDetail.members.length > 0 && (
                  <div>
                    <div
                      className="text-xs uppercase tracking-wide mb-2"
                      style={{ color: COLORS.text.muted }}
                    >
                      Members ({daoDetail.members.length})
                    </div>
                    <div className="space-y-1 max-h-40 overflow-auto">
                      {daoDetail.members.map((addr) => (
                        <div
                          key={addr}
                          className="font-mono text-xs px-2 py-1 rounded"
                          style={{
                            background: COLORS.bg.elevated,
                            color: COLORS.text.secondary,
                          }}
                        >
                          {addr.slice(0, 6)}...{addr.slice(-4)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Local Node Overview - operational metrics */}
            {activeTab === 'overview' && !isDAO && identity && (
              <div className="space-y-6">
                {/* Variety Balance */}
                {variety && (
                  <div>
                    <div
                      className="text-xs uppercase tracking-wide mb-2"
                      style={{ color: COLORS.text.muted }}
                    >
                      Variety Balance
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div
                        className="p-3 rounded"
                        style={{ background: COLORS.bg.elevated }}
                      >
                        <div className="text-xs" style={{ color: COLORS.text.muted }}>
                          Perceived (S4)
                        </div>
                        <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                          {variety.perceived}
                        </div>
                      </div>
                      <div
                        className="p-3 rounded"
                        style={{ background: COLORS.bg.elevated }}
                      >
                        <div className="text-xs" style={{ color: COLORS.text.muted }}>
                          Resolved (S3)
                        </div>
                        <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                          {variety.resolved}
                        </div>
                      </div>
                    </div>
                    <div
                      className="mt-2 flex items-center gap-2 text-sm"
                      style={{
                        color: variety.healthy ? COLORS.status.healthy : COLORS.status.warning,
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{
                          background: variety.healthy ? COLORS.status.healthy : COLORS.status.warning,
                        }}
                      />
                      {variety.healthy
                        ? `Ratio ${variety.ratio.toFixed(2)} — Healthy`
                        : variety.ratio > 1.5
                        ? `Ratio ${variety.ratio.toFixed(2)} — Over-perceiving`
                        : `Ratio ${variety.ratio.toFixed(2)} — Under-perceiving`}
                    </div>
                  </div>
                )}

                {/* Pending Credits */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Pending Credits
                  </div>
                  <div
                    className="p-3 rounded flex items-baseline gap-2"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <span className="text-2xl font-mono" style={{ color: COLORS.member.primary }}>
                      {formatLoopAmount(credits)}
                    </span>
                    <span className="text-sm" style={{ color: COLORS.text.muted }}>
                      LOOP
                    </span>
                  </div>
                </div>

                {/* Pending Approvals */}
                {pendingNeeds.length > 0 && (
                  <div>
                    <div
                      className="text-xs uppercase tracking-wide mb-2"
                      style={{ color: COLORS.status.warning }}
                    >
                      Pending Approvals ({pendingNeeds.length})
                    </div>
                    <div className="space-y-2">
                      {pendingNeeds.slice(0, 3).map((need) => (
                        <div
                          key={need.key}
                          className="p-2 rounded text-sm flex justify-between items-center"
                          style={{
                            background: `${COLORS.status.warning}10`,
                            border: `1px solid ${COLORS.status.warning}30`,
                          }}
                        >
                          <span style={{ color: COLORS.text.secondary }}>
                            {need.requirement.slice(0, 40)}...
                          </span>
                          <div className="flex gap-1">
                            <button
                              onClick={() => approveNeed(need.key, true, 'Approved').then(loadData)}
                              className="px-2 py-1 rounded text-xs"
                              style={{ background: COLORS.status.healthy, color: '#fff' }}
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => approveNeed(need.key, false, 'Rejected').then(loadData)}
                              className="px-2 py-1 rounded text-xs"
                              style={{ background: COLORS.status.critical, color: '#fff' }}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div
                    className="p-3 rounded"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <div className="text-xs" style={{ color: COLORS.text.muted }}>
                      Members
                    </div>
                    <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                      {members.length}
                    </div>
                  </div>
                  <div
                    className="p-3 rounded"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <div className="text-xs" style={{ color: COLORS.text.muted }}>
                      Work Items
                    </div>
                    <div className="text-xl font-mono" style={{ color: COLORS.text.primary }}>
                      {work.length}
                    </div>
                  </div>
                </div>

                {/* Created */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    Created
                  </div>
                  <div className="text-sm" style={{ color: COLORS.text.secondary }}>
                    {new Date(identity.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bounties' && identity && (
              <BountyPanel
                nodeId={nodeId}
                isRoot={isRoot}
                memberships={identity.memberships || []}
              />
            )}

            {activeTab === 'work' && (
              <div className="space-y-3">
                {work.length === 0 ? (
                  <div style={{ color: COLORS.text.muted }}>No work contracts</div>
                ) : (
                  work.map((w) => (
                    <div
                      key={w.id}
                      className="p-3 rounded"
                      style={{
                        background: COLORS.bg.elevated,
                        border: `1px solid ${COLORS.border.subtle}`,
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div style={{ color: COLORS.text.primary }}>{w.name}</div>
                          <div
                            className="text-xs mt-1"
                            style={{ color: COLORS.text.muted }}
                          >
                            Gap: {w.gap} · Status: {w.status}
                          </div>
                        </div>
                        <div
                          className="px-2 py-0.5 rounded text-xs"
                          style={{
                            background:
                              w.status === 'fulfilled'
                                ? `${COLORS.status.healthy}20`
                                : w.status === 'executing'
                                ? `${COLORS.status.warning}20`
                                : `${COLORS.bg.panel}`,
                            color:
                              w.status === 'fulfilled'
                                ? COLORS.status.healthy
                                : w.status === 'executing'
                                ? COLORS.status.warning
                                : COLORS.text.muted,
                          }}
                        >
                          {w.status}
                        </div>
                      </div>

                      {/* Conditions */}
                      {w.conditions.length > 0 && (
                        <div className="mt-3 space-y-1">
                          {w.conditions.map((c) => {
                            const needsHuman = c.verifier.startsWith('meets:') || c.verifier.startsWith('needs:');
                            const canAttest = needsHuman && !c.met && w.status === 'active';

                            return (
                              <div
                                key={c.id}
                                className="flex items-center gap-2 text-xs"
                                style={{ color: COLORS.text.secondary }}
                              >
                                <span
                                  style={{
                                    color: c.met
                                      ? COLORS.status.healthy
                                      : COLORS.text.muted,
                                  }}
                                >
                                  {c.met ? '✓' : '○'}
                                </span>
                                <span className="flex-1">{c.description}</span>
                                {c.confidence > 0 && !c.met && (
                                  <span style={{ color: COLORS.text.muted }}>
                                    ({Math.round(c.confidence * 100)}%)
                                  </span>
                                )}
                                {canAttest && (
                                  <button
                                    onClick={() => setAttestationTarget({
                                      workId: w.id,
                                      workName: w.name,
                                      conditionId: c.id,
                                      conditionDescription: c.description,
                                      verifier: c.verifier,
                                    })}
                                    className="px-1.5 py-0.5 rounded text-xs flex items-center gap-1"
                                    style={{
                                      background: `${COLORS.status.warning}20`,
                                      color: COLORS.status.warning,
                                      border: `1px solid ${COLORS.status.warning}40`,
                                    }}
                                    title="Human attestation required"
                                  >
                                    👤 Attest
                                  </button>
                                )}
                                {needsHuman && !canAttest && !c.met && (
                                  <span style={{ color: COLORS.text.muted }} title="Human attestation required">
                                    👤
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'settings' && identity && (
              <div className="space-y-6">
                {/* Variety Controls Header */}
                <div
                  className="p-4 rounded-lg"
                  style={{
                    background: `${COLORS.s5.primary}08`,
                    border: `1px solid ${COLORS.s5.border}`,
                  }}
                >
                  <div className="text-sm font-medium mb-2" style={{ color: COLORS.s5.text }}>
                    Variety Engineering Controls
                  </div>
                  <div className="text-xs" style={{ color: COLORS.text.muted }}>
                    These settings control how this node absorbs, attenuates, and transduces variety.
                    The governance tab shows the fixed formulas; here you tune the inputs.
                  </div>
                </div>

                {/* === GATES: What variety can flow === */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    <span>Gates</span>
                    <span className="text-xs normal-case" style={{ color: COLORS.text.muted }}>— on/off flow control</span>
                  </div>

                  {/* Autonomous Mode */}
                  <div
                    className="p-3 rounded-lg mb-3"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: COLORS.text.primary }}
                        >
                          Autonomous Mode
                        </div>
                        <div
                          className="text-xs mt-1"
                          style={{ color: COLORS.text.muted }}
                        >
                          Skip permission prompts for file operations
                      </div>
                    </div>
                    <button
                      onClick={() => handleSettingsChange({
                        autonomousMode: !identity.settings?.autonomousMode,
                      })}
                      className="relative w-12 h-6 rounded-full transition-colors"
                      style={{
                        background: identity.settings?.autonomousMode
                          ? COLORS.status.healthy
                          : COLORS.bg.elevated,
                      }}
                    >
                      <div
                        className="absolute w-5 h-5 rounded-full bg-white transition-transform"
                        style={{
                          top: 2,
                          left: identity.settings?.autonomousMode ? 26 : 2,
                        }}
                      />
                    </button>
                  </div>
                  {identity.settings?.autonomousMode && (
                    <div
                      className="mt-2 p-2 rounded text-xs"
                      style={{
                        background: `${COLORS.status.warning}15`,
                        color: COLORS.status.warning,
                      }}
                    >
                      This node can create/modify files without asking
                    </div>
                  )}
                </div>

                {/* Available for Work */}
                  <div
                    className="p-3 rounded-lg"
                    style={{ background: COLORS.bg.elevated }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div style={{ color: COLORS.text.primary }}>
                          Available for Bounties
                        </div>
                        <div
                          className="text-xs mt-1"
                          style={{ color: COLORS.text.muted }}
                        >
                          Allow S3 to auto-assign bounties to this node
                        </div>
                      </div>
                      <button
                        onClick={() => handleSettingsChange({
                          availableForWork: !(identity.settings?.availableForWork ?? true),
                        })}
                        className="relative w-12 h-6 rounded-full transition-colors"
                        style={{
                          background: (identity.settings?.availableForWork ?? true)
                            ? COLORS.status.healthy
                            : COLORS.bg.panel,
                        }}
                      >
                        <div
                          className="absolute w-5 h-5 rounded-full bg-white transition-transform"
                          style={{
                            top: 2,
                            left: (identity.settings?.availableForWork ?? true) ? 26 : 2,
                          }}
                        />
                      </button>
                    </div>
                    {!(identity.settings?.availableForWork ?? true) && (
                      <div
                        className="mt-2 p-2 rounded text-xs"
                        style={{
                          background: `${COLORS.status.warning}15`,
                          color: COLORS.status.warning,
                        }}
                      >
                        This node won't be auto-assigned bounties (can still claim manually)
                      </div>
                    )}
                  </div>

                  {/* Security Mode - also a gate */}
                  <div className="mt-3">
                    <div className="text-sm mb-2" style={{ color: COLORS.text.primary }}>
                      Security Mode
                    </div>
                    <select
                      value={identity.settings?.securityMode || 'advisory'}
                      onChange={(e) => handleSettingsChange({
                        securityMode: e.target.value as 'advisory' | 'enforced' | 'signed',
                      })}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        background: COLORS.bg.panel,
                        border: `1px solid ${COLORS.border.subtle}`,
                        color: COLORS.text.primary,
                      }}
                    >
                      <option value="advisory">Advisory — log but don't block</option>
                      <option value="enforced">Enforced — block scope violations</option>
                      <option value="signed">Signed — cryptographic tokens (network)</option>
                    </select>
                    <div className="text-xs mt-1" style={{ color: COLORS.text.muted }}>
                      Controls scope boundary enforcement
                    </div>
                  </div>
                </div>

                {/* === ATTENUATORS: Reduce incoming variety === */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    <span>Attenuators</span>
                    <span className="text-xs normal-case" style={{ color: COLORS.text.muted }}>— reduce incoming variety</span>
                  </div>

                  {/* Max Attempts */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm" style={{ color: COLORS.text.primary }}>
                        Max Attempts
                      </span>
                      <span className="text-xs font-mono" style={{ color: COLORS.text.muted }}>
                        {identity.settings?.maxAttempts || 3}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={identity.settings?.maxAttempts || 3}
                      onChange={(e) => handleSettingsChange({
                        maxAttempts: parseInt(e.target.value, 10) || 3,
                      })}
                      className="w-full"
                      style={{ accentColor: COLORS.status.warning }}
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.text.muted }}>
                      <span>Fail fast</span>
                      <span>Persist (more retries)</span>
                    </div>
                  </div>

                  {/* Confidence Threshold */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm" style={{ color: COLORS.text.primary }}>
                        Confidence Threshold
                      </span>
                      <span className="text-xs font-mono" style={{ color: COLORS.text.muted }}>
                        {((identity.settings?.confidenceThreshold ?? 0.7) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={1.0}
                      step={0.05}
                      value={identity.settings?.confidenceThreshold ?? 0.7}
                      onChange={(e) => handleSettingsChange({
                        confidenceThreshold: parseFloat(e.target.value),
                      })}
                      className="w-full"
                      style={{ accentColor: COLORS.status.healthy }}
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.text.muted }}>
                      <span>Trust more (auto-verify)</span>
                      <span>Skeptical (require attestation)</span>
                    </div>
                  </div>
                </div>

                {/* === TRANSDUCERS: Transform variety === */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    <span>Transducers</span>
                    <span className="text-xs normal-case" style={{ color: COLORS.text.muted }}>— transform variety</span>
                  </div>

                  {/* Executor Selection */}
                  <div>
                    <div className="text-sm mb-2" style={{ color: COLORS.text.primary }}>
                      Executor
                    </div>
                    <select
                      value={identity.settings?.executor || 'claude'}
                      onChange={(e) => handleSettingsChange({ executor: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{
                        background: COLORS.bg.panel,
                        border: `1px solid ${COLORS.border.subtle}`,
                        color: COLORS.text.primary,
                      }}
                    >
                      {executors.map((ex) => (
                        <option
                          key={ex.name}
                          value={ex.name}
                          disabled={!ex.installed}
                        >
                          {ex.name} — {ex.description} {!ex.installed && '(not installed)'}
                        </option>
                      ))}
                    </select>
                    <div
                      className="mt-2 text-xs"
                      style={{ color: COLORS.text.muted }}
                    >
                      Different executors have different variety-handling capacity
                    </div>
                  </div>
                </div>

                {/* === BALANCE: Exploration vs Exploitation === */}
                <div>
                  <div
                    className="text-xs uppercase tracking-wide mb-3 flex items-center gap-2"
                    style={{ color: COLORS.text.muted }}
                  >
                    <span>Balance</span>
                    <span className="text-xs normal-case" style={{ color: COLORS.text.muted }}>— exploration vs exploitation</span>
                  </div>

                  {/* Archetype Presets */}
                  <div className="flex gap-2 mb-4">
                    {[
                      {
                        name: 'Scout',
                        icon: '🔭',
                        params: { perceptionThreshold: 0, invocationThreshold: 10, γ: 0.3, β_base: 1.0 },
                        desc: 'Scans eagerly, works reluctantly'
                      },
                      {
                        name: 'Worker',
                        icon: '⚡',
                        params: { perceptionThreshold: -20, invocationThreshold: 0, γ: 0.05, β_base: 2.0 },
                        desc: 'Heads down, executes queue'
                      },
                      {
                        name: 'Balanced',
                        icon: '⚖️',
                        params: { perceptionThreshold: -10, invocationThreshold: 0, γ: 0.1, β_base: 1.0 },
                        desc: 'Default behavior'
                      },
                      {
                        name: 'Explorer',
                        icon: '🧭',
                        params: { perceptionThreshold: -5, invocationThreshold: 5, γ: 0.4, β_base: 0.5 },
                        desc: 'High exploration, learns new areas'
                      },
                    ].map((archetype) => (
                      <button
                        key={archetype.name}
                        onClick={() => handleSettingsChange(archetype.params)}
                        className="flex-1 px-2 py-2 rounded-lg text-xs transition-colors hover:opacity-80"
                        style={{
                          background: COLORS.bg.panel,
                          border: `1px solid ${COLORS.border.subtle}`,
                          color: COLORS.text.primary,
                        }}
                        title={archetype.desc}
                      >
                        <div>{archetype.icon}</div>
                        <div className="mt-1">{archetype.name}</div>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-4">
                    {/* Invocation Threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm" style={{ color: COLORS.text.primary }}>
                          Invocation Threshold
                        </span>
                        <span className="text-xs" style={{ color: COLORS.text.muted }}>
                          F &gt; {identity.settings?.invocationThreshold ?? 0}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-10}
                        max={50}
                        step={1}
                        value={identity.settings?.invocationThreshold ?? 0}
                        onChange={(e) => handleSettingsChange({
                          invocationThreshold: parseInt(e.target.value, 10),
                        })}
                        className="w-full"
                        style={{ accentColor: COLORS.status.healthy }}
                      />
                      <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.text.muted }}>
                        <span>Eager (work on any F)</span>
                        <span>Reluctant (high F only)</span>
                      </div>
                    </div>

                    {/* Perception Threshold */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm" style={{ color: COLORS.text.primary }}>
                          Perception Threshold
                        </span>
                        <span className="text-xs" style={{ color: COLORS.text.muted }}>
                          F &lt; {identity.settings?.perceptionThreshold ?? -10}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-30}
                        max={10}
                        step={1}
                        value={identity.settings?.perceptionThreshold ?? -10}
                        onChange={(e) => handleSettingsChange({
                          perceptionThreshold: parseInt(e.target.value, 10),
                        })}
                        className="w-full"
                        style={{ accentColor: COLORS.status.executing }}
                      />
                      <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.text.muted }}>
                        <span>Rarely scan</span>
                        <span>Scout (scan eagerly)</span>
                      </div>
                    </div>

                    {/* Gamma (Epistemic Weight) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm" style={{ color: COLORS.text.primary }}>
                          Exploration (γ)
                        </span>
                        <span className="text-xs" style={{ color: COLORS.text.muted }}>
                          {(identity.settings?.γ ?? 0.1).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.01}
                        value={identity.settings?.γ ?? 0.1}
                        onChange={(e) => handleSettingsChange({
                          γ: parseFloat(e.target.value),
                        })}
                        className="w-full"
                        style={{ accentColor: COLORS.dao.primary }}
                      />
                      <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.text.muted }}>
                        <span>Exploit (known work)</span>
                        <span>Explore (learn new)</span>
                      </div>
                    </div>

                    {/* Beta (Temperature) */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm" style={{ color: COLORS.text.primary }}>
                          Selectivity (β)
                        </span>
                        <span className="text-xs" style={{ color: COLORS.text.muted }}>
                          {(identity.settings?.β_base ?? 1.0).toFixed(1)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={3}
                        step={0.1}
                        value={identity.settings?.β_base ?? 1.0}
                        onChange={(e) => handleSettingsChange({
                          β_base: parseFloat(e.target.value),
                        })}
                        className="w-full"
                        style={{ accentColor: COLORS.status.warning }}
                      />
                      <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.text.muted }}>
                        <span>Random selection</span>
                        <span>Greedy (best only)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Node Actions */}
                {identity && (
                  <div
                    className="pt-4 mt-4"
                    style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
                  >
                    <div
                      className="text-xs uppercase tracking-wide mb-3"
                      style={{ color: COLORS.text.muted }}
                    >
                      Node Actions
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={async () => {
                          if (confirm(`Terminate "${identity.name}"? This will mark it as inactive.`)) {
                            await deleteIdentity(nodeId, false);
                            onClose();
                          }
                        }}
                        className="w-full px-3 py-2 rounded text-sm text-left"
                        style={{
                          background: COLORS.bg.elevated,
                          color: COLORS.text.secondary,
                        }}
                      >
                        Terminate — mark as inactive
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Delete "${identity.name}" and all its files? This cannot be undone.`)) {
                            await deleteIdentity(nodeId, true);
                            onClose();
                          }
                        }}
                        className="w-full px-3 py-2 rounded text-sm text-left"
                        style={{
                          background: `${COLORS.status.critical}15`,
                          color: COLORS.status.critical,
                        }}
                      >
                        Hard Delete — terminate + delete files
                      </button>
                    </div>
                  </div>
                )}

                {/* S5 Admin */}
                {isRoot && (
                  <div
                    className="pt-4 mt-4"
                    style={{ borderTop: `1px solid ${COLORS.border.subtle}` }}
                  >
                    <div
                      className="text-xs uppercase tracking-wide mb-3"
                      style={{ color: COLORS.status.warning }}
                    >
                      S5 Admin
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm('Purge all terminated nodes? This deletes their files permanently.')) {
                          const result = await purgeTerminated();
                          alert(`Purged ${result.count} of ${result.terminatedTotal} terminated nodes.`);
                        }
                      }}
                      className="w-full px-3 py-2 rounded text-sm text-left"
                      style={{
                        background: `${COLORS.status.warning}15`,
                        color: COLORS.status.warning,
                      }}
                    >
                      Purge Terminated — clean up disk space
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Attestation Modal */}
      {attestationTarget && (
        <AttestationModal
          workId={attestationTarget.workId}
          workName={attestationTarget.workName}
          conditionId={attestationTarget.conditionId}
          conditionDescription={attestationTarget.conditionDescription}
          verifier={attestationTarget.verifier}
          onClose={() => setAttestationTarget(null)}
          onAttest={async (passed, comment) => {
            const key = `attestation:${attestationTarget.workId}:${attestationTarget.conditionId}`;
            await approveNeed(key, passed, comment);
            setAttestationTarget(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}
