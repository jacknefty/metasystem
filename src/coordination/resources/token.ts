/**
 * Token — Variety accounting and credit minting
 *
 * Tracks variety flow across all domains. When work collapses
 * (resolution position >= 1.0), credits are minted.
 */

import { createHash } from 'crypto';
import { getChain } from '../channels/chain.js';
import { getWork } from './work.js';
import type { EventPayloads } from '../channels/events.js';

export type VarietyDomain = 'work' | 'env' | 'coord' | 'identity';
export type VarietyDirection = 'in' | 'out';

// =============================================================================
// ERC-1155 Token ID Computation
// =============================================================================

/**
 * Compute ERC-1155 tokenId for a scope level.
 * - Network: tokenId = 0
 * - DAO: tokenId = uint256(daoAddress) — fits in 160 bits
 * - Context: tokenId = uint256(keccak256(daoAddress, contextId))
 */
export function computeTokenId(daoAddress?: string, contextId?: string): string {
  if (!daoAddress) {
    // Network level
    return '0x0';
  }

  // Parse DAO address — could be "0x..." or "local:name"
  const daoHex = daoAddress.startsWith('0x')
    ? daoAddress.toLowerCase()
    : '0x' + createHash('sha256').update(daoAddress).digest('hex').slice(0, 40);

  if (!contextId) {
    // DAO level — address as uint256
    return daoHex.padStart(66, '0').replace(/^0+/, '0x') || '0x0';
  }

  // Context level — hash of (dao, context)
  const hash = createHash('sha256')
    .update(daoHex)
    .update(contextId)
    .digest('hex');

  return '0x' + hash;
}

export interface VarietyToken {
  id: string;
  domain: VarietyDomain;
  direction: VarietyDirection;
  bits: number;
  source: string;
  subject: string;
  workId?: string;
  conditionId?: string;
  context?: string;      // descriptive label
  contextId?: string;    // scope identifier
  daoAddress?: string;   // DAO scope identifier
  timestamp: number;
}

export interface Resolution {
  workId: string;
  initial: number;
  resolved: number;
  position: number;
  collapsed: boolean;
}

export interface PendingCredit {
  id: string;
  workId: string;
  nodeId: string;
  bits: number;
  amount: bigint;
  proofHash: string;
  tokenId: string;       // ERC-1155 tokenId (hex string for uint256)
  contextId?: string;
  daoAddress?: string;
  earnedAt: number;
}

export interface VarietyBalance {
  domain: VarietyDomain;
  in: number;
  out: number;
  net: number;
}

export interface SystemBalance {
  perceived: number;
  resolved: number;
  ratio: number;
  healthy: boolean;
  byDomain: Record<VarietyDomain, VarietyBalance>;
}

type VarietyEventType =
  | 'variety:work:in' | 'variety:work:out'
  | 'variety:env:in' | 'variety:env:out'
  | 'variety:coord:in' | 'variety:coord:out'
  | 'variety:identity:in' | 'variety:identity:out';

function buildEventType(domain: VarietyDomain, direction: VarietyDirection): VarietyEventType {
  return `variety:${domain}:${direction}` as VarietyEventType;
}

function parseEventType(type: string): { domain: VarietyDomain; direction: VarietyDirection } | null {
  const match = type.match(/^variety:(work|env|coord|identity):(in|out)$/);
  if (!match) return null;
  return { domain: match[1] as VarietyDomain, direction: match[2] as VarietyDirection };
}

export async function emitVariety(
  domain: VarietyDomain,
  direction: VarietyDirection,
  source: string,
  subject: string,
  bits: number,
  opts?: {
    workId?: string;
    conditionId?: string;
    context?: string;      // descriptive label ("work posted", "scan complete")
    contextId?: string;    // scope identifier for filtering
    daoAddress?: string;   // DAO scope identifier
    scopePath?: string;    // full scope path for recursive F computation
  }
): Promise<VarietyToken> {
  const eventType = buildEventType(domain, direction);

  const payload: Record<string, unknown> = { bits };
  if (opts?.workId) payload.workId = opts.workId;
  if (opts?.conditionId) payload.conditionId = opts.conditionId;
  if (opts?.context) payload.context = opts.context;
  if (opts?.contextId) payload.contextId = opts.contextId;
  if (opts?.daoAddress) payload.daoAddress = opts.daoAddress;
  if (opts?.scopePath) payload.scopePath = opts.scopePath;

  const event = await getChain().append(eventType, source, subject, payload as EventPayloads[typeof eventType]);

  return {
    id: event.id,
    domain,
    direction,
    bits,
    source,
    subject,
    workId: opts?.workId,
    conditionId: opts?.conditionId,
    context: opts?.context,
    contextId: opts?.contextId,
    daoAddress: opts?.daoAddress,
    timestamp: event.timestamp,
  };
}

