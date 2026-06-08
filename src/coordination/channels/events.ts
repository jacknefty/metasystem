/**
 * Chain Event Types
 *
 * All event types and their payloads. ~24 types covering:
 * - Identity lifecycle
 * - Membership
 * - Work lifecycle (including bounty/pull model)
 * - Variety (env:in, work:out only)
 * - Algedonic signals
 * - Conditions
 */

import { randomUUID } from 'crypto';
import type { NodeSettings } from '../../identity/settings.js';

export type EventType =
  // Identity
  | 'identity:created'
  | 'identity:updated'
  | 'identity:terminated'
  | 'identity:settings'
  // Membership
  | 'membership:joined'
  | 'membership:left'
  // Work lifecycle
  | 'work:created'
  | 'work:posted'
  | 'work:claimed'
  | 'work:submitted'
  | 'work:verified'
  | 'work:completed'
  | 'work:released'
  | 'work:failed'
  | 'work:expired'
  // Variety (all 4 domains × 2 directions)
  | 'variety:work:in'
  | 'variety:work:out'
  | 'variety:env:in'
  | 'variety:env:out'
  | 'variety:coord:in'
  | 'variety:coord:out'
  | 'variety:identity:in'
  | 'variety:identity:out'
  // Credits
  | 'credit:earned'
  // Dynamics (unified Bohmian + Free Energy)
  | 'bohmian:evolved'
  | 'dynamics:evolved'
  | 'action:evaluated'
  | 'action:selected'
  // Precision Learning
  | 'precision:prediction'
  | 'precision:observation'
  | 'precision:updated'
  // Token Minting
  | 'mint:executed'
  | 'credit:minted'
  // Bridge (On-chain)
  | 'credit:created'
  | 'credit:committed'    // credit assigned to Merkle batch
  | 'credit:challenged'
  | 'credit:disputed'
  | 'credit:confirmed'
  | 'credits:minted'
  | 'challenge:failed'
  | 'merkle:committed'    // Merkle root committed (batch of credits)
  // DAO Registry
  | 'dao:registered'
  | 'dao:updated'
  | 'dao:unregistered'
  | 'dao:f_initial'
  // Contract (On-chain)
  | 'root:committed'
  | 'mint:confirmed'
  // Network
  | 'network:genesis'
  // Algedonic
  | 'algedonic:pain'
  | 'algedonic:pleasure'
  | 'algedonic:acknowledged'
  // Conditions
  | 'condition:met'
  | 'condition:confidence'
  // Product Manager
  | 'pm:session:created'
  | 'pm:message'
  | 'pm:decision:requested'
  | 'pm:decision:resolved'
  | 'pm:contract:updated'
  | 'pm:ready-to-decompose'
  // Learning
  | 'learning:recorded'
  | 'learning:pattern'
  | 'learning:verifier:recorded'
  | 'learning:verifier:false-positive'
  | 'learning:verifier:proposed'
  // Scope Locking
  | 'scope:acquired'
  | 'scope:released'
  // Merge
  | 'work:merged'
  // Tools
  | 'tool:invoked'
  | 'tool:denied'
  | 'tool:audited'
  // Hub (project/DAO containers)
  | 'hub:created'
  | 'hub:attention'
  | 'identity:closed'
  // Epic (major outcome grouping)
  | 'epic:created'
  | 'epic:completed'
  // Story (bounty level - the contract boundary)
  | 'story:created'
  | 'story:posted'
  | 'story:claimed'
  | 'story:submitted'
  | 'story:verified'
  | 'story:completed'
  // Task (agent's internal decomposition)
  | 'task:created'
  | 'task:completed'
  // Governance
  | 'proposal:created'
  | 'proposal:status'
  | 'proposal:executed'
  | 'vote:cast'
  | 'delegation:created'
  | 'delegation:revoked'
  | 'identity:amended'
  // Verification (S3)
  | 'verify:completion'
  // Audit (S3*)
  | 'audit:node'
  | 'audit:hub'
  | 'audit:dao'
  // Identity Root Sync
  | 'identity:root:changed'
  | 'identity:root:committed';

export interface Condition {
  id: string;
  description: string;
  verifier: string;
  varietyWeight?: number;
}

export interface Bounty {
  amount: number;
  currency: 'variety';
  postedAt: number;
  expiresAt?: number;
}

