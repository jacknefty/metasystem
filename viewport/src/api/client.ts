/**
 * API Client
 */

const BASE_URL = '/api';

interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      return { ok: false, error: error.error || res.statusText };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

// =============================================================================
// Types
// =============================================================================

export interface IdentitySettings {
  autonomousMode: boolean;
  executor: string;
  securityMode: 'advisory' | 'enforced' | 'signed';
  maxAttempts: number;
  confidenceThreshold: number;
  availableForWork: boolean;
  // Dynamics parameters
  invocationThreshold?: number;  // F above this triggers work (default: 0)
  perceptionThreshold?: number;  // F below this triggers scanning (default: -10)
  γ?: number;                    // epistemic weight in G = F + γH (default: 0.1)
  β_base?: number;               // inverse temperature for action selection (default: 1.0)
}

export interface Membership {
  hub: string;
  role?: string;
  joinedAt: number;
}

export interface Identity {
  id: string;
  name: string;
  purpose: string;
  scope: string[];
  status: 'active' | 'terminated';
  settings: Partial<IdentitySettings>;
  memberships: Membership[];
  memberCount?: number; // nodes that have joined this context
  createdAt: number;
  updatedAt: number;
}

export interface Work {
  id: string;
  name: string;
  ownerId: string;
  projectId: string;
  scope: string[];
  status: string;
  dependsOn: string[];
  conditions: Array<{
    id: string;
    description: string;
    verifier: string;
    confidence: number;
    met: boolean;
  }>;
  gap: number;
  executorId?: string;
  prNumber?: number;
  prUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DispatchStatus {
  idleAgents: number;
  activeWork: number;
  activeExecutions: number;
  inFlight: number;
}

// =============================================================================
// Bounty Types
// =============================================================================

export interface BountyWork {
  id: string;
  name: string;
  ownerId: string;
  projectId: string;
  scope: string[];
  status: string;
  bountyStatus?: 'posted' | 'claimed' | 'submitted' | 'verified' | 'completed' | 'expired' | 'failed';
  bounty?: {
    amount: number;
    currency: 'variety';
    postedAt: number;
    expiresAt?: number;
  };
  claimableWhen?: {
    workCompleted: string[];
  };
  claim?: {
    workerId: string;
    claimedAt: number;
    deadline: number;
  };
  conditions: Array<{
    id: string;
    description: string;
    verifier: string;
    varietyWeight?: number;
    met: boolean;
  }>;
  dependsOn: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkerReputation {
  identityId: string;
  completedCount: number;
  releasedCount: number;
  totalEarned: number;
  completionRate: number;
  maxConcurrentClaims: number;
}

export interface PoolStats {
  totalPosted: number;
  totalClaimed: number;
  totalCompleted: number;
  avgClaimDuration: number;
  starvationAlerts: string[];
}

export interface ClaimabilityResult {
  claimable: boolean;
  blockers: Array<{
    type: string;
    reason: string;
    blockedBy?: string;
  }>;
}

// =============================================================================
// API Functions
// =============================================================================

export async function fetchIdentities(): Promise<Identity[]> {
  const res = await api.get<Identity[]>('/identities');
  return res.data || [];
}

export async function fetchIdentity(id: string): Promise<Identity | null> {
  const res = await api.get<Identity>(`/identities/${id}`);
  return res.data || null;
}

export async function fetchMembers(hubId: string): Promise<Identity[]> {
  const res = await api.get<Identity[]>(`/identities/${hubId}/members`);
  return res.data || [];
}

export async function fetchMemberships(nodeId: string): Promise<Membership[]> {
  const res = await api.get<Membership[]>(`/identities/${nodeId}/memberships`);
  return res.data || [];
}

export async function createIdentity(data: {
  id?: string;
  name: string;
  purpose: string;
  scope?: string[];
}): Promise<Identity | null> {
  const res = await api.post<Identity>('/identities', data);
  return res.data || null;
}

export async function joinNode(memberId: string, hubId: string, role?: string): Promise<boolean> {
  const res = await api.post(`/nodes/${hubId}/join`, { memberId, role });
  return res.ok;
}

export async function leaveNode(memberId: string, hubId: string, reason?: string): Promise<boolean> {
  const res = await api.post(`/nodes/${hubId}/leave`, { memberId, reason });
  return res.ok;
}

// =============================================================================
// Bounty API Functions
// =============================================================================

export async function fetchBountyPool(projectId?: string): Promise<BountyWork[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const res = await api.get<BountyWork[]>(`/pool${query}`);
  return res.data || [];
}

export async function fetchBountyStatus(): Promise<{
  total: number;
  posted: number;
  claimed: number;
  submitted: number;
  bounties: BountyWork[];
}> {
  const res = await api.get<{
    total: number;
    posted: number;
    claimed: number;
    submitted: number;
    bounties: BountyWork[];
  }>('/bounty/status');
  return res.data || { total: 0, posted: 0, claimed: 0, submitted: 0, bounties: [] };
}

export async function fetchPoolStats(): Promise<PoolStats> {
  const res = await api.get<PoolStats>('/pool/stats');
  return res.data || { totalPosted: 0, totalClaimed: 0, totalCompleted: 0, avgClaimDuration: 0, starvationAlerts: [] };
}

export async function fetchWorkerReputation(workerId: string): Promise<WorkerReputation> {
  const res = await api.get<WorkerReputation>(`/workers/${workerId}/reputation`);
  return res.data || { identityId: workerId, completedCount: 0, releasedCount: 0, totalEarned: 0, completionRate: 1, maxConcurrentClaims: 1 };
}

export async function fetchWorkerClaims(workerId: string): Promise<BountyWork[]> {
  const res = await api.get<BountyWork[]>(`/workers/${workerId}/claims`);
  return res.data || [];
}

export async function checkClaimability(workId: string, workerId: string): Promise<ClaimabilityResult> {
  const res = await api.get<ClaimabilityResult>(`/work/${workId}/claimability?workerId=${encodeURIComponent(workerId)}`);
  return res.data || { claimable: false, blockers: [] };
}

export async function claimBounty(workId: string, workerId: string): Promise<{ success: boolean; error?: string }> {
  const res = await api.post<{ success: boolean; claim?: unknown; error?: string }>(`/work/${workId}/claim`, { workerId });
  if (!res.ok) return { success: false, error: res.error };
  return res.data || { success: false, error: 'Unknown error' };
}

export async function releaseBounty(workId: string, reason: 'quit' | 'timeout' | 'blocked'): Promise<boolean> {
  const res = await api.post(`/work/${workId}/release`, { reason });
  return res.ok;
}

export async function submitBountyWork(workId: string, branch: string): Promise<boolean> {
  const res = await api.post(`/work/${workId}/submit`, { branch });
  return res.ok;
}

export async function fetchWork(projectId?: string): Promise<Work[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const res = await api.get<Work[]>(`/work${query}`);
  return res.data || [];
}

export async function fetchActiveWork(): Promise<Work[]> {
  const res = await api.get<Work[]>('/work/active');
  return res.data || [];
}

// Work graph for Wave/Particle visualization
export interface WorkGraphNode {
  id: string;
  name: string;
  status: string;
  dependsOn: string[];
  conditions: Array<{
    id: string;
    description: string;
    verifier: string;
    met: boolean;
    varietyWeight?: number;
  }>;
  executorId?: string;
  varietyTotal: number;
  varietyResolved: number;
  leverage: number;
  uncertainty: number;
}

export interface WorkGraph {
  nodes: WorkGraphNode[];
  edges: Array<{ from: string; to: string }>;
  leveragePoint: string | null;
  stats: {
    total: number;
    pending: number;
    active: number;
    complete: number;
    varietyTotal: number;
    varietyResolved: number;
    progress: number;
  };
}

export async function fetchWorkGraph(projectId: string): Promise<WorkGraph | null> {
  const res = await api.get<WorkGraph>(`/work/graph/${projectId}`);
  return res.data || null;
}

export async function fetchDispatchStatus(): Promise<DispatchStatus | null> {
  const res = await api.get<DispatchStatus>('/dispatch/status');
  return res.data || null;
}

export async function bootstrap(data: {
  id?: string;
  name: string;
  purpose: string;
}): Promise<Identity | null> {
  const res = await api.post<Identity>('/bootstrap', data);
  return res.data || null;
}

export interface WorkspaceRoot {
  rootId: string | null;
  root: Identity | null;
}

export async function fetchWorkspaceRoot(): Promise<WorkspaceRoot> {
  const res = await api.get<WorkspaceRoot>('/workspace/root');
  return res.data || { rootId: null, root: null };
}

export async function checkHasRoot(): Promise<boolean> {
  const { rootId } = await fetchWorkspaceRoot();
  return rootId !== null;
}

// =============================================================================
// Directory browser
// =============================================================================

export interface DirectoryListing {
  current: string;
  parent: string;
  directories: Array<{ name: string; path: string }>;
}

export async function fetchDirectories(path?: string): Promise<DirectoryListing | null> {
  const query = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await api.get<DirectoryListing>(`/directories${query}`);
  return res.data || null;
}

// =============================================================================
// Hub creation (recursive viable systems with context directories)
// =============================================================================

export interface ContextSource {
  type: 'new' | 'existing' | 'github';
  path?: string;  // for existing
  repo?: string;  // for github
}

export async function createHub(data: {
  name: string;
  purpose: string;
  parentId: string;
  source?: ContextSource;
}): Promise<Identity | null> {
  const res = await api.post<Identity>('/hubs/create', data);
  return res.data || null;
}


// =============================================================================
// Executors
// =============================================================================

export interface ExecutorInfo {
  name: string;
  description: string;
  installed: boolean;
}

export async function fetchExecutors(): Promise<ExecutorInfo[]> {
  const res = await api.get<ExecutorInfo[]>('/executors');
  return res.data || [];
}

// =============================================================================
// Workspace Settings
// =============================================================================

export interface WorkspaceSettings {
  autonomousMode: boolean;
  defaultExecutor: string;
  securityMode: 'advisory' | 'enforced' | 'signed';
}

export async function fetchSettings(): Promise<WorkspaceSettings> {
  const res = await api.get<WorkspaceSettings>('/settings');
  return res.data || { autonomousMode: false, defaultExecutor: 'claude', securityMode: 'advisory' };
}

export async function updateSettings(updates: Partial<WorkspaceSettings>): Promise<WorkspaceSettings> {
  const res = await api.put<WorkspaceSettings>('/settings', updates);
  return res.data || { autonomousMode: false, defaultExecutor: 'claude', securityMode: 'advisory' };
}

// Per-identity settings
const DEFAULT_SETTINGS: IdentitySettings = {
  autonomousMode: false,
  executor: 'claude',
  securityMode: 'advisory',
  maxAttempts: 3,
  confidenceThreshold: 0.7,
  availableForWork: true,
};

export async function fetchIdentitySettings(id: string): Promise<IdentitySettings> {
  const res = await api.get<IdentitySettings>(`/identities/${id}/settings`);
  return res.data || DEFAULT_SETTINGS;
}

export async function updateIdentitySettings(
  id: string,
  updates: Partial<IdentitySettings>
): Promise<IdentitySettings> {
  const res = await api.put<IdentitySettings>(`/identities/${id}/settings`, updates);
  return res.data || DEFAULT_SETTINGS;
}

// S5 Operations
export interface PurgeResult {
  ok: boolean;
  purged: string[];
  count: number;
  terminatedTotal: number;
}

export async function purgeTerminated(): Promise<PurgeResult> {
  const res = await api.post<PurgeResult>('/settings/purge-terminated');
  return res.data || { ok: false, purged: [], count: 0, terminatedTotal: 0 };
}

export async function deleteIdentity(id: string, hard: boolean = false): Promise<boolean> {
  const res = await api.delete(`/identities/${id}${hard ? '?hard=true' : ''}`);
  return res.ok;
}

// =============================================================================
// Variety
// =============================================================================

export interface VarietyBalance {
  perceived: number;
  resolved: number;
  ratio: number;
  healthy: boolean;
  byDomain: {
    work: { in: number; out: number };
    environment: { in: number; out: number };
    coordination: { in: number; out: number };
    identity: { in: number; out: number };
  };
}

export interface Resolution {
  initial: number;
  resolved: number;
  position: number;
  collapsed: boolean;
}

export async function fetchVarietyBalance(subject?: string): Promise<VarietyBalance | null> {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  const res = await api.get<VarietyBalance>(`/variety/balance${query}`);
  return res.data || null;
}

export async function fetchResolution(contractId: string): Promise<Resolution | null> {
  const res = await api.get<Resolution>(`/variety/contract/${contractId}`);
  return res.data || null;
}

// =============================================================================
// VSM / Homeostat
// =============================================================================

export interface HomeostatResult {
  balance: VarietyBalance;
  action: 'none' | 'boost_s4' | 'boost_s3';
  allowDispatch: boolean;
  s4Multiplier: number;
  diagnosis: string;
}

export async function fetchHomeostat(): Promise<HomeostatResult | null> {
  const res = await api.get<HomeostatResult>('/vsm/homeostat');
  return res.data || null;
}

export async function fetchVsmHealth(): Promise<HomeostatResult | null> {
  const res = await api.get<HomeostatResult>('/vsm/health');
  return res.data || null;
}

// =============================================================================
// Credits
// =============================================================================

export interface PendingCredit {
  id: string;
  contractId: string;
  amount: string;
  bits: number;
  proofHash: string;
  earnedAt: number;
  identityId: string;
  capabilityBits: number;
}

export async function fetchPendingCredits(): Promise<PendingCredit[]> {
  const res = await api.get<PendingCredit[]>('/credits/pending');
  return res.data || [];
}

export async function fetchTotalCredits(): Promise<string> {
  const res = await api.get<{ total: string }>('/credits/total');
  return res.data?.total || '0';
}

// =============================================================================
// Algedonic
// =============================================================================

export interface AlgedonicSignal {
  id: string;
  type: 'pain' | 'pleasure';
  source: string;
  subject: string;
  projectId?: string;
  workId?: string;
  agentId?: string;
  intensity: number;
  message: string;
  requiresAction: boolean;
  emittedAt: number;
  // Structured failure fields
  failureCode?: string;
  stage?: string;
  remedyType?: 'button' | 'setting' | 'link' | 'auto' | 'manual';
  remedyAction?: string;
  remedyLabel?: string;
  remedyHint?: string;
}

export async function fetchPendingAlgedonics(): Promise<AlgedonicSignal[]> {
  const res = await api.get<AlgedonicSignal[]>('/algedonic/pending');
  return res.data || [];
}

export async function fetchAllAlgedonics(): Promise<AlgedonicSignal[]> {
  const res = await api.get<AlgedonicSignal[]>('/algedonic/all');
  return res.data || [];
}

export async function fetchProjectAlgedonics(projectId: string): Promise<AlgedonicSignal[]> {
  const res = await api.get<AlgedonicSignal[]>(`/algedonic/project/${projectId}`);
  return res.data || [];
}

export async function fetchActiveAlgedonicNodes(): Promise<string[]> {
  const res = await api.get<string[]>('/algedonic/active-nodes');
  return res.data || [];
}

export async function resolveAlgedonic(signalId: string, decision: string): Promise<boolean> {
  const res = await api.post('/algedonic/resolve', { signalId, decision, resolver: 'user' });
  return res.ok;
}

// =============================================================================
// Remedy Actions
// =============================================================================

export async function retryWork(workId: string): Promise<boolean> {
  const res = await api.post(`/work/${workId}/redispatch`);
  return res.ok;
}

export async function terminateWork(workId: string, reason?: string): Promise<boolean> {
  const res = await api.post(`/work/${workId}/terminate`, { reason: reason || 'User requested' });
  return res.ok;
}

export async function cleanupWorktrees(): Promise<{ ok: boolean; cleaned: number }> {
  const res = await api.post<{ ok: boolean; cleaned: number }>('/worktrees/cleanup');
  return res.data || { ok: false, cleaned: 0 };
}

export async function updateIdentitySetting(
  identityId: string,
  setting: string,
  value: unknown
): Promise<boolean> {
  const res = await api.put(`/identities/${identityId}/settings`, { [setting]: value });
  return res.ok;
}

// =============================================================================
// Needs/Approvals
// =============================================================================

export interface PendingNeed {
  key: string;
  conditionId: string;
  contractId: string;
  requirement: string;
  requestedAt: number;
}

export async function fetchPendingNeeds(): Promise<PendingNeed[]> {
  const res = await api.get<PendingNeed[]>('/needs/pending');
  return res.data || [];
}

export async function approveNeed(
  key: string,
  approved: boolean,
  evidence: string
): Promise<boolean> {
  const res = await api.post('/needs/approve', { key, approved, approvedBy: 'user', evidence });
  return res.ok;
}

// =============================================================================
// SSE Events
// =============================================================================

export type ChainEventType =
  | 'variety:work:in' | 'variety:work:out'
  | 'variety:env:in' | 'variety:env:out'
  | 'variety:coord:in' | 'variety:coord:out'
  | 'variety:identity:in' | 'variety:identity:out'
  | 'work:created' | 'work:dispatched' | 'work:fulfilled'
  | 'credit:earned'
  | 'algedonic:pain' | 'algedonic:pleasure';

export interface ChainEvent {
  id: string;
  type: ChainEventType;
  timestamp: number;
  emitter: string;
  subject: string;
  payload: Record<string, unknown>;
}

export function subscribeToEvents(
  onEvent: (event: ChainEvent) => void,
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource(`${window.location.origin}/api/events`);

  eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data) as ChainEvent;
      onEvent(event);
    } catch {
      // Ignore parse errors
    }
  };

  eventSource.onerror = (e) => {
    onError?.(e);
  };

  return () => {
    eventSource.close();
  };
}

