/**
 * Auto-Commit Merkle Root
 *
 * Periodically commits pending credits to a Merkle root.
 * Credit flow: credit:earned → credit:committed → merkle:committed → [on-chain] → minted
 */

import { getChain } from '../coordination/channels/chain.js';
import { getPendingCredits as getBridgePendingCredits, getMerkleRoot } from '../control/dynamics/bridge.js';
import type { EventPayloads } from '../coordination/channels/events.js';
import { createHash } from 'crypto';

const COMMIT_THRESHOLD = 10;      // Commit when this many credits pending
const COMMIT_INTERVAL = 60_000;   // Or every 60 seconds if any pending

let lastCommitTime = 0;

export interface CommitResult {
  committed: boolean;
  creditCount: number;
  root?: string;
}

/**
 * Check if we should commit pending credits to a Merkle root
 */
export async function maybeCommitMerkleRoot(): Promise<CommitResult> {
  const pending = await getUncommittedCredits();

  if (pending.length === 0) {
    return { committed: false, creditCount: 0 };
  }

  const now = Date.now();
  const shouldCommit =
    pending.length >= COMMIT_THRESHOLD ||
    (pending.length > 0 && now - lastCommitTime > COMMIT_INTERVAL);

  if (!shouldCommit) {
    return { committed: false, creditCount: pending.length };
  }

  // Build Merkle root from pending credits
  const leaves = pending.map(c => c.proofHash);
  const root = computeMerkleRoot(leaves);

  // Record commitment
  await getChain().append('merkle:committed', 'system', root, {
    creditIds: pending.map(c => c.id),
    root,
    leafCount: pending.length,
    committedAt: now,
  });

  // Mark each credit as committed to this root
  for (const credit of pending) {
    await markCreditCommitted(credit.id, root);
  }

  lastCommitTime = now;

  return {
    committed: true,
    creditCount: pending.length,
    root,
  };
}

/**
 * Get credits that have been earned but not yet committed to a Merkle root
 */
async function getUncommittedCredits(): Promise<Array<{
  id: string;
  workId: string;
  nodeId: string;
  proofHash: string;
}>> {
  const earned = await getChain().recall({ type: 'credit:earned' });
  const committed = await getChain().recall({ type: 'credit:committed' });

  const committedIds = new Set(committed.map(e => e.subject));

  return earned
    .filter(e => !committedIds.has(`credit_${(e.payload as EventPayloads['credit:earned']).workId}`))
    .map(e => {
      const p = e.payload as EventPayloads['credit:earned'];
      return {
        id: `credit_${p.workId}`,
        workId: p.workId,
        nodeId: p.nodeId,
        proofHash: p.proofHash,
      };
    });
}

/**
 * Mark a credit as committed to a Merkle root
 */
async function markCreditCommitted(creditId: string, merkleRoot: string): Promise<void> {
  await getChain().append('credit:committed', 'system', creditId, {
    merkleRoot,
    committedAt: Date.now(),
  });
}

/**
 * Compute Merkle root from leaf hashes
 */
function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) return '';
  if (leaves.length === 1) return leaves[0];

  let level = [...leaves];

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      nextLevel.push(hashPair(left, right));
    }
    level = nextLevel;
  }

  return level[0];
}

function hashPair(a: string, b: string): string {
  return createHash('sha256').update(a + b).digest('hex');
}

/**
 * Get the latest committed Merkle root
 */
export async function getLatestMerkleRoot(): Promise<{
  root: string;
  creditCount: number;
  committedAt: number;
} | null> {
  const events = await getChain().recall({ type: 'merkle:committed' });
  if (events.length === 0) return null;

  const latest = events[events.length - 1];
  const payload = latest.payload as EventPayloads['merkle:committed'];

  return {
    root: payload.root,
    creditCount: payload.leafCount,
    committedAt: payload.committedAt,
  };
}

/**
 * Get all uncommitted credit count (for display)
 */
export async function getUncommittedCreditCount(): Promise<number> {
  const pending = await getUncommittedCredits();
  return pending.length;
}
