/**
 * AuditPanel — View and vote on pending audits
 */

import { useState, useEffect } from 'react';
import { COLORS } from '../design-system';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { MetasystemDAOABI } from '../wagmi';

interface AuditPanelProps {
  daoAddress: `0x${string}`;
}

function formatLoop(wei: bigint): string {
  return (Number(wei) / 1e18).toFixed(2);
}

function AuditCard({
  workId,
  daoAddress,
  onRefresh,
}: {
  workId: `0x${string}`;
  daoAddress: `0x${string}`;
  onRefresh: () => void;
}) {
  const { address } = useAccount();

  // Read work details
  const { data: workData } = useReadContract({
    address: daoAddress,
    abi: MetasystemDAOABI,
    functionName: 'works',
    args: [workId],
  });

  // Check if user has voted
  const { data: hasVoted, refetch: refetchVoted } = useReadContract({
    address: daoAddress,
    abi: MetasystemDAOABI,
    functionName: 'autoHasVoted',
    args: [workId, address || '0x0000000000000000000000000000000000000000'],
  });

  // Write functions
  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isSuccess) {
      refetchVoted();
      onRefresh();
    }
  }, [isSuccess, refetchVoted, onRefresh]);

  if (!workData) return null;

  const work = workData as readonly unknown[];
  const status = Number(work[2]);
  const claimedBy = work[3] as string;
  const rewardLoop = work[7] as bigint;

  // Only show PendingAudit items
  if (status !== 2) return null;

  const isWorker = claimedBy.toLowerCase() === address?.toLowerCase();
  const voted = hasVoted as boolean;

  const handleVote = (approve: boolean) => {
    writeContract({
      address: daoAddress,
      abi: MetasystemDAOABI,
      functionName: 'voteAudit',
      args: [workId, approve],
    });
  };

  const handleClaimManual = () => {
    writeContract({
      address: daoAddress,
      abi: MetasystemDAOABI,
      functionName: 'claimManualAudit',
      args: [workId],
    });
  };

  const handleFinalize = () => {
    writeContract({
      address: daoAddress,
      abi: MetasystemDAOABI,
      functionName: 'finalizeAuditAfterDeadline',
      args: [workId],
    });
  };

  return (
    <div
      className="p-4 rounded"
      style={{
        background: COLORS.bg.elevated,
        border: `1px solid ${COLORS.border.subtle}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-mono text-sm" style={{ color: COLORS.text.primary }}>
            {workId.slice(0, 10)}...{workId.slice(-8)}
          </div>
          <div className="text-xs mt-1" style={{ color: COLORS.text.muted }}>
            Reward: {formatLoop(rewardLoop)} LOOP
          </div>
        </div>
        <div
          className="px-2 py-1 rounded text-xs"
          style={{
            background: `${COLORS.status.warning}20`,
            color: COLORS.status.warning,
          }}
        >
          Pending
        </div>
      </div>

      {/* Voting Section */}
      <div
        className="p-3 rounded mb-3"
        style={{ background: COLORS.bg.panel }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase" style={{ color: COLORS.text.muted }}>
            Automated S3* Vote
          </span>
        </div>

        {!isWorker && !voted ? (
          <div className="flex gap-2">
            <button
              onClick={() => handleVote(true)}
              disabled={isPending || isConfirming}
              className="flex-1 py-2 rounded text-sm font-medium"
              style={{
                background: COLORS.status.healthy,
                color: '#fff',
                opacity: isPending || isConfirming ? 0.5 : 1,
              }}
            >
              {isPending || isConfirming ? 'Voting...' : 'Approve'}
            </button>
            <button
              onClick={() => handleVote(false)}
              disabled={isPending || isConfirming}
              className="flex-1 py-2 rounded text-sm font-medium"
              style={{
                background: COLORS.status.critical,
                color: '#fff',
                opacity: isPending || isConfirming ? 0.5 : 1,
              }}
            >
              {isPending || isConfirming ? 'Voting...' : 'Reject'}
            </button>
          </div>
        ) : voted ? (
          <div className="text-xs text-center py-2" style={{ color: COLORS.text.muted }}>
            You have voted on this audit
          </div>
        ) : (
          <div className="text-xs text-center py-2" style={{ color: COLORS.text.muted }}>
            Cannot vote on your own work
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleClaimManual}
          disabled={isPending || isConfirming || isWorker}
          className="flex-1 py-2 rounded text-xs"
          style={{
            background: COLORS.bg.panel,
            color: COLORS.text.secondary,
            border: `1px solid ${COLORS.border.subtle}`,
            opacity: isPending || isConfirming || isWorker ? 0.5 : 1,
          }}
        >
          Claim Manual Review
        </button>
        <button
          onClick={handleFinalize}
          disabled={isPending || isConfirming}
          className="flex-1 py-2 rounded text-xs"
          style={{
            background: COLORS.bg.panel,
            color: COLORS.text.secondary,
            border: `1px solid ${COLORS.border.subtle}`,
            opacity: isPending || isConfirming ? 0.5 : 1,
          }}
        >
          Finalize
        </button>
      </div>
    </div>
  );
}

export function AuditPanel({ daoAddress }: AuditPanelProps) {
  const { address } = useAccount();
  const [refreshKey, setRefreshKey] = useState(0);

  // Get work count
  const { data: workCount, refetch: refetchWorkCount } = useReadContract({
    address: daoAddress,
    abi: MetasystemDAOABI,
    functionName: 'workCount',
  });

  // Force refresh when key changes
  useEffect(() => {
    if (refreshKey > 0) {
      refetchWorkCount();
    }
  }, [refreshKey, refetchWorkCount]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
    refetchWorkCount();
  };

  if (!address) {
    return (
      <div className="p-4 text-center" style={{ color: COLORS.text.muted }}>
        Connect wallet to view and vote on audits
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 style={{ color: COLORS.text.primary, fontWeight: 500 }}>
          Pending Audits
        </h3>
        <button
          onClick={handleRefresh}
          className="px-3 py-1 rounded text-sm"
          style={{ background: COLORS.bg.elevated, color: COLORS.text.secondary }}
        >
          Refresh
        </button>
      </div>

      {Number(workCount || 0) === 0 ? (
        <div
          className="p-8 text-center rounded"
          style={{ background: COLORS.bg.elevated, color: COLORS.text.muted }}
        >
          No work items in this DAO
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm" style={{ color: COLORS.text.muted }}>
            {Number(workCount)} work items total. Showing pending audits:
          </div>
          <WorkList daoAddress={daoAddress} count={Number(workCount)} onRefresh={handleRefresh} />
        </div>
      )}
    </div>
  );
}

function WorkList({
  daoAddress,
  count,
  onRefresh,
}: {
  daoAddress: `0x${string}`;
  count: number;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <WorkCardLoader key={i} daoAddress={daoAddress} index={i} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function WorkCardLoader({
  daoAddress,
  index,
  onRefresh,
}: {
  daoAddress: `0x${string}`;
  index: number;
  onRefresh: () => void;
}) {
  const { data: workId } = useReadContract({
    address: daoAddress,
    abi: MetasystemDAOABI,
    functionName: 'workList',
    args: [BigInt(index)],
  });

  if (!workId) return null;

  return (
    <AuditCard
      workId={workId as `0x${string}`}
      daoAddress={daoAddress}
      onRefresh={onRefresh}
    />
  );
}
