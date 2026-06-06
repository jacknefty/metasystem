/**
 * WalletConnect — Connect wallet and show membership status
 */

import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { parseEther } from 'viem';
import { COLORS } from '../design-system';
import { fetchNetworkConfig } from '../api/client';
import { MetasystemRegistryABI } from '../wagmi';

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [registryAddress, setRegistryAddress] = useState<`0x${string}` | null>(null);
  const [loopBalance] = useState('0'); // TODO: read from LOOP token contract
  const [showMintModal, setShowMintModal] = useState(false);

  // Fetch registry address
  useEffect(() => {
    fetchNetworkConfig().then((config) => {
      if (config) {
        setRegistryAddress(config.registryAddress as `0x${string}`);
      }
    });
  }, []);

  // Read membership status directly from contract
  const { data: isMember, refetch: refetchMembership } = useReadContract({
    address: registryAddress ?? undefined,
    abi: MetasystemRegistryABI,
    functionName: 'isMember',
    args: address ? [address] : undefined,
    query: {
      enabled: !!registryAddress && !!address,
    },
  });

  // Refetch membership after successful mint
  useEffect(() => {
    if (isSuccess) {
      refetchMembership();
    }
  }, [isSuccess, refetchMembership]);

  const handleConnect = () => {
    connect({ connector: injected() });
  };

  const handleMint = () => {
    if (!registryAddress) return;

    writeContract({
      address: registryAddress,
      abi: MetasystemRegistryABI,
      functionName: 'mintMembership',
      value: parseEther('0.1'),
    });
  };

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <button
        onClick={handleConnect}
        className="px-3 py-1.5 rounded text-sm font-medium"
        style={{
          background: COLORS.s5.primary,
          color: COLORS.text.primary,
        }}
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Membership badge */}
      {isMember ? (
        <div
          className="px-2 py-1 rounded text-xs font-medium"
          style={{
            background: 'rgba(34, 197, 94, 0.2)',
            color: '#22c55e',
            border: '1px solid rgba(34, 197, 94, 0.3)',
          }}
        >
          Member
        </div>
      ) : (
        <button
          onClick={() => setShowMintModal(true)}
          className="px-2 py-1 rounded text-xs font-medium"
          style={{
            background: 'rgba(251, 191, 36, 0.2)',
            color: '#fbbf24',
            border: '1px solid rgba(251, 191, 36, 0.3)',
          }}
        >
          Join Metasystem
        </button>
      )}

      {/* LOOP balance */}
      {isMember && parseFloat(loopBalance) > 0 && (
        <div
          className="px-2 py-1 rounded text-xs font-mono"
          style={{
            background: COLORS.bg.elevated,
            color: COLORS.text.secondary,
          }}
        >
          {parseFloat(loopBalance).toFixed(2)} LOOP
        </div>
      )}

      {/* Address + disconnect */}
      <button
        onClick={() => disconnect()}
        className="px-3 py-1.5 rounded text-sm font-mono"
        style={{
          background: COLORS.bg.elevated,
          color: COLORS.text.secondary,
          border: `1px solid ${COLORS.border.subtle}`,
        }}
      >
        {truncateAddress(address!)}
      </button>

      {/* Mint modal */}
      {showMintModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0, 0, 0, 0.8)' }}
          onClick={() => setShowMintModal(false)}
        >
          <div
            className="p-6 rounded-lg max-w-sm w-full mx-4"
            style={{
              background: COLORS.bg.surface,
              border: `1px solid ${COLORS.border.subtle}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-medium mb-4" style={{ color: COLORS.text.primary }}>
              Join Metasystem DAO
            </h3>

            <p className="text-sm mb-4" style={{ color: COLORS.text.secondary }}>
              Mint a Metasystem membership NFT to join the network. This allows you to create
              and join DAOs, participate in governance, and earn LOOP tokens.
            </p>

            <div
              className="p-3 rounded mb-4 text-sm"
              style={{
                background: COLORS.bg.elevated,
                color: COLORS.text.muted,
              }}
            >
              Mint Price: <span style={{ color: COLORS.text.primary }}>0.1 ETH</span>
            </div>

            {error && (
              <div
                className="p-3 rounded mb-4 text-sm"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                }}
              >
                {error.message.slice(0, 100)}
              </div>
            )}

            {isSuccess && (
              <div
                className="p-3 rounded mb-4 text-sm"
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  color: '#22c55e',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                }}
              >
                Membership minted! Welcome to Metasystem.
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowMintModal(false)}
                className="flex-1 px-4 py-2 rounded text-sm"
                style={{
                  background: COLORS.bg.elevated,
                  color: COLORS.text.secondary,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMint}
                disabled={isPending || isConfirming || isSuccess}
                className="flex-1 px-4 py-2 rounded text-sm font-medium"
                style={{
                  background: isPending || isConfirming ? COLORS.bg.elevated : COLORS.s5.primary,
                  color: COLORS.text.primary,
                  opacity: isPending || isConfirming ? 0.7 : 1,
                }}
              >
                {isPending ? 'Confirm in wallet...' : isConfirming ? 'Minting...' : isSuccess ? 'Done!' : 'Mint Membership'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