export interface WorkContract {
  problem?: string;
  successMetric?: string;
  scopeIn?: string[];
  scopeOut?: string[];
  constraints?: string[];
  assumptions?: string[];
  risks?: string[];
}

export interface NetworkOrigin {
  daoAddress: string;
  chainId: number;
  txHash?: string;
}

export interface EventPayloads {
  'identity:created': {
    name: string;
    purpose: string;
    scope: string[];
  };

  'identity:updated': {
    field: 'purpose' | 'scope' | 'name';
    oldValue: unknown;
    newValue: unknown;
  };

  'identity:terminated': {
    reason: string;
  };

  'identity:settings': Partial<NodeSettings>;

  'membership:joined': {
    hub: string;
    role?: string;
  };

  'membership:left': {
    hub: string;
    reason?: string;
  };

  'work:created': {
    name: string;
    hubId: string;
    hubPath?: string;  // optional - can be resolved from hub node at execution time
    conditions: Condition[];
    dependsOn?: string[];
    contract?: WorkContract;
    networkOrigin?: NetworkOrigin;
    daoAddress?: string;  // chain:identifier format
  };

  'work:posted': {
    bounty: Bounty;
    claimableWhen?: { workCompleted: string[] };
    networkOrigin?: NetworkOrigin;
  };

  'work:claimed': {
    nodeId: string;
    claimedAt: number;
    deadline: number;
    networkOrigin?: NetworkOrigin;
  };

  'work:submitted': {
    nodeId: string;
    branch: string;
    submittedAt: number;
    networkOrigin?: NetworkOrigin;
  };

  'work:verified': {
    passed: boolean;
    confidence: number;
    evidence: string;
    verifiedAt: number;
    networkOrigin?: NetworkOrigin;
  };

  'work:completed': {
    nodeId: string;
    bountyAmount: number;
    completedAt: number;
    networkOrigin?: NetworkOrigin;
  };

  'work:released': {
    nodeId: string;
    reason: 'quit' | 'timeout' | 'blocked' | 'max_attempts';
  };

  'work:failed': {
    reason: string;
  };

  'work:expired': {
    expiredAt: number;
  };

  'variety:work:in': {
    bits: number;
    workId?: string;
    conditionId?: string;
    context?: string;      // descriptive label
    hubId?: string;        // hub scope identifier
    daoAddress?: string;   // DAO scope identifier
  };

