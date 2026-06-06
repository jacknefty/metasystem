/**
 * Contract Bridge — Multi-chain Integration
 *
 * Supports deployment to multiple chains:
 * - Ethereum mainnet (primary)
 * - Base, Arbitrum, etc. (future)
 *
 * Credits specify which chain to mint on.
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getChain } from '../coordination/channels/chain.js';
import { getMerkleRoot, getMerkleProof, getCredit, markCreditsMinted } from '../control/dynamics/bridge.js';
import { paths } from '../identity/paths.js';

// =============================================================================
// Configuration
// =============================================================================

export interface ChainConfig {
  chainId: string;             // 'ethereum', 'base', 'arbitrum', etc.
  networkId: number;           // EVM chain ID (1, 8453, 42161, etc.)
  rpcUrl: string;
  contractAddress?: string;    // Set after deployment
  explorerUrl: string;
  testnet?: {
    networkId: number;
    rpcUrl: string;
    contractAddress?: string;
    explorerUrl: string;
  };
}

export interface BridgeConfig {
  chains: Record<string, ChainConfig>;
  primaryChain: string;        // 'ethereum' for launch
  operatorKey?: string;        // Server-side only
}

const DEFAULT_CHAINS: Record<string, ChainConfig> = {
  local: {
    chainId: 'local',
    networkId: 31337,
    rpcUrl: 'http://127.0.0.1:8545',
    explorerUrl: '',
    testnet: {
      networkId: 31337,
      rpcUrl: 'http://127.0.0.1:8545',
      explorerUrl: '',
    },
  },
  ethereum: {
    chainId: 'ethereum',
    networkId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/',
    explorerUrl: 'https://etherscan.io',
    testnet: {
      networkId: 11155111,
      rpcUrl: 'https://sepolia.infura.io/v3/',
      explorerUrl: 'https://sepolia.etherscan.io',
    },
  },
  base: {
    chainId: 'base',
    networkId: 8453,
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
    testnet: {
      networkId: 84532,
      rpcUrl: 'https://sepolia.base.org',
      explorerUrl: 'https://sepolia.basescan.org',
    },
  },
  arbitrum: {
    chainId: 'arbitrum',
    networkId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    explorerUrl: 'https://arbiscan.io',
    testnet: {
      networkId: 421614,
      rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
      explorerUrl: 'https://sepolia.arbiscan.io',
    },
  },
};

let bridgeConfig: BridgeConfig = {
  chains: DEFAULT_CHAINS,
  primaryChain: 'ethereum',
};

// =============================================================================
// Config Management
// =============================================================================

function getConfigPath(): string {
  return paths.network.bridgeConfig();
}

export function loadBridgeConfig(): BridgeConfig {
  const path = getConfigPath();
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      bridgeConfig = { ...bridgeConfig, ...data };
    } catch {
      // Use default
    }
  }
  return bridgeConfig;
}

export function saveBridgeConfig(): void {
  const path = getConfigPath();
  writeFileSync(path, JSON.stringify(bridgeConfig, null, 2));
}

export function getBridgeConfig(): BridgeConfig {
  return bridgeConfig;
}

export function setBridgeConfig(config: Partial<BridgeConfig>): void {
  bridgeConfig = { ...bridgeConfig, ...config };
  saveBridgeConfig();
}

export function setChainConfig(chainId: string, config: Partial<ChainConfig>): void {
  bridgeConfig.chains[chainId] = {
    ...DEFAULT_CHAINS[chainId],
    ...bridgeConfig.chains[chainId],
    ...config,
  };
  saveBridgeConfig();
}

export function setContractAddress(chainId: string, address: string, testnet: boolean = false): void {
  const chain = bridgeConfig.chains[chainId];
  if (!chain) {
    throw new Error(`Unknown chain: ${chainId}`);
  }

  if (testnet && chain.testnet) {
    chain.testnet.contractAddress = address;
  } else {
    chain.contractAddress = address;
  }
  saveBridgeConfig();
}

export function getChainConfig(chainId: string, testnet: boolean = false): ChainConfig & { rpcUrl: string; contractAddress?: string } {
  const chain = bridgeConfig.chains[chainId];
  if (!chain) {
    throw new Error(`Unknown chain: ${chainId}`);
  }

  if (testnet && chain.testnet) {
    return {
      ...chain,
      networkId: chain.testnet.networkId,
      rpcUrl: chain.testnet.rpcUrl,
      contractAddress: chain.testnet.contractAddress,
      explorerUrl: chain.testnet.explorerUrl,
    };
  }

  return chain;
}

export function listChains(): string[] {
  return Object.keys(bridgeConfig.chains);
}

export function getPrimaryChain(): string {
  return bridgeConfig.primaryChain;
}

// =============================================================================
// Root Management
// =============================================================================

export interface RootCommitment {
  root: string;
  chainId: string;
  testnet: boolean;
  leafCount: number;
  committedAt: number;
  txHash?: string;
}

const committedRoots = new Map<string, RootCommitment>();

export async function prepareRootCommit(chainId?: string): Promise<{
  root: string;
  leafCount: number;
  pendingAmount: bigint;
  chainId: string;
}> {
  const root = getMerkleRoot();
  if (!root) {
    throw new Error('No merkle root available');
  }

  const { getPendingCredits } = await import('../control/dynamics/bridge.js');
  const pending = getPendingCredits();
  const pendingAmount = pending.reduce((sum, c) => sum + c.amount, 0n);

  return {
    root: '0x' + root,
    leafCount: pending.length,
    pendingAmount,
    chainId: chainId ?? bridgeConfig.primaryChain,
  };
}

export async function recordRootCommit(
  root: string,
  chainId: string,
  txHash: string,
  testnet: boolean = false
): Promise<void> {
  const commitment: RootCommitment = {
    root,
    chainId,
    testnet,
    leafCount: 0,
    committedAt: Date.now(),
    txHash,
  };

  const key = `${chainId}:${testnet ? 'testnet' : 'mainnet'}:${root}`;
  committedRoots.set(key, commitment);

  await getChain().append('root:committed', 'contract', root, {
    root,
    chainId,
    testnet,
    txHash,
  });
}

export function isRootCommitted(root: string, chainId: string, testnet: boolean = false): boolean {
  const key = `${chainId}:${testnet ? 'testnet' : 'mainnet'}:${root}`;
  return committedRoots.has(key);
}

// =============================================================================
// Mint Preparation
// =============================================================================

export interface MintParams {
  chainId: string;
  testnet: boolean;
  contractAddress: string;
  root: string;
  leaf: string;
  proof: string[];
  index: number;
  amount: string;
}

export async function prepareMintParams(
  creditId: string,
  userAddress: string,
  chainId?: string,
  testnet: boolean = false
): Promise<MintParams> {
  const credit = getCredit(creditId);
  if (!credit) {
    throw new Error(`Credit not found: ${creditId}`);
  }

  if (credit.status !== 'confirmed') {
    throw new Error(`Credit not confirmed: status=${credit.status}`);
  }

  const proof = getMerkleProof(creditId);
  if (!proof) {
    throw new Error(`Proof not found for credit: ${creditId}`);
  }

  const targetChain = chainId ?? bridgeConfig.primaryChain;
  const chainConfig = getChainConfig(targetChain, testnet);

  if (!chainConfig.contractAddress) {
    throw new Error(`No contract deployed on ${targetChain}${testnet ? ' testnet' : ''}`);
  }

  const leaf = computeLeaf(userAddress, credit.amount);

  return {
    chainId: targetChain,
    testnet,
    contractAddress: chainConfig.contractAddress,
    root: '0x' + getMerkleRoot(),
    leaf: '0x' + leaf,
    proof: proof.map(p => '0x' + p),
    index: 0,
    amount: credit.amount.toString(),
  };
}

function computeLeaf(address: string, amount: bigint): string {
  const addressBytes = Buffer.from(address.slice(2).padStart(40, '0'), 'hex');
  const amountBytes = Buffer.alloc(32);
  const amountHex = amount.toString(16).padStart(64, '0');
  Buffer.from(amountHex, 'hex').copy(amountBytes);

  const packed = Buffer.concat([addressBytes, amountBytes]);
  return createHash('sha256').update(packed).digest('hex');
}

// =============================================================================
// Mint Confirmation
// =============================================================================

export async function confirmMint(
  creditIds: string[],
  chainId: string,
  txHash: string,
  testnet: boolean = false
): Promise<void> {
  await markCreditsMinted(creditIds);

  await getChain().append('mint:confirmed', 'contract', txHash, {
    creditIds,
    chainId,
    testnet,
    txHash,
  });
}

// =============================================================================
// Contract Interaction
// =============================================================================

export interface ContractBridge {
  chainId: string;
  testnet: boolean;
  commitRoot(root: string): Promise<string>;
  mint(params: MintParams): Promise<string>;
  isClaimed(leaf: string): Promise<boolean>;
  getRootTimestamp(root: string): Promise<number>;
}

export async function createContractBridge(
  chainId: string,
  testnet: boolean = false
): Promise<ContractBridge> {
  const chainConfig = getChainConfig(chainId, testnet);

  if (!chainConfig.contractAddress) {
    throw new Error(`No contract deployed on ${chainId}${testnet ? ' testnet' : ''}`);
  }

  const { ethers } = await import('ethers');

  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

  const abi = [
    'function commitRoot(bytes32 root) external',
    'function mint(bytes32 root, bytes32 leaf, bytes32[] calldata proof, uint256 index, uint256 amount) external',
    'function claimed(bytes32 leaf) view returns (bool)',
    'function roots(bytes32 root) view returns (uint256)',
    'event RootCommitted(bytes32 indexed root, uint256 timestamp)',
    'event CreditMinted(address indexed to, uint256 amount, bytes32 indexed leaf)',
  ];

  const contract = new ethers.Contract(chainConfig.contractAddress, abi, provider);

  return {
    chainId,
    testnet,

    async commitRoot(root: string): Promise<string> {
      if (!bridgeConfig.operatorKey) {
        throw new Error('Operator key required for commitRoot');
      }
      const wallet = new ethers.Wallet(bridgeConfig.operatorKey, provider);
      const connectedContract = contract.connect(wallet);
      const tx = await connectedContract.getFunction('commitRoot')(root);
      const receipt = await tx.wait();
      return receipt.hash;
    },

    async mint(params: MintParams): Promise<string> {
      const mintFn = contract.getFunction('mint');
      const tx = await mintFn.populateTransaction(
        params.root,
        params.leaf,
        params.proof,
        params.index,
        params.amount
      );
      return JSON.stringify(tx);
    },

    async isClaimed(leaf: string): Promise<boolean> {
      const claimedFn = contract.getFunction('claimed');
      return claimedFn(leaf);
    },

    async getRootTimestamp(root: string): Promise<number> {
      const rootsFn = contract.getFunction('roots');
      const timestamp = await rootsFn(root);
      return Number(timestamp);
    },
  };
}

// =============================================================================
// Deployment Tracking
// =============================================================================

export interface Deployment {
  chainId: string;
  testnet: boolean;
  contractAddress: string;
  deployerAddress: string;
  txHash: string;
  deployedAt: number;
}

const deployments: Deployment[] = [];

export function recordDeployment(deployment: Deployment): void {
  deployments.push(deployment);

  // Update config with contract address
  setContractAddress(deployment.chainId, deployment.contractAddress, deployment.testnet);
}

export function getDeployments(): Deployment[] {
  return [...deployments];
}

export function getDeployment(chainId: string, testnet: boolean = false): Deployment | undefined {
  return deployments.find(d => d.chainId === chainId && d.testnet === testnet);
}

// Load config on module init
loadBridgeConfig();