export async function queryTokens(filter?: {
  domain?: VarietyDomain;
  direction?: VarietyDirection;
  subject?: string;
  since?: number;
}): Promise<VarietyToken[]> {
  const events = await getChain().recall({
    subject: filter?.subject,
    since: filter?.since,
  });

  const tokens: VarietyToken[] = [];

  for (const event of events) {
    const parsed = parseEventType(event.type);
    if (!parsed) continue;

    if (filter?.domain && parsed.domain !== filter.domain) continue;
    if (filter?.direction && parsed.direction !== filter.direction) continue;

    const payload = event.payload as {
      bits: number;
      workId?: string;
      conditionId?: string;
      context?: string;
      contextId?: string;
      daoAddress?: string;
    };

    tokens.push({
      id: event.id,
      domain: parsed.domain,
      direction: parsed.direction,
      bits: payload.bits,
      source: event.emitter,
      subject: event.subject,
      workId: payload.workId,
      conditionId: payload.conditionId,
      context: payload.context,
      contextId: payload.contextId,
      daoAddress: payload.daoAddress,
      timestamp: event.timestamp,
    });
  }

  return tokens;
}

export async function getResolution(workId: string): Promise<Resolution> {
  const work = await getWork(workId);

  const initial = work?.conditions.reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0) ?? 0;

  const tokens = await queryTokens({ subject: workId, direction: 'out' });
  const resolved = tokens.reduce((sum, t) => sum + t.bits, 0);

  const position = initial === 0 ? 0 : resolved / initial;

  return {
    workId,
    initial,
    resolved,
    position,
    collapsed: position >= 1.0,
  };
}

export async function getSystemBalance(): Promise<SystemBalance> {
  const tokens = await queryTokens({});

  const byDomain: Record<VarietyDomain, VarietyBalance> = {
    work: { domain: 'work', in: 0, out: 0, net: 0 },
    env: { domain: 'env', in: 0, out: 0, net: 0 },
    coord: { domain: 'coord', in: 0, out: 0, net: 0 },
    identity: { domain: 'identity', in: 0, out: 0, net: 0 },
  };

  for (const token of tokens) {
    if (token.direction === 'in') {
      byDomain[token.domain].in += token.bits;
    } else {
      byDomain[token.domain].out += token.bits;
    }
  }

  for (const domain of Object.keys(byDomain) as VarietyDomain[]) {
    byDomain[domain].net = byDomain[domain].in - byDomain[domain].out;
  }

  const perceived = byDomain.env.in + byDomain.work.in;
  const resolved = byDomain.env.out + byDomain.work.out;
  const ratio = resolved === 0 ? Infinity : perceived / resolved;

  return {
    perceived,
    resolved,
    ratio,
    healthy: ratio === 1.0,
    byDomain,
  };
}

export function bitsToAmount(bits: number): bigint {
  return BigInt(bits) * BigInt(10 ** 18);
}

export function generateProofHash(
  workId: string,
  nodeId: string,
  bits: number,
  evidenceHashes: string[] = []
): string {
  const data = [workId, nodeId, bits.toString(), ...evidenceHashes].join(':');
  return createHash('sha256').update(data).digest('hex');
}

export async function mintCredit(workId: string, nodeId: string): Promise<PendingCredit> {
  const resolution = await getResolution(workId);

  if (!resolution.collapsed) {
    throw new Error(`Work ${workId} not collapsed (position: ${resolution.position.toFixed(2)})`);
  }

  const work = await getWork(workId);
  const evidenceHashes = work?.conditions
    .filter(c => c.evidence)
    .map(c => createHash('sha256').update(c.evidence!).digest('hex')) ?? [];

  const bits = resolution.resolved;
  const amount = bitsToAmount(bits);
  const proofHash = generateProofHash(workId, nodeId, bits, evidenceHashes);

  // Compute ERC-1155 tokenId based on scope
  const tokenId = computeTokenId(work?.daoAddress, work?.contextId);

  await getChain().append('credit:earned', 'system', nodeId, {
    workId,
    nodeId,
    bits,
    amount: amount.toString(),
    proofHash,
    tokenId,
    contextId: work?.contextId,
    daoAddress: work?.daoAddress,
  });

  return {
    id: `credit_${workId}`,
    workId,
    nodeId,
    bits,
    amount,
    proofHash,
    tokenId,
    contextId: work?.contextId,
    daoAddress: work?.daoAddress,
    earnedAt: Date.now(),
  };
}

export async function getPendingCredits(nodeId?: string): Promise<PendingCredit[]> {
  const events = await getChain().recall({ type: 'credit:earned' });

  const credits: PendingCredit[] = [];

  for (const event of events) {
    if (nodeId && event.subject !== nodeId) continue;

    const p = event.payload as EventPayloads['credit:earned'];

    credits.push({
      id: `credit_${p.workId}`,
      workId: p.workId,
      nodeId: p.nodeId,
      bits: p.bits,
      amount: BigInt(p.amount),
      proofHash: p.proofHash,
      tokenId: p.tokenId ?? '0x0',
      contextId: p.contextId,
      daoAddress: p.daoAddress,
      earnedAt: event.timestamp,
    });
  }

  return credits;
}