  'variety:work:out': {
    bits: number;
    workId?: string;
    conditionId?: string;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'variety:env:in': {
    bits: number;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'variety:env:out': {
    bits: number;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'variety:coord:in': {
    bits: number;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'variety:coord:out': {
    bits: number;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'variety:identity:in': {
    bits: number;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'variety:identity:out': {
    bits: number;
    context?: string;
    hubId?: string;
    daoAddress?: string;
  };

  'credit:earned': {
    workId: string;
    nodeId: string;
    bits: number;
    amount: string;
    proofHash: string;
    tokenId?: string;      // ERC-1155 tokenId (hex string)
    hubId?: string;
    daoAddress?: string;
  };

  'bohmian:evolved': {
    Q: { verified: number; active: number; resources: number };
    velocity: { verified: number; active: number; resources: number };
    quantumPotential: number;
    mass: number;
  };

  'dynamics:evolved': {
    scopePath: string;
    Q: { verified: number; active: number; resources: number };
    velocity: { verified: number; active: number; resources: number };
    G: number;  // expected free energy = F + γH
    quantumPotential: number;
    mass: number;
    τ_aggregate: number;
    β: number;
  };

  'action:evaluated': {
    actionId: string;
    scopePath: string;
    G: number;
    pragmatic: number;
    epistemic: number;
  };

  'action:selected': {
    actionId: string;
    scopePath: string;
    G: number;
    alternatives: number;
  };

  'precision:prediction': {
    key: string;
    scopePath: string;
    predictedOutcome: number;
    source: string;
    sourceWeight: number;
  };

  'precision:observation': {
    key: string;
    scopePath: string;
    actualOutcome: number;
    predictionId: string;
    squaredError: number;
  };

  'precision:updated': {
    key: string;
    scopePath: string;
    τ: number;
    samples: number;
    runningError: number;
  };

  'mint:executed': {
    mintId: string;
    workId: string;
    nodeId: string;
    ΔF: number;
    confidence: number;
    mint_rate: number;
    mint_amount: string;          // bigint as string
    F_network_after: number;
    total_supply_after: string;   // bigint as string
  };

  'credit:minted': {
    mintId: string;
    workId: string;
    amount: string;               // bigint as string
    balance_after: string;        // bigint as string
  };

  'credit:created': {
    creditId: string;
    nodeId: string;
    amount: string;
    proofHash: string;
    strategy: string;
    τ: number;
    challengeDeadline: number | null;
    merkleRoot: string;
    leafIndex: number;
  };

  'credit:challenged': {
    challengeId: string;
    challengerId: string;
    creditId: string;
  };

  'credit:disputed': {
    challengeId: string;
    creditId: string;
    challengerId: string;
    amount: string;
  };

  'credit:confirmed': {
    creditId: string;
    workId: string;
    nodeId: string;
    amount: string;
  };

  'credits:minted': {
    creditIds: string[];
    merkleRoot: string;
  };

  'challenge:failed': {
    challengeId: string;
    creditId: string;
    reason: string;
  };

  'credit:committed': {
    merkleRoot: string;
    committedAt: number;
  };

  'merkle:committed': {
    creditIds: string[];
    root: string;
    leafCount: number;
    committedAt: number;
  };

  'dao:registered': {
    address: string;
    name: string;
    hubPath?: string;
    gitRemote?: string;
  };

  'dao:updated': {
    address: string;
    updates: Record<string, unknown>;
  };

  'dao:unregistered': {
    address: string;
  };

  'dao:f_initial': {
    address: string;
    F_initial: number;
  };

  'root:committed': {
    root: string;
    chainId: string;
    testnet: boolean;
    txHash: string;
  };

  'mint:confirmed': {
    creditIds: string[];
    chainId: string;
    testnet: boolean;
    txHash: string;
  };

  'network:genesis': {
    F_initial: number;
    dao_count: number;
  };

  'algedonic:pain': {
    severity: 1 | 2 | 3;
    source: string;
    message: string;
    hubId?: string;
    originHubId?: string;
    escalationLevel?: number;
    requiresAttestation?: boolean;
  };

  'algedonic:pleasure': {
    significance: 1 | 2 | 3;
    source: string;
    message: string;
    hubId?: string;
  };

  'algedonic:acknowledged': {
    acknowledgedAt: number;
  };

  'condition:met': {
    conditionId: string;
    evidence: string;
  };

  'condition:confidence': {
    conditionId: string;
    confidence: number;
    evidence: string;
  };

  'pm:session:created': {
    hubId: string;
  };

  'pm:message': {
    role: 'user' | 'assistant' | 'system';
    content: string;
  };

  'pm:decision:requested': {
    type: 'decomposition' | 'priority' | 'scope' | 'approval';
    question: string;
    options?: string[];
    context: Record<string, unknown>;
  };

  'pm:decision:resolved': {
    decisionId: string;
    choice: string;
  };

  'pm:contract:updated': {
    fields: Partial<WorkContract>;
  };

  'pm:ready-to-decompose': Record<string, never>;

  'learning:recorded': {
    workId: string;
    nodeId: string;
    outcome: 'success' | 'failure' | 'partial';
    conditions: Array<{
      id: string;
      met: boolean;
      confidence: number;
      verifier: string;
    }>;
    executorUsed: string;
    durationMs: number;
    attempts: number;
  };

  'learning:pattern': {
    patternType: 'verifier-accuracy' | 'executor-performance' | 'condition-difficulty';
    key: string;
    value: number;
    sampleSize: number;
  };

  'scope:acquired': {
    scope: string[];
    acquiredAt: number;
  };

  'scope:released': {
    scope: string[];
    heldForMs: number;
  };

  'work:merged': {
    branch: string;
    mergedAt: number;
    resolvedConflict?: boolean;
  };

  'learning:verifier:recorded': {
    hubId: string;
    pattern: string;
    failureDescription: string;
  };

  'learning:verifier:false-positive': {
    hubId: string;
    pattern: string;
    reason: string;
  };

  'learning:verifier:proposed': {
    hubId: string;
    pattern: string;
    catchCount: number;
  };

  'tool:invoked': {
    workId?: string;
    success: boolean;
    durationMs: number;
  };

  'tool:denied': {
    reason: string;
    decidedBy?: string;
    workId?: string;
  };

  'tool:audited': {
    passed: boolean;
    discrepancy?: string;
  };

  'hub:created': {
    name: string;
    purpose: string;
    parent: string;
    scope: string[];
  };

  'hub:attention': {
    reason: string;
    source: string;
    severity: 1 | 2 | 3;
  };

  'identity:closed': {
    closedAt: string;
  };

  // Epic
  'epic:created': {
    name: string;
    outcome: string;
    hubId: string;
    scopePath: string;
    parentPath: string;
  };

  'epic:completed': {
    completedAt: number;
  };

  // Story (bounty level)
  'story:created': {
    name: string;
    outcome: string;
    epicId: string;
    hubId: string;
    conditions: Condition[];
    leverage?: number;
    uncertainty?: number;
    dependsOn: string[];
    coupledTo: string[];
    scopePath: string;
    parentPath: string;
  };

  'story:posted': {
    bounty: Bounty;
    claimableWhen?: { storiesCompleted?: string[] };
  };

  'story:claimed': {
    nodeId: string;
    claimedAt: number;
    deadline: number;
  };

  'story:submitted': {
    branch: string;
    submittedAt: number;
  };

  'story:verified': {
    passed: boolean;
    results: Array<{ conditionId: string; passed: boolean; evidence: string }>;
    verifiedAt: number;
  };

  'story:completed': {
    success: boolean;
    completedAt: number;
  };

  // Task (agent's internal decomposition)
  'task:created': {
    name: string;
    parentType: 'story' | 'task';
    parentId: string;
    storyId: string;
    scopePath: string;
    parentPath: string;
  };

  'task:completed': {
    success: boolean;
    completedAt: number;
  };

  // Governance
  'proposal:created': {
    id: string;
    type: 'hub' | 'work' | 'claim' | 'amendment';
    scope: { level: string; id?: string; address?: string };
    proposer: string;
    target: string;
    resourcesRequested: number;
    deadline: number;
    status: 'open' | 'passed' | 'rejected' | 'expired';
    createdAt: number;
  };

  'proposal:status': {
    status: 'open' | 'passed' | 'rejected' | 'expired';
  };

  'proposal:executed': {
    success: boolean;
    error?: string;
  };

  'vote:cast': {
    voter: string;
    proposal: string;
    weight: number;
    G: number;
    ψ: number;
    timestamp: number;
  };

  'delegation:created': {
    from: string;
    to: string;
    scope: { level: string; id?: string; address?: string } | null;
    weight: number;
    createdAt: number;
  };

  'delegation:revoked': {
    scope: { level: string; id?: string; address?: string } | null;
  };

  'identity:amended': Record<string, unknown>;

  // Verification (S3)
  'verify:completion': {
    workId: string;
    nodeId: string;
    timestamp: number;
    checks: Array<{ check: string; passed: boolean; evidence?: string }>;
    passed: boolean;
  };

  // Audit (S3*)
  'audit:node': {
    nodeId: string;
    workId: string;
    originalPassed: boolean;
    reVerificationPassed: boolean;
    drift: boolean;
    driftDetails?: string;
  };

  'audit:hub': {
    hubId: string;
    nodeId: string;
    workId: string;
    nodeVerificationPassed: boolean;
    ourVerificationPassed: boolean;
    drift: boolean;
    driftDetails?: string;
  };

  'audit:dao': {
    daoId: string;
    hubId: string;
    nodeId: string;
    workId: string;
    hubSaidDrift: boolean;
    weSayDrift: boolean;
    drift: boolean;
  };

  // Identity Root Sync
  'identity:root:changed': {
    previousRoot: string | null;
    newRoot: string;
    leafCount: number;
    changedAt: number;
  };

  'identity:root:committed': {
    root: string;
    txHash: string;
    committedAt: number;
  };
}

export interface ChainEvent<T extends EventType = EventType> {
  id: string;
  type: T;
  timestamp: number;
  emitter: string;
  subject: string;
  payload: EventPayloads[T];
}

export type PayloadOf<T extends EventType> = EventPayloads[T];

export function createEvent<T extends EventType>(
  type: T,
  emitter: string,
  subject: string,
  payload: EventPayloads[T]
): ChainEvent<T> {
  return {
    id: `evt_${randomUUID()}`,
    type,
    timestamp: Date.now(),
    emitter,
    subject,
    payload,
  };
}

export function isEventType<T extends EventType>(
  event: ChainEvent,
  type: T
): event is ChainEvent<T> {
  return event.type === type;
}
