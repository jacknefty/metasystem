/**
 * LLM Verifier — Ask Claude to verify condition
 *
 * Confidence is capped at 0.7 for code review alone — runtime/behavioral
 * verification would be needed for higher confidence.
 */

import { execute } from '../../../operation/executor.js';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';

const CODE_REVIEW_MAX_CONFIDENCE = 0.7;

export async function verifyWithLLM(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const instruction = `Verify if this condition is satisfied by the code changes.

## Condition
${condition.description}

## Changed Files
${context.changedFiles.length > 0 ? context.changedFiles.join('\n') : '(no files changed)'}

## Instructions
1. Read the relevant changed files
2. Determine if the condition is satisfied
3. Respond ONLY with JSON in this exact format:

\`\`\`json
{"passed": true, "confidence": 0.95, "evidence": "Brief explanation of why condition is/isn't met"}
\`\`\`

Confidence guidelines for code review:
- 0.0-0.2: No evidence of implementation
- 0.3-0.4: Partial implementation, uncertain if complete
- 0.4-0.6: Appears implemented but runtime behavior unverifiable
- 0.6-0.7: Strong implementation evidence with tests or clear logic
Never exceed 0.7 for code review alone.`;

  let attempts = 0;
  while (attempts < 2) {
    const result = await execute(instruction, 'claude', {
      workingDir: context.workingDir,
      timeout: 120000,
      autonomous: true,
    });

    if (!result.success) {
      attempts++;
      continue;
    }

    try {
      const jsonMatch = result.output.match(/```json\s*([\s\S]*?)\s*```/)
                     || result.output.match(/\{[\s\S]*?"passed"[\s\S]*?\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        const parsed = JSON.parse(jsonStr);

        const confidence = Math.min(
          CODE_REVIEW_MAX_CONFIDENCE,
          Math.max(0, parsed.confidence ?? 0.5)
        );
        return {
          passed: !!parsed.passed && confidence >= 0.5,
          confidence,
          evidence: parsed.evidence || 'LLM verification',
          conditionId: condition.id,
          verifiedAt: Date.now(),
          sourceType: 'code-review',
        };
      }
    } catch {
      // Parse failed, retry
    }
    attempts++;
  }

  return {
    passed: false,
    confidence: 0.3,
    evidence: 'LLM verification failed or output could not be parsed',
    conditionId: condition.id,
    verifiedAt: Date.now(),
    sourceType: 'code-review',
  };
}
