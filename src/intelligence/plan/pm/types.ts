/**
 * Product Manager Types
 *
 * A Concept is what the PM kicks off: a 7-field contract + work graph.
 * - Contract: the agreement (problem, success metric, scope, constraints, assumptions, risks)
 * - Work Graph: the decomposition into epics/stories with variety and leverage scoring
 *
 * W- prefix for work items to avoid collision with VSM S1-S5.
 */

export interface HandoffContract {
  problem: string | null;
  successMetric: string | null;
  scopeIn: string[];
  scopeOut: string[];
  constraints: ContractConstraints;
  assumptions: string[];
  risks: Risk[];
}

export interface ContractConstraints {
  timeframe?: string;
  budget?: string;
  agentCount?: number;
  dependencies?: string[];
}

export interface Risk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  mitigation?: string;
}

export interface InferredField<T> {
  value: T;
  confidence: 'high' | 'medium' | 'low';
  source: string;
}

export interface PartialContract {
  problem: InferredField<string> | null;
  successMetric: InferredField<string> | null;
  scopeIn: InferredField<string[]> | null;
  scopeOut: InferredField<string[]> | null;
  constraints: InferredField<ContractConstraints> | null;
  assumptions: InferredField<string[]> | null;
  risks: InferredField<Risk[]> | null;
}

export interface Epic {
  id: string;
  name: string;
  outcome: string;
  stories: Story[];
}

export interface Story {
  id: string;
  name: string;
  outcome: string;
  conditions: StoryCondition[];
  leverage: number;
  uncertainty: number;
  dependsOn: string[];
  coupledTo: string[];
  status: 'pending' | 'ready' | 'active' | 'complete';
}

export interface StoryCondition {
  description: string;
  verifier: string;
  varietyWeight: number;
}

export interface CouplingEdge {
  from: string;
  to: string;
  strength: 'low' | 'medium' | 'high';
  reason: string;
}

export interface WorkGraph {
  contract: HandoffContract;
  epics: Epic[];
  couplingEdges: CouplingEdge[];
  leveragePoint: string | null;
}

// A Concept is what the PM creates: the full initiative with contract + work breakdown
export interface Concept {
  id: string;
  hubId: string;  // the hub (context node) this concept belongs to
  contract: HandoffContract;
  workGraph: WorkGraph;
  status: 'draft' | 'active' | 'complete' | 'cancelled';
  createdAt: number;
  updatedAt: number;
}

export type PMPhase =
  | 'perceiving'
  | 'shape_discovery'
  | 'analysis'
  | 'review'
  | 'active'
  | 'refining'
  | 'complete';

export interface PMSession {
  id: string;
  contextId: string;  // the hub this PM session is for (legacy name, prefer hubId)
  hubId?: string;     // alias for contextId
  phase: PMPhase;
  partialContract: PartialContract;
  finalContract: HandoffContract | null;
  workGraph: WorkGraph | null;
  conceptId?: string;  // created when work is approved
  conversationHistory: ConversationTurn[];
  createdAt: number;
  updatedAt: number;
}

export interface ConversationTurn {
  role: 'user' | 'pm' | 'system';
  content: string;
  timestamp: number;
  gapsAddressed?: string[];
}

export interface ProductModeRequest {
  contextId: string;
  message: string;
  sessionId?: string;
}

export interface ProductModeResponse {
  sessionId: string;
  phase: PMPhase;
  response: string;
  partialContract?: PartialContract;
  workGraph?: WorkGraph;
  pendingApproval?: boolean;
  workContractsCreated?: string[];
  error?: string;
}

export interface AlgedonicTrigger {
  type: 'scope_change' | 'assumption_violated' | 'uncertainty_high' | 'blocked';
  description: string;
  storyId?: string;
  suggestedAction?: string;
}

export interface Gap {
  field: keyof HandoffContract;
  reason: string;
  question: string;
  priority: 'required' | 'recommended' | 'optional';
}

export interface HubContext {
  hubId: string;
  contextDir: string;  // the filesystem path for this hub
  files: string[];
  readme: string | null;
  packageJson: any | null;
  languages: string[];
  frameworks: string[];
  hasTests: boolean;
  testPattern: string | null;
  priorWork: Array<{ id: string; name: string; status: string; conditions: number }>;
  priorPatterns: string[];
}
