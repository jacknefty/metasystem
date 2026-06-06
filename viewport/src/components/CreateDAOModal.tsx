/**
 * CreateDAOModal — Create new DAO at network level
 *
 * Requires:
 * - Connected wallet
 * - Verified member of MetasystemDAO
 * - Minimum 3 initial members (including creator)
 */

import { useState } from 'react';
import { motion } from 'motion/react';
import { COLORS } from '../design-system';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';

// Registry ABI for createDAO
const REGISTRY_ABI = [
  {
    name: 'createDAO',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'purpose', type: 'string' },
      { name: 'repoType', type: 'string' },
      { name: 'repoURI', type: 'string' },
      { name: 'initialMembers', type: 'address[]' },
      { name: 'minQuorum', type: 'uint256' },
    ],
    outputs: [{ name: 'daoId', type: 'bytes32' }],
  },
] as const;

// Registry address from config
const REGISTRY_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

interface CreateDAOModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function CreateDAOModal({ onClose, onCreated }: CreateDAOModalProps) {
  const { address } = useAccount();
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [repoType, setRepoType] = useState<'github' | 'gitlab' | 'radicle'>('github');
  const [repoURI, setRepoURI] = useState('');
  const [members, setMembers] = useState<string[]>([]); // Optional additional members
  const [minQuorum, setMinQuorum] = useState(5); // Minimum votes for proposals
  const [error, setError] = useState<string | null>(null);

  const { data: hash, writeContract, isPending } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  const addMemberField = () => {
    setMembers([...members, '']);
  };

  const removeMemberField = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const updateMember = (index: number, value: string) => {
    const updated = [...members];
    updated[index] = value;
    setMembers(updated);
  };

  const handleCreate = async () => {
    if (!address) {
      setError('Wallet not connected');
      return;
    }

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!repoURI.trim()) {
      setError('Repository URI is required');
      return;
    }

    if (minQuorum < 5) {
      setError('Minimum quorum must be at least 5');
      return;
    }

    // Validate member addresses (optional additional members)
    const validMembers = members.filter(m => m.trim() && /^0x[a-fA-F0-9]{40}$/.test(m.trim()));

    // Include creator + any additional members
    const allMembers = [address, ...validMembers.map(m => m.trim() as `0x${string}`)];

    setError(null);

