/**
 * Wagmi config for Metasystem DAO
 */

import { http, createConfig } from 'wagmi';
import { localhost } from 'wagmi/chains';

// Anvil local chain
const anvil = {
  ...localhost,
  id: 31337,
  name: 'Anvil',
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
} as const;

export const config = createConfig({
  chains: [anvil],
  transports: {
    [anvil.id]: http(),
  },
});

// Contract ABIs (minimal - just the functions we need)
export const MetasystemRegistryABI = [
  {
    name: 'mintMembership',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'mintPrice',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
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
    ],
    outputs: [{ type: 'bytes32' }],
  },
] as const;

export const MetasystemDAOABI = [
  // Membership
  {
    name: 'join',
    type: 'function',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'leave',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    name: 'isMember',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'joinCost',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Governance
  {
    name: 'propose',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalType', type: 'uint8' },
      { name: 'title', type: 'string' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'rewardLoop', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'vote',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'proposalId', type: 'uint256' },
      { name: 'support', type: 'bool' },
    ],
    outputs: [],
  },
  // Work
  {
    name: 'claimWork',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'works',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [
      { name: 'id', type: 'bytes32' },
      { name: 'workType', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'claimedBy', type: 'address' },
      { name: 'claimExpiry', type: 'uint256' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'rewardLoop', type: 'uint256' },
      { name: 'proposalId', type: 'uint256' },
    ],
  },
  {
    name: 'workList',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'index', type: 'uint256' }],
    outputs: [{ type: 'bytes32' }],
  },
  {
    name: 'workCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  // Audit - Submit
  {
    name: 'submitForAudit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'workId', type: 'bytes32' },
      { name: 'evidenceHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  // Audit - Automated voting
  {
    name: 'voteAudit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'workId', type: 'bytes32' },
      { name: 'approve', type: 'bool' },
    ],
    outputs: [],
  },
  {
    name: 'autoHasVoted',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'workId', type: 'bytes32' },
      { name: 'voter', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  // Audit - Manual
  {
    name: 'claimManualAudit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'releaseManualAudit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [],
  },
  {
    name: 'submitManualAudit',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'workId', type: 'bytes32' },
      { name: 'approve', type: 'bool' },
      { name: 'notes', type: 'string' },
    ],
    outputs: [],
  },
  // Audit - Finalize
  {
    name: 'finalizeAuditAfterDeadline',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [],
  },
  // Audit - Read state
  {
    name: 'audits',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [
      { name: 'workId', type: 'bytes32' },
      { name: 'evidenceHash', type: 'bytes32' },
      { name: 'worker', type: 'address' },
      { name: 'rewardLoop', type: 'uint256' },
      // Config tuple (flattened)
      { name: 'config_autoWindow', type: 'uint256' },
      { name: 'config_manualWindow', type: 'uint256' },
      { name: 'config_minResponses', type: 'uint256' },
      { name: 'config_consensusBps', type: 'uint256' },
      { name: 'config_autoEnabled', type: 'bool' },
      { name: 'config_manualEnabled', type: 'bool' },
      { name: 'config_manualTriggerBps', type: 'uint256' },
      { name: 'config_autoOpenToNetwork', type: 'bool' },
      { name: 'config_manualOpenToNetwork', type: 'bool' },
      { name: 'config_workerBps', type: 'uint256' },
      { name: 'config_autoPoolBps', type: 'uint256' },
      { name: 'config_manualPoolBps', type: 'uint256' },
      { name: 'config_treasuryBps', type: 'uint256' },
      { name: 'config_escalationType', type: 'uint8' },
      { name: 'config_externalArbiter', type: 'address' },
      // Auto tier
      { name: 'autoDeadline', type: 'uint256' },
      { name: 'autoApprovals', type: 'uint256' },
      { name: 'autoRejections', type: 'uint256' },
      { name: 'autoDecided', type: 'bool' },
      { name: 'autoPassed', type: 'bool' },
      // Manual tier
      { name: 'manualTriggered', type: 'bool' },
      { name: 'manualDeadline', type: 'uint256' },
      { name: 'manualClaimer', type: 'address' },
      { name: 'manualClaimedAt', type: 'uint256' },
      { name: 'manualDecided', type: 'bool' },
      { name: 'manualPassed', type: 'bool' },
      // Outcome
      { name: 'outcome', type: 'uint8' },
    ],
  },
  {
    name: 'getAuditConfig',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      {
        name: 'config',
        type: 'tuple',
        components: [
          { name: 'autoWindow', type: 'uint256' },
          { name: 'manualWindow', type: 'uint256' },
          { name: 'minResponses', type: 'uint256' },
          { name: 'consensusBps', type: 'uint256' },
          { name: 'autoEnabled', type: 'bool' },
          { name: 'manualEnabled', type: 'bool' },
          { name: 'manualTriggerBps', type: 'uint256' },
          { name: 'autoOpenToNetwork', type: 'bool' },
          { name: 'manualOpenToNetwork', type: 'bool' },
          { name: 'workerBps', type: 'uint256' },
          { name: 'autoPoolBps', type: 'uint256' },
          { name: 'manualPoolBps', type: 'uint256' },
          { name: 'treasuryBps', type: 'uint256' },
          { name: 'escalationType', type: 'uint8' },
          { name: 'externalArbiter', type: 'address' },
        ],
      },
    ],
  },
  {
    name: 'getAuditVoters',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'workId', type: 'bytes32' }],
    outputs: [{ type: 'address[]' }],
  },
  // Events
  {
    name: 'AuditRequested',
    type: 'event',
    inputs: [
      { name: 'workId', type: 'bytes32', indexed: true },
      { name: 'worker', type: 'address', indexed: true },
      { name: 'evidenceHash', type: 'bytes32', indexed: false },
      { name: 'autoDeadline', type: 'uint256', indexed: false },
      { name: 'manualTriggered', type: 'bool', indexed: false },
    ],
  },
  {
    name: 'AutomatedVoteCast',
    type: 'event',
    inputs: [
      { name: 'workId', type: 'bytes32', indexed: true },
      { name: 'voter', type: 'address', indexed: true },
      { name: 'approve', type: 'bool', indexed: false },
    ],
  },
  {
    name: 'AuditFinalized',
    type: 'event',
    inputs: [
      { name: 'workId', type: 'bytes32', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
    ],
  },
] as const;
