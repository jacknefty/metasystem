/**
 * Self-Assessment
 *
 * Post-merge verification using archetype's critical verifiers.
 */

import { getWork } from '../coordination/resources/work.js';
import { classifyContext } from '../intelligence/model/classify.js';
import { getVerifier, parseVerifier } from '../control/verify/registry.js';
import type { VerifyContext } from '../control/verify/types.js';
import { emitPain } from '../coordination/channels/algedonic.js';
import { recordPainSignal } from '../intelligence/learn/verifiers.js';

export interface AssessmentResult {
  workId: string;
  passed: boolean;
  checkedVerifiers: number;
  failures: Array<{
    verifier: string;
    evidence: string;
  }>;
}

export async function selfAssess(workId: string): Promise<AssessmentResult> {
  const work = await getWork(workId);
  if (!work || !work.hubPath) {
    return { workId, passed: true, checkedVerifiers: 0, failures: [] };
  }

  const classification = await classifyContext(work.hubPath);
  if (!classification) {
    return { workId, passed: true, checkedVerifiers: 0, failures: [] };
  }

  const usedVerifiers = new Set(work.conditions.map(c => c.verifier));
  const missing = classification.suggestedVerifiers.filter(
    v => v.category === 'critical' && !usedVerifiers.has(v.pattern)
  );

  if (missing.length === 0) {
    return { workId, passed: true, checkedVerifiers: 0, failures: [] };
  }

  const failures: Array<{ verifier: string; evidence: string }> = [];

  const context: VerifyContext = {
    workId,
    hubId: work.hubId,
    branch: 'main',
    workingDir: work.hubPath,
    changedFiles: [],
  };

  for (const v of missing) {
    const { type } = parseVerifier(v.pattern);
    const verifierFn = getVerifier(type);

    if (!verifierFn) continue;

    try {
      const result = await verifierFn(
        { id: 'self-assess', description: v.rationale, verifier: v.pattern },
        context
      );

      if (!result.passed || result.confidence < 0.7) {
        failures.push({
          verifier: v.pattern,
          evidence: result.evidence,
        });
      }
    } catch (err) {
      failures.push({
        verifier: v.pattern,
        evidence: `Verifier error: ${err}`,
      });
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      await recordPainSignal(
        work.hubId,
        workId,
        `Post-merge check failed: ${failure.evidence}`,
        failure.verifier
      );
    }

    await emitPain(
      'self-assessment',
      workId,
      `Post-merge check found ${failures.length} issue(s): ${failures.map(f => f.verifier).join(', ')}`,
      2,
      work.hubId
    );

    console.log(`[Assessment] ${workId} failed ${failures.length} post-merge checks:`);
    for (const f of failures) {
      console.log(`  - ${f.verifier}: ${f.evidence}`);
    }
  }

  return {
    workId,
    passed: failures.length === 0,
    checkedVerifiers: missing.length,
    failures,
  };
}
