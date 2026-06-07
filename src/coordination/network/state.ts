/**
 * Network State — Cross-DAO Aggregation
 *
 * F_network = Σ F_dao
 * τ_network = aggregate precision across all DAOs
 * mint_rate = base_rate × (F_network / F_initial)
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getChain } from '../channels/chain.js';
import { listWork } from '../resources/work.js';
import { paths } from '../../identity/paths.js';
import { listDAOs, type DAORegistration } from './registry.js';
import { getFreeEnergy, getFreeEnergyState } from '../../control/dynamics/free-energy.js';
import { getAggregatePrecision, getPrecisionStats, type PrecisionRecord } from '../../control/dynamics/precision.js';
import { DEFAULT_PARAMETERS, type Scope } from '../../control/dynamics/types.js';
import { dao } from '../../identity/scoped-paths.js';

// =============================================================================
// Types
// =============================================================================

export interface DAOState {
  address: string;
  name: string;
  F: number;
  H: number;
  G: number;
  workCount: number;
  activeWork: number;
  creditsEarned: bigint;
  creditsMinted: bigint;
}

export interface NetworkState {
  F_network: number;
  H_network: number;
  G_network: number;
  F_initial: number | null;
  total_supply: bigint;
  dao_count: number;
  daos: DAOState[];
  τ_aggregate: number;
  mint_rate: number;
  resolution_rate: number;      // ΔF per hour (rolling)
  updatedAt: number;
}

export interface NetworkHistory {
  timestamp: number;
  F_network: number;
  total_supply: string;
  dao_count: number;
}

// =============================================================================
// State Storage
// =============================================================================

let networkState: NetworkState = {
  F_network: 0,
  H_network: 0,
  G_network: 0,
  F_initial: null,
  total_supply: 0n,
  dao_count: 0,
  daos: [],
  τ_aggregate: 0.5,
  mint_rate: 1.0,
  resolution_rate: 0,
  updatedAt: 0,
};

const history: NetworkHistory[] = [];
const MAX_HISTORY = 1000;

function getStatePath(): string {
  return paths.network.state();
}

function getHistoryPath(): string {
  return paths.network.history();
}

export function loadNetworkState(): NetworkState {
  const path = getStatePath();
  if (existsSync(path)) {
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8'));
      networkState = {
        ...networkState,
        ...data,
        total_supply: BigInt(data.total_supply ?? '0'),
        daos: (data.daos ?? []).map((d: DAOState & { creditsEarned: string; creditsMinted: string }) => ({
          ...d,
          creditsEarned: BigInt(d.creditsEarned ?? '0'),
          creditsMinted: BigInt(d.creditsMinted ?? '0'),
        })),
      };
    } catch {
      // Use default
    }
  }
  return networkState;
}

function saveNetworkState(): void {
  const path = getStatePath();
  const serializable = {
    ...networkState,
    total_supply: networkState.total_supply.toString(),
    daos: networkState.daos.map(d => ({
      ...d,
      creditsEarned: d.creditsEarned.toString(),
      creditsMinted: d.creditsMinted.toString(),
    })),
  };
  writeFileSync(path, JSON.stringify(serializable, null, 2));
}

function appendHistory(entry: NetworkHistory): void {
  history.push(entry);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  // Append to JSONL
  const path = getHistoryPath();
  const line = JSON.stringify(entry) + '\n';
  writeFileSync(path, line, { flag: 'a' });
}

// =============================================================================
// State Computation
// =============================================================================

export async function computeNetworkState(): Promise<NetworkState> {
  const daos = listDAOs();
  const daoStates: DAOState[] = [];

  let F_network = 0;
  let H_network = 0;

  for (const dao of daos) {
    const daoState = await computeDAOState(dao);
    daoStates.push(daoState);
    F_network += daoState.F;
    H_network += daoState.H;
  }

  const G_network = F_network + DEFAULT_PARAMETERS.γ * H_network;

  // Get network-level τ (use dao as network scope)
  const τ_aggregate = await getAggregatePrecision(dao);

  // Compute mint rate
  const mint_rate = networkState.F_initial !== null && networkState.F_initial > 0
    ? DEFAULT_PARAMETERS.β_base * (F_network / networkState.F_initial)
    : DEFAULT_PARAMETERS.β_base;

  // Compute resolution rate (ΔF per hour)
  const now = Date.now();
  const hourAgo = now - 3600000;
  const recentHistory = history.filter(h => h.timestamp > hourAgo);
  let resolution_rate = 0;
  if (recentHistory.length >= 2) {
    const oldest = recentHistory[0];
    const newest = recentHistory[recentHistory.length - 1];
    const ΔF = oldest.F_network - newest.F_network;
    const Δt = (newest.timestamp - oldest.timestamp) / 3600000;
    resolution_rate = Δt > 0 ? ΔF / Δt : 0;
  }

  // Genesis: set F_initial on first real work
  let F_initial = networkState.F_initial;
  if (F_initial === null && F_network > 0) {
    F_initial = F_network;
    await getChain().append('network:genesis', 'network', 'network', {
      F_initial,
      dao_count: daos.length,
    });
  }

  const newState: NetworkState = {
    F_network,
    H_network,
    G_network,
    F_initial,
    total_supply: networkState.total_supply,
    dao_count: daos.length,
    daos: daoStates,
    τ_aggregate,
    mint_rate,
    resolution_rate,
    updatedAt: now,
  };

  networkState = newState;
  saveNetworkState();

  // Record history
  appendHistory({
    timestamp: now,
    F_network,
    total_supply: networkState.total_supply.toString(),
    dao_count: daos.length,
  });

  return newState;
}

async function computeDAOState(dao: DAORegistration): Promise<DAOState> {
  // Get all work for this DAO
  const allWork = await listWork({});

  // Filter by DAO - check work events for daoAddress
  // For now, if no daoAddress on work, it belongs to first DAO
  const daoWork = allWork; // TODO: filter by dao.address when work has daoAddress

  const activeWork = daoWork.filter(w =>
    w.status === 'active' || w.status === 'executing' || w.status === 'pending-review'
  );

  // Compute F for this DAO's work
  let F = 0;
  let H = 0;
  for (const work of daoWork) {
    if (work.status === 'fulfilled') continue;

    for (const condition of work.conditions) {
      if (condition.met) continue;
      const weight = condition.varietyWeight ?? 10;
      F += weight;
      // H approximation: assume some uncertainty
      H += weight * 0.5;
    }
  }

  const G = F + DEFAULT_PARAMETERS.γ * H;

  // Get credits from chain events
  const events = await getChain().recall({ type: 'credit:earned' });
  const daoCredits = events; // TODO: filter by dao.address

  const creditsEarned = daoCredits.reduce((sum, e) => {
    const payload = e.payload as { amount?: string };
    return sum + BigInt(payload.amount ?? '0');
  }, 0n);

  const mintedEvents = await getChain().recall({ type: 'mint:confirmed' });
  const creditsMinted = 0n; // TODO: sum minted credits for this DAO

  return {
    address: dao.address,
    name: dao.name,
    F,
    H,
    G,
    workCount: daoWork.length,
    activeWork: activeWork.length,
    creditsEarned,
    creditsMinted,
  };
}

// =============================================================================
// Accessors
// =============================================================================

export function getNetworkState(): NetworkState {
  return networkState;
}

export function getNetworkHistory(since?: number): NetworkHistory[] {
  if (since) {
    return history.filter(h => h.timestamp >= since);
  }
  return [...history];
}

export function getF_initial(): number | null {
  return networkState.F_initial;
}

export function getMintRate(): number {
  return networkState.mint_rate;
}

// =============================================================================
// Supply Tracking
// =============================================================================

export function addToSupply(amount: bigint): void {
  networkState.total_supply += amount;
  saveNetworkState();
}

export function getTotalSupply(): bigint {
  return networkState.total_supply;
}

// =============================================================================
// Leaderboard
// =============================================================================

export interface LeaderboardEntry {
  address: string;
  name: string;
  metric: number;
}

export function getLeaderboard(): {
  byResolution: LeaderboardEntry[];
  byEfficiency: LeaderboardEntry[];
  byActivity: LeaderboardEntry[];
} {
  const daos = networkState.daos;

  // By resolution (lowest F = most resolved)
  const byResolution = [...daos]
    .sort((a, b) => a.F - b.F)
    .map(d => ({ address: d.address, name: d.name, metric: d.F }));

  // By efficiency (F per credit earned)
  const byEfficiency = [...daos]
    .filter(d => d.creditsEarned > 0n)
    .map(d => ({
      address: d.address,
      name: d.name,
      metric: d.F / Number(d.creditsEarned / BigInt(1e18) || 1n),
    }))
    .sort((a, b) => a.metric - b.metric);

  // By activity (active work count)
  const byActivity = [...daos]
    .sort((a, b) => b.activeWork - a.activeWork)
    .map(d => ({ address: d.address, name: d.name, metric: d.activeWork }));

  return { byResolution, byEfficiency, byActivity };
}

// =============================================================================
// Events
// =============================================================================

export async function recordMint(amount: bigint, daoAddress: string): Promise<void> {
  addToSupply(amount);

  // Update DAO state
  const dao = networkState.daos.find(d => d.address === daoAddress);
  if (dao) {
    dao.creditsMinted += amount;
  }

  saveNetworkState();
}

// Load state on module init
loadNetworkState();
