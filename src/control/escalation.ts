/**
 * Escalation Ladder — Ultrastability through step parameters
 *
 * When essential variables are breached, escalate through levels:
 * 1. Self-correction (Operations local adjustments)
 * 2. Coordination (lateral help)
 * 3. Reallocation (Control resource shift)
 * 4. Audit (sporadic reality check)
 * 5. Policy (Identity rule change)
 * 6. Command (direct intervention - RARE)
 */

import {
  loadSpine,
  saveSpine,
  checkEssentialVariables,
  type Spine,
  type StepParameter,
  type EscalationLevel,
  type EssentialVariable,
  type PainSignal,
} from '../identity/spine.js';
import type { ScopedPaths } from '../identity/scoped-paths.js';
import { getChain } from '../coordination/channels/chain.js';

// =============================================================================
// ESCALATION STATE
// =============================================================================

export interface EscalationState {
  currentLevel: EscalationLevel;
  breachedVariables: string[];
  attemptedLevels: EscalationLevel[];
  startedAt: number;
  lastAttemptAt: number;
  resolved: boolean;
}

const escalationStates = new Map<string, EscalationState>();

const LEVEL_ORDER: EscalationLevel[] = [
  'self',
  'coordinate',
  'reallocate',
  'audit',
  'policy',
  'command',
];

// =============================================================================
// STEP FUNCTIONS
// =============================================================================

function stepSelf(spine: Spine, param: StepParameter): boolean {
  switch (param.id) {
    case 'local_buffer_size': {
      const current = param.currentValue as number;
      param.currentValue = current * 1.5;
      return true;
    }
    case 'local_attenuation': {
      const current = param.currentValue as number;
      param.currentValue = Math.min(0.5, current + 0.1);
      return true;
    }
    default:
      return false;
  }
}

function stepCoordinate(spine: Spine, param: StepParameter): boolean {
  switch (param.id) {
    case 'load_share_ratio': {
      const current = param.currentValue as number;
      param.currentValue = Math.min(0.5, current + 0.1);
      spine.coordinate.currentLoad += 10;
      return true;
    }
    default:
      return false;
  }
}

function stepReallocate(spine: Spine, param: StepParameter): boolean {
  switch (param.id) {
    case 'resource_priority': {
      const current = param.currentValue as number;
      param.currentValue = current * 1.2;
      spine.request.currentLoad += 10;
      return true;
    }
    default:
      return false;
  }
}

function stepPolicy(spine: Spine, param: StepParameter): boolean {
  switch (param.id) {
    case 'scope_boundary': {
      spine.policy.currentLoad += 10;
      return true;
    }
    default:
      return false;
  }
}

function stepCommand(spine: Spine, param: StepParameter): boolean {
  switch (param.id) {
    case 'operational_override': {
      spine.command.currentLoad += 10;
      return true;
    }
    default:
      return false;
  }
}

function executeStep(spine: Spine, param: StepParameter): boolean {
  switch (param.level) {
    case 'self':
      return stepSelf(spine, param);
    case 'coordinate':
      return stepCoordinate(spine, param);
    case 'reallocate':
      return stepReallocate(spine, param);
    case 'policy':
      return stepPolicy(spine, param);
    case 'command':
      return stepCommand(spine, param);
    default:
      return false;
  }
}

function resetStep(param: StepParameter): void {
  param.currentValue = param.defaultValue;
}

// =============================================================================
// ESCALATION LOGIC
// =============================================================================

