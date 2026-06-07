/**
 * Bridge — Off-chain to On-chain Verification
 *
 * τ determines verification strategy:
 * - τ ≥ 0.99: Single verification, fully replayable
 * - τ ≥ 0.90: Single verification, challenge window (τ-scaled)
 * - τ < 0.90: Consensus (simple majority)
 *
 * Global merkle tree. One root. One contract.
 */

import { createHash, randomUUID } from 'crypto';
import { getChain } from '../../coordination/channels/chain.js';
import type { Scope, DynamicsParameters } from './types.js';
import { DEFAULT_PARAMETERS } from './types.js';
import { getAggregatePrecision, getPrecision } from './precision.js';
import { parseVerifier } from '../verify/registry.js';

// =============================================================================
// Verification Strategy
// =============================================================================

export type VerificationStrategy = 'single' | 'optimistic' | 'consensus';

export interface StrategyResult {
  strategy: VerificationStrategy;
  τ: number;
  challengeWindow: number | null;  // seconds, null for single/consensus
  requiredVerifiers: number;
}

const TAU_SINGLE = 0.99;
const TAU_OPTIMISTIC = 0.90;
const MIN_WINDOW = 3600;   // 1 hour
const MAX_WINDOW = 86400;  // 24 hours

export function getVerificationStrategy(τ: number): StrategyResult {
  if (τ >= TAU_SINGLE) {
    return {
      strategy: 'single',
      τ,
      challengeWindow: null,
      requiredVerifiers: 1,
    };
  }

  if (τ >= TAU_OPTIMISTIC) {
    const challengeWindow = getChallengeWindow(τ);
    return {
      strategy: 'optimistic',
      τ,
      challengeWindow,
      requiredVerifiers: 1,
    };
  }

  // Consensus: more verifiers for lower τ
  const requiredVerifiers = Math.ceil(3 + (TAU_OPTIMISTIC - τ) * 10);
  return {
    strategy: 'consensus',
    τ,
    challengeWindow: null,
    requiredVerifiers,
  };
}

export function getChallengeWindow(τ: number): number {
  // Higher τ = shorter window
  // τ=0.90 → 24h, τ=0.99 → 1h
  const scale = Math.max(0, Math.min(1, (TAU_SINGLE - τ) / (TAU_SINGLE - TAU_OPTIMISTIC)));
  return MIN_WINDOW + scale * (MAX_WINDOW - MIN_WINDOW);
}

// =============================================================================
// Work Proof
// =============================================================================

export interface WorkProof {
  workId: string;
  nodeId: string;
  commitHash: string;           // git commit or content hash
  outputs: OutputHash[];
  exitCode: number;
  executedAt: number;
  duration: number;
  signature?: string;           // node's signature over proof
}

export interface OutputHash {
  path: string;
  hash: string;
  size: number;
}

export function hashWorkProof(proof: WorkProof): string {
  const data = JSON.stringify({
    workId: proof.workId,
    nodeId: proof.nodeId,
    commitHash: proof.commitHash,
    outputs: proof.outputs,
    exitCode: proof.exitCode,
  });
  return createHash('sha256').update(data).digest('hex');
}

// =============================================================================
// Credit Leaf (Merkle Tree Entry)
// =============================================================================

export interface CreditLeaf {
  id: string;
  workId: string;
  nodeId: string;
  amount: bigint;
  proofHash: string;
  tokenId: string;              // ERC-1155 tokenId (hex string for uint256)
  hubId?: string;
  daoAddress?: string;
  verificationStrategy: VerificationStrategy;
  τ: number;
  challengeWindow: number | null;
  challengeDeadline: number | null;  // timestamp when challenge window closes
  status: 'pending' | 'challengeable' | 'confirmed' | 'disputed' | 'minted';
  createdAt: number;
}

/**
 * Hash a credit leaf for Merkle tree.
 * Must match the on-chain verification:
 *   keccak256(abi.encodePacked(address, tokenId, amount))
 */
export function hashCreditLeaf(leaf: CreditLeaf): string {
  // For on-chain compatibility, we hash (nodeId, tokenId, amount)
  // Note: nodeId here should be the Ethereum address of the worker
  const data = JSON.stringify({
    nodeId: leaf.nodeId,
    tokenId: leaf.tokenId,
    amount: leaf.amount.toString(),
  });
  return createHash('sha256').update(data).digest('hex');
}

// =============================================================================
// Merkle Tree (Incremental)
// =============================================================================

interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  leafIndex?: number;
}

class IncrementalMerkleTree {
  private leaves: string[] = [];
  private root: string = '';

  add(leafHash: string): number {
    const index = this.leaves.length;
    this.leaves.push(leafHash);
    this.root = this.computeRoot();
    return index;
  }

  getRoot(): string {
    return this.root;
  }

  getLeafCount(): number {
    return this.leaves.length;
  }

