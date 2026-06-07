/**
 * Token Minting — $LOOP as unit of resolved variety
 *
 * mint_amount = ΔF × confidence × base_rate × (F_network / F_initial)
 *
 * - F_initial: snapshot when first DAO joins (empirical baseline)
 * - Direct to worker: no escrow/vesting complexity
 * - Off-chain tracking: validate before contracts
 */

import { getChain } from '../../coordination/channels/chain.js';
import { getWork } from '../../coordination/resources/work.js';
import { dao } from '../../identity/scoped-paths.js';
import type { Scope, DynamicsParameters } from './types.js';
import { DEFAULT_PARAMETERS } from './types.js';
import { getFreeEnergy } from './free-energy.js';
import { getAggregatePrecision, getPrecision } from './precision.js';
import { parseVerifier } from '../verify/registry.js';

// =============================================================================
// Network State
// =============================================================================

export interface NetworkState {
  F_network: number;
  F_initial: number | null;       // null until first work creates variety
  total_supply: bigint;
  active_daos: number;
  resolution_rate: number;        // ΔF per hour (rolling average)
  updatedAt: number;
}

let networkState: NetworkState = {
  F_network: 0,
  F_initial: null,
  total_supply: 0n,
  active_daos: 0,
  resolution_rate: 0,
  updatedAt: Date.now(),
};

export function getNetworkState(): NetworkState {
  return { ...networkState };
}

export async function refreshNetworkState(): Promise<NetworkState> {
  const F_network = await getFreeEnergy(dao);

  // Genesis snapshot: first time F > 0
  if (networkState.F_initial === null && F_network > 0) {
    networkState.F_initial = F_network;
  }

  networkState.F_network = F_network;
  networkState.updatedAt = Date.now();

  return getNetworkState();
}

export function updateNetworkState(updates: Partial<NetworkState>): void {
  networkState = { ...networkState, ...updates, updatedAt: Date.now() };
}

export function resetNetworkState(): void {
  networkState = {
    F_network: 0,
    F_initial: null,
    total_supply: 0n,
    active_daos: 0,
    resolution_rate: 0,
    updatedAt: Date.now(),
  };
}

// =============================================================================
// Minting Configuration
// =============================================================================

export interface MintConfig {
  base_rate: number;              // tokens per variety bit (default: 1.0)
  min_confidence: number;         // threshold to mint (default: 0.5)
  decimals: number;               // token decimals (default: 18)
}

export const DEFAULT_MINT_CONFIG: MintConfig = {
  base_rate: 1.0,
  min_confidence: 0.5,
  decimals: 18,
};

// =============================================================================
// Mint Event
// =============================================================================

export interface MintEvent {
  id: string;
  workId: string;
  daoAddress: string | null;
  nodeId: string;

  // Variety
  F_before: number;
  F_after: number;
  ΔF: number;

  // Verification
  confidence: number;
  verifiers: string[];

  // Minting
  mint_rate: number;
  mint_amount: bigint;

  // Network state
  F_network_before: number;
  F_network_after: number;
  total_supply_after: bigint;

  timestamp: number;
}

// =============================================================================
// Minting Logic
// =============================================================================

