/**
 * BlackBox Types — Cube Interface Data Structures
 */

export type Face = 'front' | 'back' | 'up' | 'down' | 'left' | 'right';

export type HealthStatus = 'healthy' | 'stressed' | 'critical';

export interface AccountabilitySummary {
  scopeId: string;
  status: HealthStatus;
  aggregateF: number;
  childHealth: {
    healthy: number;
    stressed: number;
    critical: number;
  };
  activeEscalations: number;
  requiresAttention: string[];
  pendingRequests: ResourceRequest[];
  varietyPreserved: number;
}

export interface ResourceRequest {
  id: string;
  type: 'capacity' | 'variety' | 'scope';
  amount: number;
  reason: string;
  from: string;
}

export interface SystemStateForHuman {
  summary: {
    status: HealthStatus;
    statusEmoji: string;
    oneLiner: string;
  };
  attention: AttentionItem[];
  activity: RecentActivity[];
  resources: ResourceSummary;
  actions?: AvailableAction[];
}

export interface AvailableAction {
  id: string;
  label: string;
  command?: string;
  description?: string;
}

export interface AttentionItem {
  id: string;
  type: 'alarm' | 'escalation' | 'request' | 'blocked';
  summary: string;
  actions: Action[];
}

export interface Action {
  id: string;
  label: string;
  type: 'approve' | 'deny' | 'view' | 'escalate';
}

export interface RecentActivity {
  id: string;
  type: string;
  summary: string;
  timestamp: number;
  ago: string;
}

export interface ResourceSummary {
  activeWork: number;
  pendingBounties: number;
  availableCapacity: number;
}

export interface GovernanceView {
  spine: Spine;
  subsystems: SubsystemState[];
  varietyFlow: VarietyFlowSnapshot;
  F: number;
  escalationLevel: number;
  lastAudit: number | null;
  balance: 'control_dominant' | 'intelligence_dominant' | 'balanced';
  recentEvents: ChainEvent[];
}

export interface Spine {
  scopeId: string;
  scopeType: string;
  essentialVariables: EssentialVariable[];
}

export interface EssentialVariable {
  id: string;
  name: string;
  threshold: number;
  currentValue?: number;
}

export interface SubsystemState {
  id: string;
  name: string;
  health: HealthStatus;
  load: number;
  capacity: number;
}

export interface VarietyFlowSnapshot {
  totalIn: number;
  totalOut: number;
  throughput: number;
  bottlenecks: string[];
}

export interface ChainEvent {
  id: string;
  type: string;
  timestamp: number;
  emitter: string;
  subject: string;
}

export interface ChildSummary {
  id: string;
  name: string;
  type: string;
  status: HealthStatus;
  F: number;
  progress: number;
  pendingInterventions: string[];
}