  getProof(index: number): string[] {
    if (index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of bounds`);
    }

    const proof: string[] = [];
    let currentIndex = index;
    let level = [...this.leaves];

    while (level.length > 1) {
      const nextLevel: string[] = [];
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      if (siblingIndex < level.length) {
        proof.push(level[siblingIndex]);
      }

      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? left;
        nextLevel.push(this.hashPair(left, right));
      }

      currentIndex = Math.floor(currentIndex / 2);
      level = nextLevel;
    }

    return proof;
  }

  verify(leafHash: string, index: number, proof: string[]): boolean {
    let hash = leafHash;
    let currentIndex = index;

    for (const sibling of proof) {
      if (currentIndex % 2 === 0) {
        hash = this.hashPair(hash, sibling);
      } else {
        hash = this.hashPair(sibling, hash);
      }
      currentIndex = Math.floor(currentIndex / 2);
    }

    return hash === this.root;
  }

  private computeRoot(): string {
    if (this.leaves.length === 0) return '';
    if (this.leaves.length === 1) return this.leaves[0];

    let level = [...this.leaves];

    while (level.length > 1) {
      const nextLevel: string[] = [];
      for (let i = 0; i < level.length; i += 2) {
        const left = level[i];
        const right = level[i + 1] ?? left;
        nextLevel.push(this.hashPair(left, right));
      }
      level = nextLevel;
    }

    return level[0];
  }

  private hashPair(a: string, b: string): string {
    return createHash('sha256').update(a + b).digest('hex');
  }

  serialize(): { leaves: string[]; root: string } {
    return { leaves: [...this.leaves], root: this.root };
  }

  static deserialize(data: { leaves: string[]; root: string }): IncrementalMerkleTree {
    const tree = new IncrementalMerkleTree();
    for (const leaf of data.leaves) {
      tree.add(leaf);
    }
    return tree;
  }
}

// Global merkle tree
const globalTree = new IncrementalMerkleTree();
const creditLeaves = new Map<string, CreditLeaf>();
const leafIndexes = new Map<string, number>();

// =============================================================================
// Credit Creation
// =============================================================================

export async function createCredit(
  workId: string,
  nodeId: string,
  amount: bigint,
  workProof: WorkProof,
  scope: Scope,
  tokenId: string,
  hubId?: string,
  daoAddress?: string,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<CreditLeaf> {
  const τ = await getAggregatePrecision(scope);
  const strategyResult = getVerificationStrategy(τ);

  const proofHash = hashWorkProof(workProof);
  const now = Date.now();

  const leaf: CreditLeaf = {
    id: `credit_${randomUUID().slice(0, 8)}`,
    workId,
    nodeId,
    amount,
    proofHash,
    tokenId,
    hubId,
    daoAddress,
    verificationStrategy: strategyResult.strategy,
    τ,
    challengeWindow: strategyResult.challengeWindow,
    challengeDeadline: strategyResult.challengeWindow
      ? now + strategyResult.challengeWindow * 1000
      : null,
    status: strategyResult.strategy === 'single' ? 'confirmed' : 'challengeable',
    createdAt: now,
  };

  // Add to merkle tree
  const leafHash = hashCreditLeaf(leaf);
  const index = globalTree.add(leafHash);

  creditLeaves.set(leaf.id, leaf);
  leafIndexes.set(leaf.id, index);

  // Emit event
  await getChain().append('credit:created', 'bridge', workId, {
    creditId: leaf.id,
    nodeId,
    amount: amount.toString(),
    proofHash,
    strategy: strategyResult.strategy,
    τ,
    challengeDeadline: leaf.challengeDeadline,
    merkleRoot: globalTree.getRoot(),
    leafIndex: index,
  });

  return leaf;
}

// =============================================================================
// Challenge System
// =============================================================================

export interface Challenge {
  id: string;
  creditId: string;
  challengerId: string;
  originalProof: WorkProof;
  challengerProof: {
    outputs: OutputHash[];
    exitCode: number;
    timestamp: number;
    signatures: string[];  // signatures from nodes that agree with challenger
  };
  status: 'pending' | 'succeeded' | 'failed';
  createdAt: number;
  resolvedAt?: number;
}

const challenges = new Map<string, Challenge>();

export async function submitChallenge(
  creditId: string,
  challengerId: string,
  originalProof: WorkProof,
  challengerOutputs: OutputHash[],
  challengerExitCode: number,
  supportingSignatures: string[]
): Promise<Challenge> {
  const credit = creditLeaves.get(creditId);
  if (!credit) {
    throw new Error(`Credit not found: ${creditId}`);
  }

  if (credit.status !== 'challengeable') {
    throw new Error(`Credit not challengeable: status=${credit.status}`);
  }

  if (credit.challengeDeadline && Date.now() > credit.challengeDeadline) {
    throw new Error('Challenge window expired');
  }

  const challenge: Challenge = {
    id: `challenge_${randomUUID().slice(0, 8)}`,
    creditId,
    challengerId,
    originalProof,
    challengerProof: {
      outputs: challengerOutputs,
      exitCode: challengerExitCode,
      timestamp: Date.now(),
      signatures: supportingSignatures,
    },
    status: 'pending',
    createdAt: Date.now(),
  };

  challenges.set(challenge.id, challenge);

  // Emit event
  await getChain().append('credit:challenged', 'bridge', creditId, {
    challengeId: challenge.id,
    challengerId,
    creditId,
  });

  // Auto-resolve based on supporting signatures
  await resolveChallenge(challenge.id);

  return challenge;
}

async function resolveChallenge(challengeId: string): Promise<void> {
  const challenge = challenges.get(challengeId);
  if (!challenge || challenge.status !== 'pending') return;

  const credit = creditLeaves.get(challenge.creditId);
  if (!credit) return;

  // Simple majority: if challenger has N/2 + 1 signatures, challenge succeeds
  const requiredSignatures = Math.floor(3 / 2) + 1; // Start with 3 verifiers
  const hasEnoughSupport = challenge.challengerProof.signatures.length >= requiredSignatures;

  if (hasEnoughSupport) {
    challenge.status = 'succeeded';
    credit.status = 'disputed';

    await getChain().append('credit:disputed', 'bridge', challenge.creditId, {
      challengeId,
      creditId: challenge.creditId,
      challengerId: challenge.challengerId,
      amount: credit.amount.toString(),
    });
  } else {
    challenge.status = 'failed';
    // Credit remains challengeable until deadline

    await getChain().append('challenge:failed', 'bridge', challengeId, {
      challengeId,
      creditId: challenge.creditId,
      reason: 'insufficient_signatures',
    });
  }

  challenge.resolvedAt = Date.now();
}

// =============================================================================
// Credit Confirmation
// =============================================================================

export async function confirmCredits(): Promise<CreditLeaf[]> {
  const now = Date.now();
  const confirmed: CreditLeaf[] = [];

  for (const credit of creditLeaves.values()) {
    if (credit.status !== 'challengeable') continue;
    if (credit.challengeDeadline && now < credit.challengeDeadline) continue;

    // Challenge window passed, confirm
    credit.status = 'confirmed';
    confirmed.push(credit);

    await getChain().append('credit:confirmed', 'bridge', credit.id, {
      creditId: credit.id,
      workId: credit.workId,
      nodeId: credit.nodeId,
      amount: credit.amount.toString(),
    });
  }

  return confirmed;
}

// =============================================================================
// Mint Bundle (User-Triggered)
// =============================================================================

export interface MintBundle {
  id: string;
  nodeId: string;
  credits: Array<{
    creditId: string;
    amount: bigint;
    leafIndex: number;
    proof: string[];
  }>;
  totalAmount: bigint;
  merkleRoot: string;
  createdAt: number;
}

export function prepareMintBundle(nodeId: string): MintBundle {
  const nodeCredits = Array.from(creditLeaves.values())
    .filter(c => c.nodeId === nodeId && c.status === 'confirmed');

  if (nodeCredits.length === 0) {
    throw new Error('No confirmed credits to mint');
  }

  const credits = nodeCredits.map(credit => {
    const index = leafIndexes.get(credit.id)!;
    const proof = globalTree.getProof(index);
    return {
      creditId: credit.id,
      amount: credit.amount,
      leafIndex: index,
      proof,
    };
  });

  const totalAmount = credits.reduce((sum, c) => sum + c.amount, 0n);

  return {
    id: `bundle_${randomUUID().slice(0, 8)}`,
    nodeId,
    credits,
    totalAmount,
    merkleRoot: globalTree.getRoot(),
    createdAt: Date.now(),
  };
}

export async function markCreditsMinted(creditIds: string[]): Promise<void> {
  for (const id of creditIds) {
    const credit = creditLeaves.get(id);
    if (credit && credit.status === 'confirmed') {
      credit.status = 'minted';
    }
  }

  await getChain().append('credits:minted', 'bridge', creditIds.join(','), {
    creditIds,
    merkleRoot: globalTree.getRoot(),
  });
}

// =============================================================================
// Queries
// =============================================================================

export function getCredit(id: string): CreditLeaf | undefined {
  return creditLeaves.get(id);
}

export function getCreditsByNode(nodeId: string): CreditLeaf[] {
  return Array.from(creditLeaves.values()).filter(c => c.nodeId === nodeId);
}

export function getPendingCredits(nodeId?: string): CreditLeaf[] {
  return Array.from(creditLeaves.values())
    .filter(c => c.status === 'confirmed' || c.status === 'challengeable')
    .filter(c => !nodeId || c.nodeId === nodeId);
}

export function getMerkleRoot(): string {
  return globalTree.getRoot();
}

export function getMerkleProof(creditId: string): string[] | null {
  const index = leafIndexes.get(creditId);
  if (index === undefined) return null;
  return globalTree.getProof(index);
}

export function verifyMerkleProof(creditId: string, proof: string[]): boolean {
  const credit = creditLeaves.get(creditId);
  if (!credit) return false;

  const index = leafIndexes.get(creditId);
  if (index === undefined) return false;

  const leafHash = hashCreditLeaf(credit);
  return globalTree.verify(leafHash, index, proof);
}

// =============================================================================
// Reset (Testing)
// =============================================================================

export function resetBridge(): void {
  creditLeaves.clear();
  leafIndexes.clear();
  challenges.clear();
  // Note: Can't reset globalTree without recreating it
}
