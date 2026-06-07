/**
 * Identity Sync — Detect and emit identity root changes
 *
 * Periodically computes the identity Merkle root and emits events
 * when it changes. This enables on-chain attestation sync.
 */

import { getChain } from '../coordination/channels/chain.js';
import { collectAllIdentities, buildMerkleTree, getIdentityRoot } from './merkle.js';

let lastKnownRoot: string | null = null;

export interface IdentityRootState {
  root: string;
  leafCount: number;
  changed: boolean;
  computedAt: number;
}

/**
 * Check if identity root has changed since last check.
 * If changed, emits identity:root:changed event.
 */
export async function checkIdentityRoot(): Promise<IdentityRootState> {
  const leaves = collectAllIdentities();
  const tree = buildMerkleTree(leaves);
  const root = tree.root;
  const computedAt = Date.now();

  const changed = lastKnownRoot !== null && lastKnownRoot !== root;

  if (changed) {
    await getChain().append('identity:root:changed', 'system', root, {
      previousRoot: lastKnownRoot,
      newRoot: root,
      leafCount: leaves.length,
      changedAt: computedAt,
    });

    console.log(`[Identity] Root changed: ${lastKnownRoot?.slice(0, 8)}... → ${root.slice(0, 8)}... (${leaves.length} identities)`);
  }

  lastKnownRoot = root;

  return {
    root,
    leafCount: leaves.length,
    changed,
    computedAt,
  };
}

/**
 * Get the current identity root without side effects
 */
export function getCurrentRoot(): string {
  return getIdentityRoot();
}

/**
 * Get the last known root (from cache, not recomputed)
 */
export function getLastKnownRoot(): string | null {
  return lastKnownRoot;
}

/**
 * Force refresh of the cached root
 */
export async function refreshRoot(): Promise<IdentityRootState> {
  lastKnownRoot = null; // Force detection as "new"
  return checkIdentityRoot();
}

/**
 * Get identity root history from chain events
 */
export async function getIdentityRootHistory(): Promise<Array<{
  root: string;
  previousRoot: string | null;
  leafCount: number;
  changedAt: number;
}>> {
  const events = await getChain().recall({ type: 'identity:root:changed' });

  return events.map(e => {
    const payload = e.payload as {
      previousRoot: string | null;
      newRoot: string;
      leafCount: number;
      changedAt: number;
    };
    return {
      root: payload.newRoot,
      previousRoot: payload.previousRoot,
      leafCount: payload.leafCount,
      changedAt: payload.changedAt,
    };
  });
}

/**
 * Get pending root commits (roots that haven't been committed on-chain)
 */
export async function getPendingRootCommits(): Promise<Array<{
  root: string;
  leafCount: number;
  changedAt: number;
}>> {
  const rootChanges = await getChain().recall({ type: 'identity:root:changed' });
  const rootCommits = await getChain().recall({ type: 'identity:root:committed' });

  const committedRoots = new Set(rootCommits.map(e => e.subject));

  return rootChanges
    .filter(e => !committedRoots.has((e.payload as { newRoot: string }).newRoot))
    .map(e => {
      const payload = e.payload as {
        newRoot: string;
        leafCount: number;
        changedAt: number;
      };
      return {
        root: payload.newRoot,
        leafCount: payload.leafCount,
        changedAt: payload.changedAt,
      };
    });
}

/**
 * Mark a root as committed on-chain
 * Called after manual on-chain transaction
 */
export async function markRootCommitted(root: string, txHash: string): Promise<void> {
  await getChain().append('identity:root:committed', 'system', root, {
    root,
    txHash,
    committedAt: Date.now(),
  });

  console.log(`[Identity] Root committed on-chain: ${root.slice(0, 8)}... (tx: ${txHash.slice(0, 10)}...)`);
}
