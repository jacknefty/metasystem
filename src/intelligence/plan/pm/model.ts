/**
 * Model — 7-field contract with gap detection
 */

import type { PartialContract, HandoffContract, Gap } from './types.js';

export function detectGaps(partial: PartialContract): Gap[] {
  const gaps: Gap[] = [];

  if (!partial.successMetric || partial.successMetric.confidence === 'low') {
    gaps.push({
      field: 'successMetric',
      reason: 'Cannot verify completion without knowing what success looks like',
      question: 'How will we know this is working? What metric or observable outcome?',
      priority: 'required',
    });
  }

  if (!partial.scopeOut) {
    gaps.push({
      field: 'scopeOut',
      reason: 'Explicit exclusions prevent scope creep',
      question: "What's explicitly NOT included in this work? What should we defer?",
      priority: 'required',
    });
  }

  if (!partial.problem || partial.problem.confidence === 'low') {
    gaps.push({
      field: 'problem',
      reason: 'Need to validate understanding of the problem',
      question: 'Let me make sure I understand — is this the right problem statement?',
      priority: 'required',
    });
  }

  if (!partial.risks) {
    gaps.push({
      field: 'risks',
      reason: 'Identifying risks early prevents surprises',
      question: "What's the hardest part? What could go wrong?",
      priority: 'recommended',
    });
  }

  if (!partial.constraints || partial.constraints.confidence === 'low') {
    gaps.push({
      field: 'constraints',
      reason: 'Constraints bound the solution space',
      question: 'Any time pressure, resource limits, or external dependencies?',
      priority: 'optional',
    });
  }

  return gaps;
}

export function isContractComplete(partial: PartialContract): boolean {
  const gaps = detectGaps(partial);
  const requiredGaps = gaps.filter(g => g.priority === 'required');
  return requiredGaps.length === 0;
}

export function finalizeContract(partial: PartialContract): HandoffContract {
  return {
    problem: partial.problem?.value || 'No problem statement',
    successMetric: partial.successMetric?.value || 'Manual review',
    scopeIn: partial.scopeIn?.value || ['**'],
    scopeOut: partial.scopeOut?.value || [],
    constraints: partial.constraints?.value || {},
    assumptions: partial.assumptions?.value || [],
    risks: partial.risks?.value || [],
  };
}

export function applyUserResponse(
  partial: PartialContract,
  field: keyof HandoffContract,
  value: string
): PartialContract {
  const updated = { ...partial };

  switch (field) {
    case 'problem':
      updated.problem = {
        value: value,
        confidence: 'high',
        source: 'user input',
      };
      break;

    case 'successMetric':
      updated.successMetric = {
        value: value,
        confidence: 'high',
        source: 'user input',
      };
      break;

    case 'scopeOut':
      updated.scopeOut = {
        value: value.split(',').map(s => s.trim()).filter(Boolean),
        confidence: 'high',
        source: 'user input',
      };
      break;

    case 'scopeIn':
      updated.scopeIn = {
        value: value.split(',').map(s => s.trim()).filter(Boolean),
        confidence: 'high',
        source: 'user input',
      };
      break;

    case 'risks':
      updated.risks = {
        value: [{ description: value, severity: 'medium' }],
        confidence: 'high',
        source: 'user input',
      };
      break;

    case 'constraints':
      updated.constraints = {
        value: { timeframe: value },
        confidence: 'high',
        source: 'user input',
      };
      break;

    case 'assumptions':
      updated.assumptions = {
        value: value.split(',').map(s => s.trim()).filter(Boolean),
        confidence: 'high',
        source: 'user input',
      };
      break;
  }

  return updated;
}
