/**
 * Action Selection — Expected Free Energy Minimization
 *
 * G(a, S) = E[F(S') | a] - F(S) + γ × H(model | a)
 *           \_____________/       \____________/
 *            pragmatic            epistemic
 *
 * Select action that minimizes G.
 */

import { getChain } from '../../coordination/channels/chain.js';
import { getWork, listWork } from '../../coordination/resources/work.js';
import { parseVerifier } from '../verify/registry.js';
import { dao, at } from '../../identity/scoped-paths.js';
import type {
  Scope,
  Action,
  ActionType,
  ActionEvaluation,
  PrecisionRecord,
  DynamicsParameters,
} from './types.js';
import { scopeKey, DEFAULT_PARAMETERS } from './types.js';
import { getFreeEnergy } from './free-energy.js';
import { getPrecision, getAggregatePrecision } from './precision.js';

// =============================================================================
// Action Selection
// =============================================================================

export async function selectAction(
  scope: Scope,
  candidates: Action[],
  params: DynamicsParameters = DEFAULT_PARAMETERS
): Promise<Action | null> {
  if (candidates.length === 0) return null;

  const currentF = await getFreeEnergy(scope);
  const evaluations: ActionEvaluation[] = [];

  for (const action of candidates) {
    const evaluation = await evaluateAction(action, currentF, params);
    evaluations.push(evaluation);

    if (params.verboseEvents) {
      await getChain().append('action:evaluated', 'dynamics', action.target, {
        actionId: `${action.type}:${action.target}`,
        scopePath: scope.root(),
        G: evaluation.G,
        pragmatic: evaluation.pragmaticValue,
        epistemic: evaluation.epistemicValue,
      });
    }
  }

  // Select minimum G
  evaluations.sort((a, b) => a.G - b.G);
  const selected = evaluations[0];

  await getChain().append('action:selected', 'dynamics', selected.action.target, {
    actionId: `${selected.action.type}:${selected.action.target}`,
    scopePath: scope.root(),
    G: selected.G,
    alternatives: candidates.length,
  });

  return selected.action;
}

// =============================================================================
// Action Evaluation
// =============================================================================

async function evaluateAction(
  action: Action,
  currentF: number,
  params: DynamicsParameters
): Promise<ActionEvaluation> {
  const expectedF = await estimatePostActionF(action);
  const pragmaticValue = currentF - expectedF;

  const epistemicValue = await estimateEpistemicValue(action, params);

  // G = expectedF - γ × epistemicValue
  // Lower G = better (lower expected F, higher epistemic value)
  const G = expectedF - params.γ * epistemicValue;

  const successProbability = await estimateSuccessProbability(action);
  const relevantPrecisions = await getRelevantPrecisions(action);

  return {
    action,
    currentF,
    expectedF,
    pragmaticValue,
    epistemicValue,
    G,
    successProbability,
    relevantPrecisions,
  };
}

// =============================================================================
// Expected Free Energy (Post-Action)
// =============================================================================

async function estimatePostActionF(action: Action): Promise<number> {
  switch (action.type) {
    case 'claim-work': {
      const work = await getWork(action.target);
      if (!work) return Infinity;

      const P_success = await estimateWorkSuccess(work.id, work.hubId);
      const workScope = dao.hub(work.hubId).task(work.id);
      const workF = await getFreeEnergy(workScope);

      // Expected F = P(failure) × currentF + P(success) × 0
      return workF * (1 - P_success);
    }

    case 'invoke-perception': {
      // Perception increases perceived variety
      const avgPerception = await getAveragePerceptionBits();
      return avgPerception;
    }

    case 'verify-condition': {
      const [workId, conditionId] = action.target.split(':');
      const work = await getWork(workId);
      if (!work) return 0;

      const condition = work.conditions.find(c => c.id === conditionId);
      if (!condition || condition.met) return 0;

      const { type: verifierType } = parseVerifier(condition.verifier);
      const precision = await getPrecision(verifierType, action.scope);

      // Expected F reduction = weight × P(pass)
      const weight = condition.varietyWeight ?? 10;
      return -weight * precision.τ;
    }

    case 'execute': {
      const work = await getWork(action.target);
      if (!work) return Infinity;

      const P_success = await estimateWorkSuccess(work.id, work.hubId);
      const workScope = dao.hub(work.hubId).task(work.id);
      const workF = await getFreeEnergy(workScope);

      return workF * (1 - P_success);
    }
  }
}

// =============================================================================
// Epistemic Value (Uncertainty Reduction)
// =============================================================================

