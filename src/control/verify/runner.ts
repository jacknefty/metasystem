/**
 * Verification Runner
 */

import { execSync } from 'child_process';
import { getVerifier, parseVerifier } from './registry.js';
import type { VerifierResult, VerifyContext, ConditionInput } from './types.js';
import { getWork, verifyWork } from '../../coordination/resources/work.js';
import { getChain } from '../../coordination/channels/chain.js';
import { getWorktreePath } from '../../operations/worktree.js';
import { enforceScope } from '../../coordination/dampen/scope.js';
import { recordPainSignal } from '../../intelligence/learn/verifiers.js';

function getChangedFiles(workingDir: string): string[] {
  try {
    const output = execSync('git diff --name-only HEAD~1', {
      cwd: workingDir,
      encoding: 'utf-8',
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    try {
      const output = execSync('git ls-files', {
        cwd: workingDir,
        encoding: 'utf-8',
      });
      return output.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}

export async function runVerification(workId: string): Promise<VerifierResult[]> {
  const work = await getWork(workId);
  if (!work) throw new Error(`Work ${workId} not found`);
  if (!work.submission) throw new Error(`Work ${workId} not submitted`);

  const workingDir = getWorktreePath(workId);
  const changedFiles = getChangedFiles(workingDir);

  const scopeResult = await enforceScope(workId, changedFiles);
  if (!scopeResult.valid) {
    const violatedFiles = scopeResult.violations.map(v => v.file).join(', ');

    await verifyWork(
      workId,
      false,
      0,
      `Scope violation: ${violatedFiles}`
    );

    return [{
      passed: false,
      confidence: 1.0,
      evidence: `Files outside node scope: ${violatedFiles}`,
      conditionId: 'scope-check',
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    }];
  }

  const context: VerifyContext = {
    workId,
    hubId: work.hubId,
    branch: work.submission.branch,
    workingDir,
    changedFiles,
  };

  const results: VerifierResult[] = [];
  const chain = getChain();

  for (const condition of work.conditions) {
    const { type } = parseVerifier(condition.verifier);
    const verifierFn = getVerifier(type) ?? getVerifier('llm')!;

    const conditionInput: ConditionInput = {
      id: condition.id,
      description: condition.description,
      verifier: condition.verifier,
      varietyWeight: condition.varietyWeight,
    };

    const result = await verifierFn(conditionInput, context);
    results.push(result);

    if (result.passed) {
      await chain.append('condition:met', 'verifier', workId, {
        conditionId: condition.id,
        evidence: result.evidence,
      });
    } else {
      await chain.append('condition:confidence', 'verifier', workId, {
        conditionId: condition.id,
        confidence: result.confidence,
        evidence: result.evidence,
      });
    }
  }

  const allPassed = results.every(r => r.passed);
  const avgConfidence = results.length > 0
    ? results.reduce((s, r) => s + r.confidence, 0) / results.length
    : 0;

  if (!allPassed) {
    for (const result of results.filter(r => !r.passed)) {
      const condition = work.conditions.find(c => c.id === result.conditionId);
      if (condition) {
        await recordPainSignal(
          work.hubId,
          workId,
          `Verification failed: ${result.evidence}`,
          condition.verifier
        );
      }
    }
  }

  await verifyWork(
    workId,
    allPassed,
    avgConfidence,
    allPassed ? 'All conditions met' : `${results.filter(r => !r.passed).length} conditions failed`
  );

  return results;
}

export function aggregateConfidence(confidences: number[]): number {
  if (confidences.length === 0) return 0;

  let uncertainty = 1.0;
  for (const c of confidences) {
    uncertainty *= (1 - c);
  }
  return 1 - uncertainty;
}