    try {
      writeContract({
        address: REGISTRY_ADDRESS,
        abi: REGISTRY_ABI,
        functionName: 'createDAO',
        args: [name.trim(), purpose.trim(), repoType, repoURI.trim(), allMembers, BigInt(minQuorum)],
      });
    } catch (err) {
      setError(String(err));
    }
  };

  // Handle success
  if (isSuccess) {
    setTimeout(() => {
      onCreated();
      onClose();
    }, 1000);
  }

  return (
    <div
      className="absolute inset-0 flex items-center justify-center z-40"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-lg p-6 rounded-lg"
        style={{
          background: COLORS.bg.elevated,
          border: `1px solid ${COLORS.border.subtle}`,
          maxHeight: '85vh',
          overflow: 'auto',
        }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 style={{ color: COLORS.text.primary, fontSize: '1.125rem', fontWeight: 500 }}>
            Create New DAO
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/5"
            style={{ color: COLORS.text.muted }}
          >
            ✕
          </button>
        </div>

        {isSuccess ? (
          <div className="text-center py-8">
            <div className="text-2xl mb-2">✓</div>
            <div style={{ color: COLORS.text.primary }}>DAO Created!</div>
            <div style={{ color: COLORS.text.muted, fontSize: '0.875rem' }}>
              Redirecting...
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Name */}
            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                DAO Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., AI Research Collective"
                autoFocus
                className="w-full px-4 py-3 rounded-lg outline-none"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.primary,
                }}
              />
            </div>

            {/* Purpose */}
            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                Purpose
              </label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="What is this DAO trying to achieve?"
                rows={2}
                className="w-full px-4 py-3 rounded-lg outline-none resize-none"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.primary,
                }}
              />
            </div>

            {/* Repository */}
            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                Repository
              </label>
              <div className="flex gap-2 mb-2">
                {(['github', 'gitlab', 'radicle'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => setRepoType(type)}
                    className="px-3 py-1 rounded text-sm capitalize"
                    style={{
                      background: repoType === type ? COLORS.project.primary : COLORS.bg.panel,
                      color: repoType === type ? COLORS.bg.void : COLORS.text.secondary,
                      border: `1px solid ${repoType === type ? COLORS.project.primary : COLORS.border.subtle}`,
                    }}
                  >
                    {type}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={repoURI}
                onChange={(e) => setRepoURI(e.target.value)}
                placeholder={
                  repoType === 'github'
                    ? 'https://github.com/org/repo'
                    : repoType === 'gitlab'
                    ? 'https://gitlab.com/org/repo'
                    : 'rad:z...'
                }
                className="w-full px-4 py-3 rounded-lg outline-none"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.primary,
                }}
              />
            </div>

            {/* Minimum Quorum */}
            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                Minimum Votes for Proposals
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={21}
                  step={2}
                  value={minQuorum}
                  onChange={(e) => setMinQuorum(Number(e.target.value))}
                  className="flex-1"
                  style={{ accentColor: COLORS.project.primary }}
                />
                <span
                  className="w-8 text-center font-mono"
                  style={{ color: COLORS.text.primary }}
                >
                  {minQuorum}
                </span>
              </div>
              <div
                className="text-xs mt-1"
                style={{ color: COLORS.text.muted }}
              >
                Proposals need at least {minQuorum} votes to pass
              </div>
            </div>

            {/* Initial Members (optional) */}
            <div>
              <label
                className="block mb-2"
                style={{ color: COLORS.text.secondary, fontSize: '0.875rem' }}
              >
                Initial Members
              </label>
              <div
                className="px-3 py-2 mb-2 rounded-lg text-sm"
                style={{
                  background: `${COLORS.member.primary}15`,
                  border: `1px solid ${COLORS.member.border}`,
                  color: COLORS.member.text,
                }}
              >
                You: {address?.slice(0, 6)}...{address?.slice(-4)} (creator)
              </div>
              {members.map((member, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={member}
                    onChange={(e) => updateMember(i, e.target.value)}
                    placeholder="0x..."
                    className="flex-1 px-3 py-2 rounded-lg outline-none text-sm font-mono"
                    style={{
                      background: COLORS.bg.panel,
                      border: `1px solid ${COLORS.border.subtle}`,
                      color: COLORS.text.primary,
                    }}
                  />
                  <button
                    onClick={() => removeMemberField(i)}
                    className="px-3 rounded-lg"
                    style={{
                      background: COLORS.bg.panel,
                      border: `1px solid ${COLORS.border.subtle}`,
                      color: COLORS.text.muted,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addMemberField}
                className="text-sm"
                style={{ color: COLORS.text.muted }}
              >
                + Add member (optional)
              </button>
            </div>

            {error && (
              <div
                className="p-3 rounded text-sm"
                style={{
                  background: `${COLORS.status.critical}20`,
                  color: COLORS.status.critical,
                }}
              >
                {error}
              </div>
            )}

            {hash && !isSuccess && (
              <div
                className="p-3 rounded text-sm"
                style={{
                  background: `${COLORS.project.primary}20`,
                  color: COLORS.project.text,
                }}
              >
                {isConfirming ? 'Confirming transaction...' : 'Transaction submitted...'}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
                style={{
                  background: COLORS.bg.panel,
                  border: `1px solid ${COLORS.border.subtle}`,
                  color: COLORS.text.secondary,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending || isConfirming || !name.trim()}
                className="flex-1 px-4 py-3 rounded-lg transition-colors"
                style={{
                  background:
                    isPending || isConfirming || !name.trim()
                      ? COLORS.bg.panel
                      : COLORS.project.primary,
                  color: isPending || isConfirming || !name.trim() ? COLORS.text.muted : COLORS.bg.void,
                  cursor: isPending || isConfirming || !name.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? 'Confirm in Wallet...' : isConfirming ? 'Creating...' : 'Create DAO'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
