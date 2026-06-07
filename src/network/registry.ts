/**
 * DAO Registry
 *
 * Manages registered DAOs. MetaSystem itself is the first DAO.
 * Addresses use chain:identifier composite format.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getChain } from '../coordination/channels/chain.js';
import { paths } from '../identity/paths.js';

// =============================================================================
// Types
// =============================================================================

export type DAOAddress =
  | `local:${string}`
  | `sepolia:0x${string}`
  | `base:0x${string}`
  | `mainnet:0x${string}`;

export interface DAOIdentity {
  purpose: string;
  scope: string[];
}

export interface DAORegistration {
  address: DAOAddress;
  name: string;
  identity: DAOIdentity;

  // On-chain address for ERC-1155 tokenId computation
  evmAddress?: `0x${string}`;     // Ethereum address (Safe, governance contract, etc.)

  // Location (one of these)
  contextPath?: string;           // /Users/lionsmane/Desktop/MetaSystem
  gitRemote?: string;             // git@github.com:org/repo.git

  // Resolved at runtime
  resolvedPath?: string;

  // State
  registeredAt: number;
  F_initial?: number;             // Set on first work
  updatedAt?: number;
}

// =============================================================================
// Storage
// =============================================================================

const registry = new Map<DAOAddress, DAORegistration>();

function getRegistryPath(): string {
  return paths.network.daoRegistry();
}

function loadRegistry(): void {
  const path = getRegistryPath();
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      for (const dao of data.daos ?? []) {
        registry.set(dao.address, dao);
      }
    } catch {
      // Corrupted file, start fresh
    }
  }
}

function saveRegistry(): void {
  const path = getRegistryPath();
  const dir = paths.root();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify({
    daos: Array.from(registry.values()),
    updatedAt: Date.now(),
  }, null, 2));
}

// Load on module init
loadRegistry();

// =============================================================================
// CRUD Operations
// =============================================================================

export async function registerDAO(dao: Omit<DAORegistration, 'registeredAt'>): Promise<DAORegistration> {
  const existing = registry.get(dao.address);
  if (existing) {
    throw new Error(`DAO already registered: ${dao.address}`);
  }

  const registration: DAORegistration = {
    ...dao,
    registeredAt: Date.now(),
    resolvedPath: resolvePath(dao),
  };

  registry.set(dao.address, registration);
  saveRegistry();

  await getChain().append('dao:registered', 'registry', dao.address, {
    address: dao.address,
    name: dao.name,
    contextPath: dao.contextPath,
    gitRemote: dao.gitRemote,
  });

  return registration;
}

export async function updateDAO(
  address: DAOAddress,
  updates: Partial<Pick<DAORegistration, 'name' | 'identity' | 'contextPath' | 'gitRemote'>>
): Promise<DAORegistration> {
  const existing = registry.get(address);
  if (!existing) {
    throw new Error(`DAO not found: ${address}`);
  }

  const updated: DAORegistration = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
    resolvedPath: resolvePath({ ...existing, ...updates }),
  };

  registry.set(address, updated);
  saveRegistry();

  await getChain().append('dao:updated', 'registry', address, {
    address,
    updates,
  });

  return updated;
}

export async function unregisterDAO(address: DAOAddress): Promise<void> {
  if (!registry.has(address)) {
    throw new Error(`DAO not found: ${address}`);
  }

  registry.delete(address);
  saveRegistry();

  await getChain().append('dao:unregistered', 'registry', address, {
    address,
  });
}

export function getDAO(address: DAOAddress): DAORegistration | null {
  return registry.get(address) ?? null;
}

export function listDAOs(): DAORegistration[] {
  return Array.from(registry.values());
}

export function getDefaultDAO(): DAORegistration | null {
  const daos = listDAOs();
  return daos.length > 0 ? daos[0] : null;
}

// =============================================================================
// Path Resolution
// =============================================================================

function resolvePath(dao: Pick<DAORegistration, 'contextPath' | 'gitRemote'>): string | undefined {
  if (dao.contextPath) {
    return dao.contextPath;
  }

  if (dao.gitRemote) {
    // For now, check if cloned locally in a standard location
    // Future: clone on demand
    const repoName = dao.gitRemote.split('/').pop()?.replace('.git', '') ?? 'repo';
    const possiblePaths = [
      join(process.env.HOME ?? '', 'Desktop', repoName),
      join(process.env.HOME ?? '', 'Projects', repoName),
      join(process.env.HOME ?? '', 'code', repoName),
      join(process.cwd(), '..', repoName),
    ];

    for (const p of possiblePaths) {
      if (existsSync(p)) {
        return p;
      }
    }

    return undefined;
  }

  return undefined;
}

// =============================================================================
// Self-Registration (MetaSystem)
// =============================================================================

const METASYSTEM_ADDRESS: DAOAddress = 'local:metasystem';

export function isMetaSystemRegistered(): boolean {
  return registry.has(METASYSTEM_ADDRESS);
}

export async function registerMetaSystem(contextPath?: string): Promise<DAORegistration> {
  const path = contextPath ?? process.cwd();

  // Check if already registered
  const existing = registry.get(METASYSTEM_ADDRESS);
  if (existing) {
    // Update path if different
    if (existing.contextPath !== path) {
      return updateDAO(METASYSTEM_ADDRESS, { contextPath: path });
    }
    return existing;
  }

  return registerDAO({
    address: METASYSTEM_ADDRESS,
    name: 'MetaSystem',
    contextPath: path,
    identity: {
      purpose: 'Build the viable system infrastructure',
      scope: ['**'],
    },
  });
}

export async function ensureMetaSystemRegistered(): Promise<DAORegistration> {
  if (isMetaSystemRegistered()) {
    return registry.get(METASYSTEM_ADDRESS)!;
  }
  return registerMetaSystem();
}

// =============================================================================
// F_initial Management
// =============================================================================

export async function setDAOFInitial(address: DAOAddress, F_initial: number): Promise<void> {
  const dao = registry.get(address);
  if (!dao) {
    throw new Error(`DAO not found: ${address}`);
  }

  if (dao.F_initial !== undefined) {
    return; // Already set
  }

  dao.F_initial = F_initial;
  dao.updatedAt = Date.now();
  saveRegistry();

  await getChain().append('dao:f_initial', 'registry', address, {
    address,
    F_initial,
  });
}

// =============================================================================
// Address Parsing
// =============================================================================

export function parseDAOAddress(address: string): { chain: string; identifier: string } {
  const parts = address.split(':');
  if (parts.length !== 2) {
    throw new Error(`Invalid DAO address format: ${address}`);
  }
  return { chain: parts[0], identifier: parts[1] };
}

export function isOnChain(address: DAOAddress): boolean {
  const { chain } = parseDAOAddress(address);
  return chain !== 'local';
}

export function getChainId(address: DAOAddress): number | null {
  const { chain } = parseDAOAddress(address);
  switch (chain) {
    case 'mainnet': return 1;
    case 'sepolia': return 11155111;
    case 'base': return 8453;
    default: return null;
  }
}
