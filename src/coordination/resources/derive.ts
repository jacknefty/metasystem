/**
 * State Derivation from Chain Events
 *
 * Pure functions: events in, state out. No side effects.
 */

import type { ChainEvent, EventPayloads, Condition, Bounty } from '../channels/events.js';
import { DEFAULT_SETTINGS, type NodeSettings } from '../../identity/settings.js';

export type WorkStatus =
  | 'pending'
  | 'active'
  | 'blocked'
  | 'executing'
  | 'pending-review'
  | 'fulfilled'
  | 'terminated';

export type BountyStatus =
  | 'posted'
  | 'claimed'
  | 'submitted'
  | 'verified'
  | 'completed'
  | 'released'
  | 'expired'
  | 'failed';

export type { NodeSettings };
export { DEFAULT_SETTINGS };

export interface DerivedMembership {
  context: string;
  role?: string;
  joinedAt: number;
}

export interface DerivedNode {
  id: string;
  name: string;
  purpose: string;
  scope: string[];
  status: 'active' | 'terminated';
  settings: NodeSettings;
  memberships: DerivedMembership[];
  createdAt: number;
  updatedAt: number;
}

export interface DerivedCondition {
  id: string;
  description: string;
  verifier: string;
  varietyWeight?: number;
  met: boolean;
  confidence: number;
  evidence?: string;
}

export interface Claim {
  nodeId: string;
  claimedAt: number;
  deadline: number;
}

export interface DerivedWork {
  id: string;
  name: string;
  contextId: string;
  contextPath?: string;  // optional - can be resolved from context node at execution time
  ownerId: string;
  status: WorkStatus;
  conditions: DerivedCondition[];
  dependsOn: string[];
  gap: number;
  bounty?: Bounty;
  bountyStatus?: BountyStatus;
  claimableWhen?: { workCompleted: string[] };
  claim?: Claim;
  submission?: {
    branch: string;
    submittedAt: number;
    verificationResult?: {
      passed: boolean;
      confidence: number;
      evidence: string;
      verifiedAt: number;
    };
  };
  createdAt: number;
  updatedAt: number;
}