// =============================================================================
// Network (EVM) API
// =============================================================================

export interface NetworkConfig {
  rpcUrl: string;
  registryAddress: string;
  loopTokenAddress: string;
}

export interface NetworkStatus {
  connected: boolean;
  memberCount?: number;
  daoCount?: number;
  guardian?: string;
  paused?: boolean;
  loopToken?: {
    totalSupply: string;
    mintedToday: string;
    dailyCap: string;
  };
  error?: string;
}

export interface NetworkDAO {
  id: string;
  address: string;
  name: string;
  purpose: string;
  memberCount: number;
  workCount: number;
}

export interface NetworkMemberInfo {
  address: string;
  tokenId: number;
}

export interface NetworkTopology {
  registry: {
    address: string;
    memberCount: number;
  };
  daos: NetworkDAO[];
  members: NetworkMemberInfo[];
}

export interface NetworkDAODetail {
  address: string;
  name: string;
  purpose: string;
  memberCount: number;
  workCount: number;
  guardian: string;
  paused: boolean;
  treasuryCap: string;
  members: string[];
}

export interface NetworkMember {
  address: string;
  isMember: boolean;
  loopBalance: string;
}

export async function fetchNetworkConfig(): Promise<NetworkConfig | null> {
  const res = await api.get<NetworkConfig>('/network/config');
  return res.data || null;
}