export async function mintOnCompletion(
  workId: string,
  nodeId: string,
  config: MintConfig = DEFAULT_MINT_CONFIG,
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<MintEvent> {
  const work = await getWork(workId);
  if (!work) {
    throw new Error(`Work not found: ${workId}`);
  }

  // Refresh network state
  await refreshNetworkState();

  const scope = dao.hub(work.hubId).task(workId);

  // Compute ΔF (variety resolved by this work)
  const F_before = work.conditions.reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);
  const F_after = work.conditions
    .filter(c => !c.met)
    .reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);
  const ΔF = F_before - F_after;

  if (ΔF <= 0) {
    throw new Error(`No variety resolved: ΔF = ${ΔF}`);
  }

  // Get aggregate confidence from precision
  const confidence = await getAggregateConfidence(work.conditions, scope, params);

  if (confidence < config.min_confidence) {
    throw new Error(`Confidence ${confidence.toFixed(3)} below threshold ${config.min_confidence}`);
  }

  // Compute mint rate
  const F_network_before = networkState.F_network;
  const F_initial = networkState.F_initial ?? F_network_before;

  // mint_rate = base_rate × (F_network / F_initial)
  // Higher F_network → higher mint rate → incentivizes resolution
  const mint_rate = F_initial > 0
    ? config.base_rate * (F_network_before / F_initial)
    : config.base_rate;

  // mint_amount = ΔF × confidence × mint_rate × 10^decimals
  const rawAmount = ΔF * confidence * mint_rate;
  const mint_amount = BigInt(Math.floor(rawAmount * (10 ** config.decimals)));

  // Update network state
  const F_network_after = F_network_before - ΔF;
  const total_supply_after = networkState.total_supply + mint_amount;

  updateNetworkState({
    F_network: F_network_after,
    total_supply: total_supply_after,
  });

  // Build event
  const event: MintEvent = {
    id: `mint_${Date.now()}_${workId.slice(0, 8)}`,
    workId,
    daoAddress: null, // Phase 6: will be set when DAO integration exists
    nodeId,
    F_before,
    F_after,
    ΔF,
    confidence,
    verifiers: work.conditions.map(c => c.verifier),
    mint_rate,
    mint_amount,
    F_network_before,
    F_network_after,
    total_supply_after,
    timestamp: Date.now(),
  };

  // Emit to chain
  await getChain().append('mint:executed', 'dynamics', workId, {
    mintId: event.id,
    workId,
    nodeId,
    ΔF,
    confidence,
    mint_rate,
    mint_amount: mint_amount.toString(),
    F_network_after,
    total_supply_after: total_supply_after.toString(),
  });

  // Credit worker directly (off-chain balance)
  await creditWorker(nodeId, mint_amount, event);

  return event;
}

// =============================================================================
// Confidence Aggregation
// =============================================================================

interface ConditionLike {
  id: string;
  verifier: string;
  met?: boolean;
  varietyWeight?: number;
}

async function getAggregateConfidence(
  conditions: ConditionLike[],
  scope: Scope,
  params: DynamicsParameters
): Promise<number> {
  // Aggregate confidence = product of (1 - (1 - τ) for each verifier)
  // This is: 1 - Π(1 - τ_i)
  let uncertainty = 1.0;

  for (const condition of conditions) {
    if (!condition.met) continue; // Only count verified conditions

    const { type: verifierType } = parseVerifier(condition.verifier);
    const precision = await getPrecision(verifierType, scope);

    // Weight by variety weight
    const weight = (condition.varietyWeight ?? 10) / 10;
    const weighted_τ = precision.τ * weight;

    uncertainty *= (1 - weighted_τ);
  }

  return 1 - uncertainty;
}

// =============================================================================
// Worker Balance (Off-chain)
// =============================================================================

const workerBalances = new Map<string, bigint>();

async function creditWorker(
  nodeId: string,
  amount: bigint,
  mintEvent: MintEvent
): Promise<void> {
  const current = workerBalances.get(nodeId) ?? 0n;
  workerBalances.set(nodeId, current + amount);

  // Emit credit event
  await getChain().append('credit:minted', 'dynamics', nodeId, {
    mintId: mintEvent.id,
    workId: mintEvent.workId,
    amount: amount.toString(),
    balance_after: (current + amount).toString(),
  });
}

export function getWorkerBalance(nodeId: string): bigint {
  return workerBalances.get(nodeId) ?? 0n;
}

export function getAllBalances(): Map<string, bigint> {
  return new Map(workerBalances);
}

export function resetBalances(): void {
  workerBalances.clear();
}

// =============================================================================
// Token Metrics
// =============================================================================

export interface TokenMetrics {
  total_supply: bigint;
  F_network: number;
  F_initial: number | null;
  F_per_token: number;            // F_network / total_supply (should trend to 0)
  mint_rate: number;              // current rate
  token_value_proxy: number;      // 1 / F_network (higher when F is low)
}

export function getTokenMetrics(config: MintConfig = DEFAULT_MINT_CONFIG): TokenMetrics {
  const { F_network, F_initial, total_supply } = networkState;

  const supply_float = Number(total_supply) / (10 ** config.decimals);
  const F_per_token = supply_float > 0 ? F_network / supply_float : 0;

  const mint_rate = F_initial !== null && F_initial > 0
    ? config.base_rate * (F_network / F_initial)
    : config.base_rate;

  const token_value_proxy = F_network > 0 ? 1 / F_network : Infinity;

  return {
    total_supply,
    F_network,
    F_initial,
    F_per_token,
    mint_rate,
    token_value_proxy,
  };
}