export function deriveNode(events: ChainEvent[]): DerivedNode | null {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  let node: DerivedNode | null = null;

  for (const event of sorted) {
    switch (event.type) {
      case 'identity:created': {
        const p = event.payload as EventPayloads['identity:created'];
        node = {
          id: event.subject,
          name: p.name,
          purpose: p.purpose,
          scope: p.scope || [],
          status: 'active',
          settings: { ...DEFAULT_SETTINGS },
          memberships: [],
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
        break;
      }

      case 'identity:updated': {
        if (!node) break;
        const p = event.payload as EventPayloads['identity:updated'];
        if (p.field === 'name') node.name = p.newValue as string;
        if (p.field === 'purpose') node.purpose = p.newValue as string;
        if (p.field === 'scope') node.scope = p.newValue as string[];
        node.updatedAt = event.timestamp;
        break;
      }

      case 'identity:settings': {
        if (!node) break;
        const p = event.payload as Partial<NodeSettings>;
        if (p.autonomyLevel !== undefined) node.settings.autonomyLevel = p.autonomyLevel;
        if (p.securityMode !== undefined) node.settings.securityMode = p.securityMode;
        if (p.executor !== undefined) node.settings.executor = p.executor;
        if (p.maxAttempts !== undefined) node.settings.maxAttempts = p.maxAttempts;
        if (p.maxExecutionTime !== undefined) node.settings.maxExecutionTime = p.maxExecutionTime;
        if (p.confidenceThreshold !== undefined) node.settings.confidenceThreshold = p.confidenceThreshold;
        if (p.availableForWork !== undefined) node.settings.availableForWork = p.availableForWork;
        if (p.maxConcurrentWork !== undefined) node.settings.maxConcurrentWork = p.maxConcurrentWork;
        if (p.minBounty !== undefined) node.settings.minBounty = p.minBounty;
        if (p.maxVarietyDebt !== undefined) node.settings.maxVarietyDebt = p.maxVarietyDebt;
        if (p.allowNetworkExecution !== undefined) node.settings.allowNetworkExecution = p.allowNetworkExecution;
        if (p.revealIdentity !== undefined) node.settings.revealIdentity = p.revealIdentity;
        if (p.path !== undefined) node.settings.path = p.path;
        if (p.isRoot !== undefined) node.settings.isRoot = p.isRoot;
        // Dynamics parameters
        if (p.invocationThreshold !== undefined) node.settings.invocationThreshold = p.invocationThreshold;
        if (p.perceptionThreshold !== undefined) node.settings.perceptionThreshold = p.perceptionThreshold;
        if (p.γ !== undefined) node.settings.γ = p.γ;
        if (p.β_base !== undefined) node.settings.β_base = p.β_base;
        node.updatedAt = event.timestamp;
        break;
      }

      case 'identity:terminated': {
        if (!node) break;
        node.status = 'terminated';
        node.updatedAt = event.timestamp;
        break;
      }

      case 'membership:joined': {
        if (!node) break;
        const p = event.payload as EventPayloads['membership:joined'];
        if (event.subject === node.id) {
          node.memberships.push({
            context: p.context,
            role: p.role,
            joinedAt: event.timestamp,
          });
          node.updatedAt = event.timestamp;
        }
        break;
      }

      case 'membership:left': {
        if (!node) break;
        const p = event.payload as EventPayloads['membership:left'];
        if (event.subject === node.id) {
          node.memberships = node.memberships.filter(m => m.context !== p.context);
          node.updatedAt = event.timestamp;
        }
        break;
      }
    }
  }

  return node;
}

export function deriveWork(events: ChainEvent[]): DerivedWork | null {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  let work: DerivedWork | null = null;

  for (const event of sorted) {
    switch (event.type) {
      case 'work:created': {
        const p = event.payload as EventPayloads['work:created'];
        const conditions: DerivedCondition[] = p.conditions.map(c => ({
          id: c.id,
          description: c.description,
          verifier: c.verifier,
          varietyWeight: c.varietyWeight,
          met: false,
          confidence: 0,
        }));

        work = {
          id: event.subject,
          name: p.name,
          contextId: p.contextId,
          contextPath: p.contextPath,
          ownerId: event.emitter,
          status: p.dependsOn?.length ? 'blocked' : 'active',
          conditions,
          dependsOn: p.dependsOn || [],
          gap: conditions.length,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
        break;
      }

      case 'work:posted': {
        if (!work) break;
        const p = event.payload as EventPayloads['work:posted'];
        work.bounty = p.bounty;
        work.claimableWhen = p.claimableWhen;
        work.bountyStatus = 'posted';
        work.status = 'active';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:claimed': {
        if (!work) break;
        const p = event.payload as EventPayloads['work:claimed'];
        work.claim = {
          nodeId: p.nodeId,
          claimedAt: p.claimedAt,
          deadline: p.deadline,
        };
        work.bountyStatus = 'claimed';
        work.status = 'executing';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:submitted': {
        if (!work) break;
        const p = event.payload as EventPayloads['work:submitted'];
        work.submission = {
          branch: p.branch,
          submittedAt: p.submittedAt,
        };
        work.bountyStatus = 'submitted';
        work.status = 'pending-review';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:verified': {
        if (!work) break;
        const p = event.payload as EventPayloads['work:verified'];
        if (work.submission) {
          work.submission.verificationResult = {
            passed: p.passed,
            confidence: p.confidence,
            evidence: p.evidence,
            verifiedAt: p.verifiedAt,
          };
        }
        if (p.passed) {
          work.bountyStatus = 'verified';
        }
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:completed': {
        if (!work) break;
        work.bountyStatus = 'completed';
        work.status = 'fulfilled';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:released': {
        if (!work) break;
        work.claim = undefined;
        work.bountyStatus = 'posted';
        work.status = 'active';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:failed': {
        if (!work) break;
        work.bountyStatus = 'failed';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'work:expired': {
        if (!work) break;
        work.bountyStatus = 'expired';
        work.status = 'terminated';
        work.updatedAt = event.timestamp;
        break;
      }

      case 'condition:met': {
        if (!work) break;
        const p = event.payload as EventPayloads['condition:met'];
        const condition = work.conditions.find(c => c.id === p.conditionId);
        if (condition) {
          condition.met = true;
          condition.confidence = 1.0;
          condition.evidence = p.evidence;
        }
        work.gap = work.conditions.filter(c => !c.met).length;
        work.updatedAt = event.timestamp;
        break;
      }

      case 'condition:confidence': {
        if (!work) break;
        const p = event.payload as EventPayloads['condition:confidence'];
        const condition = work.conditions.find(c => c.id === p.conditionId);
        if (condition) {
          condition.confidence = p.confidence;
          condition.evidence = p.evidence;
        }
        work.updatedAt = event.timestamp;
        break;
      }
    }
  }

  return work;
}

export function deriveAllNodes(events: ChainEvent[]): Map<string, DerivedNode> {
  const bySubject = new Map<string, ChainEvent[]>();

  for (const event of events) {
    if (event.type.startsWith('identity:') || event.type.startsWith('membership:')) {
      const subject = event.subject;
      const list = bySubject.get(subject) || [];
      list.push(event);
      bySubject.set(subject, list);
    }
  }

  const result = new Map<string, DerivedNode>();
  for (const [subject, subjectEvents] of bySubject) {
    const node = deriveNode(subjectEvents);
    if (node) {
      result.set(subject, node);
    }
  }

  return result;
}

export function deriveAllWork(events: ChainEvent[]): Map<string, DerivedWork> {
  const bySubject = new Map<string, ChainEvent[]>();

  const workEventPrefixes = ['work:', 'condition:'];

  for (const event of events) {
    const isWorkEvent = workEventPrefixes.some(prefix => event.type.startsWith(prefix));
    if (isWorkEvent) {
      const subject = event.subject;
      const list = bySubject.get(subject) || [];
      list.push(event);
      bySubject.set(subject, list);
    }
  }

  const result = new Map<string, DerivedWork>();
  for (const [subject, subjectEvents] of bySubject) {
    const work = deriveWork(subjectEvents);
    if (work) {
      result.set(subject, work);
    }
  }

  return result;
}