export async function fetchNetworkStatus(): Promise<NetworkStatus> {
  const res = await api.get<NetworkStatus>('/network/status');
  return res.data || { connected: false, error: 'No response' };
}

export async function fetchNetworkTopology(): Promise<NetworkTopology | null> {
  const res = await api.get<NetworkTopology>('/network/topology');
  return res.data || null;
}

export async function fetchNetworkDAO(address: string): Promise<NetworkDAODetail | null> {
  const res = await api.get<NetworkDAODetail>(`/network/dao/${address}`);
  return res.data || null;
}

export async function fetchNetworkMember(address: string): Promise<NetworkMember | null> {
  const res = await api.get<NetworkMember>(`/network/member/${address}`);
  return res.data || null;
}

// =============================================================================
// Governance API
// =============================================================================

export interface SystemConstants {
  dynamics: {
    β_base: number;
    γ: number;
    learningThreshold: number;
    invocationThreshold: number;
    perceptionThreshold: number;
    τChangeThreshold: number;
    verboseEvents: boolean;
  };
  governance: {
    defaultQuorum: number;
    defaultVotingPeriod: number;
    thresholdFormula: {
      baseThreshold: number;
      scaleFactor: number;
      maxThreshold: number;
    };
    voteFormula: {
      description: string;
      γ: number;
    };
  };
  audit: {
    nodeRate: number;
    contextRate: number;
    daoRate: number;
    lookbackDays: { node: number; context: number; dao: number };
  };
  housekeeping: {
    starvationThresholdMs: number;
    hoardingThresholdMs: number;
    minIntervalMs: number;
  };
}

