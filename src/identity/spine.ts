/**
 * Spine — Scale-Free VSM Port Structure
 *
 * Every scope has an identical spine — the invariant skeletal structure
 * where channels can attach. The spine defines WHERE connections CAN exist.
 * Operations build transducers that BIND to these ports.
 *
 * Spine = attachment points (invariant, scaffolded)
 * Channels = transducers bound to ports (built by operations)
 * Operations = work flowing through channels
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ScopedPaths } from './scoped-paths.js';

// =============================================================================
// PORT FUNDAMENTALS
// =============================================================================

export type PortDirection = 'in' | 'out' | 'bidirectional';
export type PortTrigger = 'continuous' | 'periodic' | 'event' | 'sporadic';

export interface Port<T = unknown> {
  id: string;
  direction: PortDirection;
  trigger: PortTrigger;

  capacity: number;
  currentLoad: number;
  overflow: number;

  bound: boolean;
  lastFired: number;
  cycleMs: number;
}

export interface Transducer<T = unknown> {
  inward?: (external: unknown) => T;
  outward?: (internal: T) => unknown;
  varietyPreserved: number;
}

// =============================================================================
// ESSENTIAL VARIABLES (Ashby)
// =============================================================================

export interface EssentialVariable {
  id: string;
  name: string;
  description: string;
  min: number;
  max: number;
  severity: 'warning' | 'critical' | 'fatal';
  currentValue?: number;
  lastChecked?: number;
}

// =============================================================================
// STEP PARAMETERS (Ultrastability)
// =============================================================================

export type EscalationLevel =
  | 'self'
  | 'coordinate'
  | 'reallocate'
  | 'audit'
  | 'policy'
  | 'command';

export interface StepParameter {
  id: string;
  level: EscalationLevel;
  description: string;
  defaultValue: unknown;
  currentValue: unknown;
}

// =============================================================================
// TIME INVARIANTS
// =============================================================================

export interface TimeInvariants {
  coordinate_lt_alarm: boolean;
  report_lt_bargain: boolean;
  alarm_lt_audit: boolean;
  audit_lt_command: boolean;
  command_rare: boolean;
}

// =============================================================================
// PORT PAYLOAD TYPES
// =============================================================================

export interface ExternalVariety {
  source: string;
  bits: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface InternalState {
  scopeId: string;
  F: number;
  status: string;
  timestamp: number;
}

export interface EnvironmentalSignal {
  source: string;
  signalType: 'opportunity' | 'threat' | 'change';
  bits: number;
  confidence: number;
}

export interface AccountabilityReport {
  period: { start: number; end: number };
  varietyIn: number;
  varietyOut: number;
  F: number;
  anomalies: string[];
}

export interface PainSignal {
  severity: 1 | 2 | 3;
  source: string;
  message: string;
  escalationLevel: number;
  breachedVariable?: string;
  requiresAttestation: boolean;
}

export interface ResourceRequest {
  requestType: 'capacity' | 'budget' | 'time' | 'assistance';
  amount: number;
  justification: string;
  urgency: 'low' | 'medium' | 'high';
}

export interface ResourceNegotiation {
  direction: 'offer' | 'counter' | 'accept' | 'reject';
  resources: Record<string, number>;
  conditions: string[];
  iteration: number;
}

export interface IdentityConstraint {
  constraintType: 'scope' | 'boundary' | 'obligation';
  rule: string;
  enforcedAt: number;
}

export interface Intervention {
  type: 'override' | 'suspend' | 'terminate';
  reason: string;
  exitConditions: string[];
  policyUpdate?: string;
}

export interface CoordinationSignal {
  signalType: 'timing' | 'resource' | 'conflict';
  affectedResource?: string;
  proposedResolution?: string;
}

export interface OperationalOutput {
  outputType: string;
  variety: number;
  destination?: string;
}

export interface OperationalInput {
  inputType: string;
  variety: number;
  source: string;
}

export interface SharedEnvironment {
  environmentId: string;
  sharedVariety: number;
  participants: string[];
}

export interface ControlIntelligenceTension {
  controlPriority: number;
  intelligencePriority: number;
  resolution: 'control' | 'intelligence' | 'balanced';
}

export interface AuditProbe {
  probeType: 'verify' | 'sample' | 'full';
  target: string;
  randomSeed: number;
}

export interface ScopeCreation {
  childType: 'hub' | 'epic' | 'story' | 'task' | 'node';
  childId: string;
  purpose: string;
}

export interface ChildReport {
  childId: string;
  report: AccountabilityReport;
}

export interface ChildIntervention {
  childId: string;
  intervention: Intervention;
}

// =============================================================================
// SPINE INTERFACE
// =============================================================================

export type ScopeType = 'dao' | 'hub' | 'epic' | 'story' | 'task' | 'node';

export interface Spine {
  scopeId: string;
  scopeType: ScopeType;

  // HORIZONTAL: Environment ↔ Operations
  ingress: Port<ExternalVariety>;
  egress: Port<InternalState>;

  // HORIZONTAL: Environment → Intelligence
  scan: Port<EnvironmentalSignal>;

  // VERTICAL UPWARD: Child → Parent
  report: Port<AccountabilityReport>;
  alarm: Port<PainSignal>;
  request: Port<ResourceRequest>;

  // VERTICAL DOWNWARD: Parent → Child
  bargain: Port<ResourceNegotiation>;
  policy: Port<IdentityConstraint>;
  command: Port<Intervention>;

  // LATERAL: Sibling ↔ Sibling
  coordinate: Port<CoordinationSignal>;
  supply: Port<OperationalOutput>;
  receive: Port<OperationalInput>;
  intersect: Port<SharedEnvironment>;

  // METASYSTEM INTERNAL
  balance: Port<ControlIntelligenceTension>;

  // DIAGONAL: Audit (sporadic)
  audit: Port<AuditProbe>;

  // RECURSIVE: Parent → Children
  spawn: Port<ScopeCreation>;
  observe: Port<ChildReport>;
  intervene: Port<ChildIntervention>;

  // ULTRASTABILITY
  essentialVariables: EssentialVariable[];
  stepParameters: StepParameter[];
  timeInvariants: TimeInvariants;

  // AUDIT TRACKING
  lastAuditTime: number;

  // ACCOUNTABILITY (optional for backward compatibility)
  createdAt?: number;
  lastReportedF?: number;
}

// =============================================================================
// TIME SCALES (expected frequencies for anomaly detection)
// =============================================================================

export const TIME_SCALES: Record<string, number> = {
  ingress: 100,
  egress: 100,
  scan: 1000,
  coordinate: 500,
  supply: 500,
  receive: 500,
  intersect: 1000,
  balance: 5000,
  report: 60000,
  bargain: 300000,
  observe: 60000,
  alarm: 0,
  request: 0,
  policy: 86400000,
  command: Infinity,
  spawn: 0,
  intervene: 0,
  audit: -1,
};

// =============================================================================
// DEFAULT ESSENTIAL VARIABLES
// =============================================================================

export const DEFAULT_ESSENTIAL_VARIABLES: EssentialVariable[] = [
  {
    id: 'variety_overflow',
    name: 'Variety Overflow',
    description: 'Unabsorbed variety across all ports',
    min: 0,
    max: 0.2,
    severity: 'warning',
  },
  {
    id: 'response_lag',
    name: 'Response Lag',
    description: 'Time to process vs time between disturbances',
    min: 0,
    max: 0.8,
    severity: 'critical',
  },
  {
    id: 'coordination_oscillation',
    name: 'Coordination Oscillation',
    description: 'Are siblings fighting over resources?',
    min: 0,
    max: 3,
    severity: 'warning',
  },
  {
    id: 'identity_drift',
    name: 'Identity Drift',
    description: 'Deviation from declared scope/purpose',
    min: 0,
    max: 0.1,
    severity: 'critical',
  },
];

// =============================================================================
// DEFAULT STEP PARAMETERS
// =============================================================================

export const DEFAULT_STEP_PARAMETERS: StepParameter[] = [
  {
    id: 'local_buffer_size',
    level: 'self',
    description: 'Increase local variety buffer',
    defaultValue: 100,
    currentValue: 100,
  },
  {
    id: 'local_attenuation',
    level: 'self',
    description: 'Increase input filtering',
    defaultValue: 0.1,
    currentValue: 0.1,
  },
  {
    id: 'load_share_ratio',
    level: 'coordinate',
    description: 'Request siblings absorb overflow',
    defaultValue: 0,
    currentValue: 0,
  },
  {
    id: 'resource_priority',
    level: 'reallocate',
    description: 'Increase resource allocation from parent',
    defaultValue: 1.0,
    currentValue: 1.0,
  },
  {
    id: 'scope_boundary',
    level: 'policy',
    description: 'Adjust declared scope',
    defaultValue: null,
    currentValue: null,
  },
  {
    id: 'operational_override',
    level: 'command',
    description: 'Direct operational rules change',
    defaultValue: null,
    currentValue: null,
  },
];

// =============================================================================
// PORT FACTORY
// =============================================================================

function createPort<T>(
  id: string,
  direction: PortDirection,
  trigger: PortTrigger,
  capacity: number = 1000
): Port<T> {
  return {
    id,
    direction,
    trigger,
    capacity,
    currentLoad: 0,
    overflow: 0,
    bound: false,
    lastFired: 0,
    cycleMs: TIME_SCALES[id] ?? 1000,
  };
}

// =============================================================================
// SPINE FACTORY
// =============================================================================

export function createSpine(scopeId: string, scopeType: ScopeType): Spine {
  return {
    scopeId,
    scopeType,

    // Horizontal (Operations)
    ingress: createPort('ingress', 'in', 'continuous'),
    egress: createPort('egress', 'out', 'continuous'),

    // Horizontal (Intelligence)
    scan: createPort('scan', 'in', 'continuous', 500),

    // Vertical upward
    report: createPort('report', 'out', 'periodic'),
    alarm: createPort('alarm', 'out', 'event'),
    request: createPort('request', 'out', 'event'),

    // Vertical downward
    bargain: createPort('bargain', 'bidirectional', 'periodic'),
    policy: createPort('policy', 'in', 'event'),
    command: createPort('command', 'in', 'event'),

    // Lateral
    coordinate: createPort('coordinate', 'bidirectional', 'continuous'),
    supply: createPort('supply', 'out', 'continuous'),
    receive: createPort('receive', 'in', 'continuous'),
    intersect: createPort('intersect', 'bidirectional', 'continuous'),

    // Metasystem internal
    balance: createPort('balance', 'bidirectional', 'continuous'),

    // Diagonal
    audit: createPort('audit', 'in', 'sporadic'),

    // Recursive
    spawn: createPort('spawn', 'out', 'event'),
    observe: createPort('observe', 'in', 'periodic'),
    intervene: createPort('intervene', 'out', 'event'),

    // Ultrastability
    essentialVariables: [...DEFAULT_ESSENTIAL_VARIABLES],
    stepParameters: DEFAULT_STEP_PARAMETERS.map(p => ({ ...p })),
    timeInvariants: {
      coordinate_lt_alarm: true,
      report_lt_bargain: true,
      alarm_lt_audit: true,
      audit_lt_command: true,
      command_rare: true,
    },

    lastAuditTime: 0,
  };
}

// =============================================================================
// SPINE PERSISTENCE
// =============================================================================

export function getSpinePath(scope: ScopedPaths): string {
  return join(scope.root(), 'spine.json');
}

export function loadSpine(scope: ScopedPaths): Spine | null {
  const path = getSpinePath(scope);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as Spine;
  } catch {
    return null;
  }
}

export function saveSpine(scope: ScopedPaths, spine: Spine): void {
  const path = getSpinePath(scope);
  writeFileSync(path, JSON.stringify(spine, null, 2));
}

export function ensureSpine(scope: ScopedPaths, scopeId: string, scopeType: ScopeType): Spine {
  let spine = loadSpine(scope);
  if (!spine) {
    spine = createSpine(scopeId, scopeType);
    saveSpine(scope, spine);
  }
  return spine;
}

// =============================================================================
// PORT OPERATIONS
// =============================================================================

const transducers = new Map<string, Transducer>();

export function bind<T>(port: Port<T>, transducer: Transducer<T>): void {
  const key = `${port.id}`;
  transducers.set(key, transducer as Transducer);
  port.bound = true;
}

export function unbind<T>(port: Port<T>): void {
  const key = `${port.id}`;
  transducers.delete(key);
  port.bound = false;
}

export function getTransducer<T>(port: Port<T>): Transducer<T> | null {
  const key = `${port.id}`;
  return (transducers.get(key) as Transducer<T>) ?? null;
}

export function receive<T>(port: Port<T>, external: unknown): T {
  if (!port.bound) {
    throw new Error(`Port ${port.id} unbound`);
  }
  const transducer = getTransducer(port);
  if (!transducer?.inward) {
    throw new Error(`Port ${port.id} has no inward transducer`);
  }
  const internal = transducer.inward(external);
  const bits = measureVariety(internal);
  port.currentLoad += bits;
  port.overflow = Math.max(0, port.currentLoad - port.capacity);
  port.lastFired = Date.now();
  return internal;
}

export function send<T>(port: Port<T>, internal: T): unknown {
  if (!port.bound) {
    throw new Error(`Port ${port.id} unbound`);
  }
  const transducer = getTransducer(port);
  if (!transducer?.outward) {
    throw new Error(`Port ${port.id} has no outward transducer`);
  }
  const external = transducer.outward(internal);
  const bits = measureVariety(internal);
  port.currentLoad += bits;
  port.overflow = Math.max(0, port.currentLoad - port.capacity);
  port.lastFired = Date.now();
  return external;
}

export function resetCycle(port: Port): void {
  port.currentLoad = 0;
  port.overflow = 0;
}

export function measureVariety(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Math.ceil(Math.log2(Math.abs(value) + 1));
  if (typeof value === 'string') return value.length;
  if (typeof value === 'object') {
    const json = JSON.stringify(value);
    return Math.ceil(json.length * 0.5);
  }
  return 1;
}

// =============================================================================
// SPINE METRICS
// =============================================================================

export function sumOverflow(spine: Spine): number {
  const ports = [
    spine.ingress, spine.egress, spine.scan,
    spine.report, spine.alarm, spine.request,
    spine.bargain, spine.policy, spine.command,
    spine.coordinate, spine.supply, spine.receive, spine.intersect,
    spine.balance, spine.audit,
    spine.spawn, spine.observe, spine.intervene,
  ];
  return ports.reduce((sum, p) => sum + p.overflow, 0);
}

export function sumCapacity(spine: Spine): number {
  const ports = [
    spine.ingress, spine.egress, spine.scan,
    spine.report, spine.alarm, spine.request,
    spine.bargain, spine.policy, spine.command,
    spine.coordinate, spine.supply, spine.receive, spine.intersect,
    spine.balance, spine.audit,
    spine.spawn, spine.observe, spine.intervene,
  ];
  return ports.reduce((sum, p) => sum + p.capacity, 0);
}

export function sumLoad(spine: Spine): number {
  return getAllPorts(spine).reduce((sum, p) => sum + p.currentLoad, 0);
}

export function getAllPorts(spine: Spine): Port[] {
  return [
    spine.ingress, spine.egress, spine.scan,
    spine.report, spine.alarm, spine.request,
    spine.bargain, spine.policy, spine.command,
    spine.coordinate, spine.supply, spine.receive, spine.intersect,
    spine.balance, spine.audit,
    spine.spawn, spine.observe, spine.intervene,
  ];
}

export function sumLoadByDirection(spine: Spine, direction: 'in' | 'out'): number {
  const inPorts = [spine.ingress, spine.receive, spine.scan, spine.policy, spine.command, spine.observe];
  const outPorts = [spine.egress, spine.supply, spine.report, spine.alarm, spine.request, spine.spawn, spine.intervene];
  const ports = direction === 'in' ? inPorts : outPorts;
  return ports.reduce((sum, p) => sum + p.currentLoad, 0);
}

// =============================================================================
// ESSENTIAL VARIABLE EVALUATION
// =============================================================================

export function evaluateEssentialVariable(
  ev: EssentialVariable,
  spine: Spine
): { current: number; breached: boolean } {
  let current: number;

  switch (ev.id) {
    case 'variety_overflow': {
      const totalCapacity = sumCapacity(spine);
      current = totalCapacity > 0 ? sumOverflow(spine) / totalCapacity : 0;
      break;
    }
    case 'response_lag': {
      current = 0;
      break;
    }
    case 'coordination_oscillation': {
      current = 0;
      break;
    }
    case 'identity_drift': {
      current = 0;
      break;
    }
    default:
      current = 0;
  }

  const breached = current < ev.min || current > ev.max;
  return { current, breached };
}

export function checkEssentialVariables(spine: Spine): Array<{
  variable: EssentialVariable;
  current: number;
  breached: boolean;
}> {
  return spine.essentialVariables.map(ev => ({
    variable: ev,
    ...evaluateEssentialVariable(ev, spine),
  }));
}

// =============================================================================
// TIME INVARIANT CHECKING
// =============================================================================

export function checkTimeInvariants(spine: Spine): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (spine.coordinate.lastFired > spine.alarm.lastFired && spine.alarm.lastFired > 0) {
    if (!spine.timeInvariants.coordinate_lt_alarm) {
      violations.push('coordinate should fire before alarm');
    }
  }

  if (spine.report.lastFired > spine.bargain.lastFired && spine.bargain.lastFired > 0) {
    if (!spine.timeInvariants.report_lt_bargain) {
      violations.push('report should fire before bargain');
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// =============================================================================
// ANOMALY DETECTION
// =============================================================================

export interface PortAnomaly {
  portId: string;
  type: 'flooding' | 'lagging';
  timeSinceLast: number;
  expectedCycle: number;
}

export function detectPortAnomalies(spine: Spine): PortAnomaly[] {
  const now = Date.now();
  const anomalies: PortAnomaly[] = [];

  const checkPort = (port: Port) => {
    if (port.cycleMs <= 0 || port.cycleMs === Infinity) return;
    if (port.lastFired === 0) return;

    const timeSinceLast = now - port.lastFired;

    if (timeSinceLast < port.cycleMs * 0.1) {
      anomalies.push({
        portId: port.id,
        type: 'flooding',
        timeSinceLast,
        expectedCycle: port.cycleMs,
      });
    }

    if (timeSinceLast > port.cycleMs * 10) {
      anomalies.push({
        portId: port.id,
        type: 'lagging',
        timeSinceLast,
        expectedCycle: port.cycleMs,
      });
    }
  };

  checkPort(spine.ingress);
  checkPort(spine.egress);
  checkPort(spine.scan);
  checkPort(spine.report);
  checkPort(spine.coordinate);
  checkPort(spine.supply);
  checkPort(spine.receive);
  checkPort(spine.balance);
  checkPort(spine.observe);

  return anomalies;
}

// =============================================================================
// AUDIT ACTIVATION
// =============================================================================

const MIN_AUDIT_GAP = 300000; // 5 minutes minimum between audits
const AUDIT_PROBABILITY = 0.10; // 10% chance per eligible check

/**
 * Determine if sporadic audit should trigger.
 * 10% random chance when eligible (enough time since last audit).
 */
export function shouldTriggerAudit(spine: Spine): boolean {
  const now = Date.now();
  const timeSinceLast = now - spine.lastAuditTime;
  const eligible = timeSinceLast > MIN_AUDIT_GAP;
  const random = Math.random() < AUDIT_PROBABILITY;
  return eligible && random;
}

/**
 * Mark that an audit was triggered.
 * Call this after running the audit to update lastAuditTime.
 */
export function markAuditTriggered(spine: Spine): void {
  spine.lastAuditTime = Date.now();
  spine.audit.lastFired = Date.now();
}
