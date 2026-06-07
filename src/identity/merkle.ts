/**
 * Identity Merkle Tree
 *
 * Builds merkle tree of all identities for on-chain verification.
 */

import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { paths } from './paths.js';
import { loadIdentity, computeAttestation } from './contract.js';

export interface MerkleLeaf {
  id: string;
  docHash: string;
  leaf: string;
}

export interface MerkleTree {
  root: string;
  leaves: MerkleLeaf[];
  proofs: Map<string, string[]>;
}

function hash(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function hashPair(a: string, b: string): string {
  const sorted = a < b ? a + b : b + a;
  return hash(sorted);
}

export function collectAllIdentities(): MerkleLeaf[] {
  const leaves: MerkleLeaf[] = [];

  // DAO identity
  if (existsSync(paths.daoIdentity())) {
    try {
      const content = readFileSync(paths.daoIdentity(), 'utf-8');
      const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (fmMatch) {
        const fm = parseYaml(fmMatch[1]) as { id: string };
        const docHash = computeAttestation(content);
        leaves.push({
          id: fm.id,
          docHash,
          leaf: hash(fm.id + docHash),
        });
      }
    } catch {
      // Skip malformed DAO identity
    }
  }

  // Context identities
  const hubsDir = paths.hubs();
  if (existsSync(hubsDir)) {
    for (const dirName of readdirSync(hubsDir)) {
      const id = dirName.startsWith('ctx_') ? dirName : `ctx_${dirName}`;
      const identity = loadIdentity(id);
      if (identity) {
        const docHash = computeAttestation(identity.raw);
        leaves.push({
          id: identity.frontmatter.id,
          docHash,
          leaf: hash(identity.frontmatter.id + docHash),
        });
      }
    }
  }

  // Node identities
  const nodesDir = paths.nodes();
  if (existsSync(nodesDir)) {
    for (const dirName of readdirSync(nodesDir)) {
      const id = dirName.startsWith('node_') ? dirName : `node_${dirName}`;
      const identity = loadIdentity(id);
      if (identity) {
        const docHash = computeAttestation(identity.raw);
        leaves.push({
          id: identity.frontmatter.id,
          docHash,
          leaf: hash(identity.frontmatter.id + docHash),
        });
      }
    }
  }

  return leaves;
}

export function buildMerkleTree(leaves: MerkleLeaf[]): MerkleTree {
  if (leaves.length === 0) {
    return { root: hash('empty'), leaves: [], proofs: new Map() };
  }

  const proofs = new Map<string, string[]>();

  // Initialize proofs for each leaf
  for (const leaf of leaves) {
    proofs.set(leaf.id, []);
  }

  let level = leaves.map(l => l.leaf);
  const indices = new Map<string, number>();
  leaves.forEach((l, i) => indices.set(l.id, i));

  while (level.length > 1) {
    const nextLevel: string[] = [];
    const nextIndices = new Map<string, number>();

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;

      // Add sibling to proofs for all leaves in this subtree
      for (const [id, idx] of indices) {
        const leafIdx = leaves.findIndex(l => l.id === id);
        if (leafIdx === -1) continue;

        const currentIdx = indices.get(id)!;
        if (Math.floor(currentIdx / 2) === Math.floor(i / 2)) {
          if (i + 1 < level.length) {
            const sibling = currentIdx % 2 === 0 ? right : left;
            proofs.get(id)!.push(sibling);
          }
          nextIndices.set(id, Math.floor(i / 2));
        }
      }

      nextLevel.push(hashPair(left, right));
    }

    level = nextLevel;
    indices.clear();
    for (const [id, idx] of nextIndices) {
      indices.set(id, idx);
    }
  }

  return {
    root: level[0],
    leaves,
    proofs,
  };
}

export function getProof(tree: MerkleTree, id: string): string[] | null {
  return tree.proofs.get(id) ?? null;
}

export function verifyProof(
  leaf: string,
  proof: string[],
  root: string
): boolean {
  let current = leaf;
  for (const sibling of proof) {
    current = hashPair(current, sibling);
  }
  return current === root;
}

export function getIdentityRoot(): string {
  const leaves = collectAllIdentities();
  const tree = buildMerkleTree(leaves);
  return tree.root;
}