export interface VotingPower {
  identity: string;
  contribution: number;
  τ: number;
  β: number;
}

export interface Proposal {
  id: string;
  type: 'context' | 'work' | 'claim' | 'amendment';
  scope: { level: string; id?: string; path: string };
  proposer: string;
  target: string;
  resourcesRequested: number;
  deadline: number;
  status: 'open' | 'passed' | 'rejected' | 'expired';
  createdAt: number;
}

export interface ApprovalResult {
  passed: boolean;
  totalWeight: number;
  threshold: number;
  quorum: number;
  participation: number;
  forWeight: number;
  againstWeight: number;
}

export async function fetchSystemConstants(): Promise<SystemConstants | null> {
  const res = await api.get<SystemConstants>('/system/constants');
  return res.data || null;
}

export async function fetchVotingPower(identity: string, level?: string, id?: string): Promise<VotingPower | null> {
  let query = '';
  if (level) {
    query = `?level=${level}`;
    if (id) query += `&id=${encodeURIComponent(id)}`;
  }
  const res = await api.get<VotingPower>(`/voting-power/${encodeURIComponent(identity)}${query}`);
  return res.data || null;
}

export async function fetchProposals(scope?: { level: string; id?: string }): Promise<Proposal[]> {
  let query = '';
  if (scope) {
    query = `?level=${scope.level}`;
    if (scope.id) query += `&id=${encodeURIComponent(scope.id)}`;
  }
  const res = await api.get<Proposal[]>(`/proposals${query}`);
  return res.data || [];
}

export async function fetchProposalApproval(proposalId: string): Promise<ApprovalResult | null> {
  const res = await api.get<ApprovalResult>(`/proposals/${proposalId}/approval`);
  return res.data || null;
}

export async function fetchDelegations(identity: string): Promise<Array<{ to: string; weight: number }>> {
  const res = await api.get<Array<{ to: string; weight: number }>>(`/delegations/${encodeURIComponent(identity)}`);
  return res.data || [];
}

// =============================================================================
// Fix 2: Aggregated Free Energy
// =============================================================================

export interface FreeEnergyAggregateState {
  scope: { level: string; id?: string; path: string };
  F_local: number;
  F_children: number;
  F_total: number;
  childCount: number;
  computedAt: number;
}

export async function fetchFreeEnergyAggregate(
  level: string,
  id?: string,
  address?: string
): Promise<FreeEnergyAggregateState | null> {
  const params = new URLSearchParams({ level });
  if (id) params.set('id', id);
  if (address) params.set('address', address);

  const res = await api.get<FreeEnergyAggregateState>(`/dynamics/free-energy/aggregate?${params}`);
  return res.data || null;
}