async function estimateEpistemicValue(
  action: Action,
  params: DynamicsParameters
): Promise<number> {
  switch (action.type) {
    case 'claim-work':
    case 'execute': {
      const work = await getWork(action.target);
      if (!work) return 0;

      let value = 0;
      for (const condition of work.conditions) {
        const { type: verifierType } = parseVerifier(condition.verifier);
        const precision = await getPrecision(verifierType, action.scope);

        // Uncertainty = how much we'd learn from this outcome
        const uncertainty = 1 - Math.min(precision.samples / params.learningThreshold, 1);
        const weight = condition.varietyWeight ?? 10;
        value += uncertainty * weight;
      }
      return value;
    }

    case 'verify-condition': {
      const [workId, conditionId] = action.target.split(':');
      const work = await getWork(workId);
      if (!work) return 0;

      const condition = work.conditions.find(c => c.id === conditionId);
      if (!condition) return 0;

      const { type: verifierType } = parseVerifier(condition.verifier);
      const precision = await getPrecision(verifierType, action.scope);

      // High epistemic value if we're uncertain about this verifier
      const uncertainty = 1 - Math.min(precision.samples / params.learningThreshold, 1);
      return uncertainty * 10;
    }

    case 'invoke-perception': {
      // Perception always has some epistemic value
      return 5;
    }
  }
}

// =============================================================================
// Success Probability
// =============================================================================

async function estimateWorkSuccess(workId: string, hubId: string): Promise<number> {
  const work = await getWork(workId);
  if (!work) return 0;

  let P_all_pass = 1.0;
  const workScope = dao.hub(hubId).task(workId);

  for (const condition of work.conditions) {
    if (condition.met) continue;

    const { type: verifierType } = parseVerifier(condition.verifier);
    const precision = await getPrecision(verifierType, workScope);

    // P(this condition passes) ≈ τ
    P_all_pass *= precision.τ;
  }

  return P_all_pass;
}

async function estimateSuccessProbability(action: Action): Promise<number> {
  switch (action.type) {
    case 'claim-work':
    case 'execute': {
      const work = await getWork(action.target);
      if (!work) return 0;
      return estimateWorkSuccess(work.id, work.hubId);
    }

    case 'verify-condition': {
      const [workId, conditionId] = action.target.split(':');
      const work = await getWork(workId);
      if (!work) return 0;

      const condition = work.conditions.find(c => c.id === conditionId);
      if (!condition) return 0;

      const { type: verifierType } = parseVerifier(condition.verifier);
      const precision = await getPrecision(verifierType, action.scope);
      return precision.τ;
    }

    case 'invoke-perception':
      return 0.9; // Perception usually succeeds
  }
}

// =============================================================================
// Relevant Precisions
// =============================================================================

async function getRelevantPrecisions(action: Action): Promise<PrecisionRecord[]> {
  const precisions: PrecisionRecord[] = [];

  switch (action.type) {
    case 'claim-work':
    case 'execute': {
      const work = await getWork(action.target);
      if (!work) return [];

      for (const condition of work.conditions) {
        const { type: verifierType } = parseVerifier(condition.verifier);
        const precision = await getPrecision(verifierType, action.scope);
        precisions.push(precision);
      }
      break;
    }

    case 'verify-condition': {
      const [workId, conditionId] = action.target.split(':');
      const work = await getWork(workId);
      if (!work) return [];

      const condition = work.conditions.find(c => c.id === conditionId);
      if (!condition) return [];

      const { type: verifierType } = parseVerifier(condition.verifier);
      const precision = await getPrecision(verifierType, action.scope);
      precisions.push(precision);
      break;
    }
  }

  return precisions;
}

// =============================================================================
// Historical Estimates
// =============================================================================

async function getAveragePerceptionBits(): Promise<number> {
  const events = await getChain().recall({ type: 'variety:env:in' });
  const recent = events.filter(e => Date.now() - e.timestamp < 3600000);

  if (recent.length === 0) return 10;

  const total = recent.reduce((sum, e) => {
    const payload = e.payload as { bits?: number };
    return sum + (payload.bits ?? 0);
  }, 0);

  return total / recent.length;
}

// =============================================================================
// Candidate Generation
// =============================================================================

export async function getCandidateActions(
  type: ActionType,
  scope: Scope
): Promise<Action[]> {
  switch (type) {
    case 'claim-work': {
      const available = await listWork({ status: 'active' });
      return available
        .filter(w => !w.claim && w.bountyStatus === 'posted')
        .map(w => ({
          type: 'claim-work' as ActionType,
          target: w.id,
          scope,
        }));
    }

    case 'invoke-perception': {
      return [{
        type: 'invoke-perception',
        target: scopeKey(scope),
        scope,
      }];
    }

    case 'verify-condition': {
      const work = await listWork({});
      const actions: Action[] = [];

      for (const w of work) {
        if (w.bountyStatus !== 'submitted') continue;
        for (const c of w.conditions) {
          if (c.met) continue;
          actions.push({
            type: 'verify-condition',
            target: `${w.id}:${c.id}`,
            scope,
          });
        }
      }
      return actions;
    }

    case 'execute': {
      const claimed = await listWork({});
      return claimed
        .filter(w => w.claim && w.status === 'active')
        .map(w => ({
          type: 'execute' as ActionType,
          target: w.id,
          scope,
        }));
    }
  }
}
