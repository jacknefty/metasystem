/**
 * Closure Readiness Probe
 *
 * Verifies marked-complete conditions are actually complete.
 * Checks for orphaned children when parent is closing.
 */

import { at, listChildren } from '../../identity/scoped-paths.js';
import { loadIdentityAtScope, type ClosureCondition } from '../../identity/contract.js';
import { loadSpine } from '../../identity/spine.js';
import { parseVerifier, getVerifier } from '../../control/verify/registry.js';
import type { VerifyContext } from '../../control/verify/types.js';
import type { ProbeResult, ProbeFinding } from './types.js';

export async function probeClosure(scopePath: string): Promise<ProbeResult> {
  const scope = at(scopePath);
  const identity = loadIdentityAtScope(scope);
  const findings: ProbeFinding[] = [];
  const now = Date.now();

  if (!identity) {
    return {
      probeType: 'closure',
      scopeId: scopePath,
      timestamp: now,
      healthy: true,
      findings: [],
      metrics: {},
    };
  }

  // 1. Verify marked-complete conditions are actually complete
  for (const condition of identity.closureConditions) {
    if (condition.completed) {
      const verification = await reverifyCondition(scopePath, condition, identity.frontmatter.id);
      if (!verification.passed) {
        findings.push({
          severity: 3,
          category: 'false_completion',
          message: `Condition "${condition.description}" marked complete but verification fails`,
          evidence: { condition: condition.description, verification },
        });
      }
    }
  }

  // 2. Check for orphaned children (parent closing but children still active)
  if (identity.frontmatter.closes === 'conditions') {
    const allConditionsMet = identity.closureConditions.every(c => c.completed);
    if (allConditionsMet) {
      const children = await listChildren(scope);
      const activeChildren: string[] = [];

      for (const child of children) {
        const childIdentity = loadIdentityAtScope(child);
        if (childIdentity && !childIdentity.frontmatter.closed) {
          activeChildren.push(child.root());
        }
      }

      if (activeChildren.length > 0) {
        findings.push({
          severity: 2,
          category: 'orphan_risk',
          message: `Scope ready to close but ${activeChildren.length} children still active`,
          evidence: { activeChildren },
        });
      }
    }
  }

  return {
    probeType: 'closure',
    scopeId: identity.frontmatter.id,
    timestamp: now,
    healthy: findings.filter(f => f.severity >= 2).length === 0,
    findings,
    metrics: {
      conditionsTotal: identity.closureConditions.length,
      conditionsMet: identity.closureConditions.filter(c => c.completed).length,
    },
  };
}

async function reverifyCondition(
  scopePath: string,
  condition: ClosureCondition,
  hubId: string
): Promise<{ passed: boolean; evidence: string }> {
  // Extract verifier pattern from condition description
  const verifierPattern = extractVerifierPattern(condition.description);
  if (!verifierPattern) {
    return { passed: true, evidence: 'No verifier pattern found' };
  }

  const { type } = parseVerifier(verifierPattern);
  const verifierFn = getVerifier(type);

  if (!verifierFn) {
    return { passed: true, evidence: `Verifier '${type}' not found` };
  }

  const context: VerifyContext = {
    workId: 'closure-check',
    hubId,
    branch: 'main',
    workingDir: scopePath,
    changedFiles: [],
  };

  try {
    const result = await verifierFn(
      { id: 'closure', description: condition.description, verifier: verifierPattern },
      context
    );
    return { passed: result.passed, evidence: result.evidence };
  } catch (err) {
    return { passed: false, evidence: `Verifier error: ${err}` };
  }
}

function extractVerifierPattern(description: string): string | null {
  // Look for verifier patterns like `check:tests` or `test:unit`
  const match = description.match(/`([a-z]+:[a-z_:]+)`/);
  if (match) return match[1];

  // Look for common verifier keywords
  if (description.toLowerCase().includes('tests pass')) return 'test:unit';
  if (description.toLowerCase().includes('build success')) return 'check:build';
  if (description.toLowerCase().includes('no lint')) return 'check:lint';

  return null;
}