export async function checkAndEscalate(scope: ScopedPaths): Promise<{
  escalated: boolean;
  level: EscalationLevel | null;
  breaches: Array<{ variable: EssentialVariable; current: number }>;
}> {
  const spine = loadSpine(scope);
  if (!spine) {
    return { escalated: false, level: null, breaches: [] };
  }

  const checks = checkEssentialVariables(spine);
  const breaches = checks.filter(c => c.breached);

  if (breaches.length === 0) {
    const state = escalationStates.get(spine.scopeId);
    if (state && !state.resolved) {
      state.resolved = true;
      resetAllSteps(spine);
      saveSpine(scope, spine);
    }
    return { escalated: false, level: null, breaches: [] };
  }

  let state = escalationStates.get(spine.scopeId);
  if (!state) {
    state = {
      currentLevel: 'self',
      breachedVariables: breaches.map(b => b.variable.id),
      attemptedLevels: [],
      startedAt: Date.now(),
      lastAttemptAt: Date.now(),
      resolved: false,
    };
    escalationStates.set(spine.scopeId, state);
  }

  const levelParams = spine.stepParameters.filter(p => p.level === state.currentLevel);
  let anyStepSucceeded = false;

  for (const param of levelParams) {
    if (executeStep(spine, param)) {
      anyStepSucceeded = true;
    }
  }

  state.attemptedLevels.push(state.currentLevel);
  state.lastAttemptAt = Date.now();

  const newChecks = checkEssentialVariables(spine);
  const stillBreached = newChecks.filter(c => c.breached);

  if (stillBreached.length === 0) {
    state.resolved = true;
    saveSpine(scope, spine);
    return { escalated: false, level: state.currentLevel, breaches: [] };
  }

  const currentIndex = LEVEL_ORDER.indexOf(state.currentLevel);
  if (currentIndex < LEVEL_ORDER.length - 1) {
    state.currentLevel = LEVEL_ORDER[currentIndex + 1];

    const painSignal: PainSignal = {
      severity: state.currentLevel === 'command' ? 3 : state.currentLevel === 'policy' ? 2 : 1,
      source: 'escalation',
      message: `Escalating to ${state.currentLevel}: ${stillBreached.map(b => b.variable.name).join(', ')}`,
      escalationLevel: currentIndex + 1,
      breachedVariable: stillBreached[0]?.variable.id,
      requiresAttestation: state.currentLevel === 'command',
    };

    spine.alarm.currentLoad += measurePainSeverity(painSignal);
    spine.alarm.lastFired = Date.now();

    await getChain().append('algedonic:pain', 'escalation', spine.scopeId, {
      severity: painSignal.severity,
      source: painSignal.source,
      message: painSignal.message,
      escalationLevel: painSignal.escalationLevel,
      requiresAttestation: painSignal.requiresAttestation,
    });

    saveSpine(scope, spine);
    return {
      escalated: true,
      level: state.currentLevel,
      breaches: stillBreached.map(b => ({ variable: b.variable, current: b.current })),
    };
  }

  saveSpine(scope, spine);
  return {
    escalated: false,
    level: 'command',
    breaches: stillBreached.map(b => ({ variable: b.variable, current: b.current })),
  };
}

function resetAllSteps(spine: Spine): void {
  for (const param of spine.stepParameters) {
    resetStep(param);
  }
}

function measurePainSeverity(signal: PainSignal): number {
  return signal.severity * 10;
}

// =============================================================================
// ALARM PORT OPERATIONS
// =============================================================================

export async function fireAlarm(
  scope: ScopedPaths,
  signal: PainSignal
): Promise<void> {
  const spine = loadSpine(scope);
  if (!spine) return;

  spine.alarm.currentLoad += measurePainSeverity(signal);
  spine.alarm.lastFired = Date.now();
  spine.alarm.overflow = Math.max(0, spine.alarm.currentLoad - spine.alarm.capacity);

  saveSpine(scope, spine);

  await getChain().append('algedonic:pain', signal.source, spine.scopeId, {
    severity: signal.severity,
    source: signal.source,
    message: signal.message,
    escalationLevel: signal.escalationLevel,
    requiresAttestation: signal.requiresAttestation,
  });
}

export async function acknowledgeAlarm(
  scope: ScopedPaths,
  alarmId: string,
  acknowledgedBy: string
): Promise<void> {
  const spine = loadSpine(scope);
  if (!spine) return;

  spine.alarm.currentLoad = Math.max(0, spine.alarm.currentLoad - 10);
  saveSpine(scope, spine);

  await getChain().append('algedonic:acknowledged', acknowledgedBy, alarmId, {
    acknowledgedAt: Date.now(),
  });
}

// =============================================================================
// COMMAND ACTIVATION CHECK
// =============================================================================

export function canActivateCommand(scope: ScopedPaths): {
  canActivate: boolean;
  reason: string;
} {
  const spine = loadSpine(scope);
  if (!spine) {
    return { canActivate: false, reason: 'No spine found' };
  }

  const state = escalationStates.get(spine.scopeId);
  if (!state) {
    return { canActivate: false, reason: 'No escalation in progress' };
  }

  const requiredLevels: EscalationLevel[] = ['self', 'coordinate', 'reallocate', 'audit'];
  const allAttempted = requiredLevels.every(l => state.attemptedLevels.includes(l));

  if (!allAttempted) {
    const missing = requiredLevels.filter(l => !state.attemptedLevels.includes(l));
    return {
      canActivate: false,
      reason: `Must attempt ${missing.join(', ')} before command`,
    };
  }

  const checks = checkEssentialVariables(spine);
  const stillBreached = checks.filter(c => c.breached);

  if (stillBreached.length === 0) {
    return { canActivate: false, reason: 'No breaches requiring command' };
  }

  return { canActivate: true, reason: 'All escalation levels exhausted' };
}

// =============================================================================
// ESCALATION STATE QUERIES
// =============================================================================

export function getEscalationState(scopeId: string): EscalationState | null {
  return escalationStates.get(scopeId) ?? null;
}

export function clearEscalationState(scopeId: string): void {
  escalationStates.delete(scopeId);
}
