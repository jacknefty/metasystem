/**
 * Conversation — LLM-driven PM conversation
 *
 * Each turn sends full history to LLM with extraction prompt.
 * LLM responds naturally AND populates contract fields.
 * No state machine, no canned questions.
 */

import { execute } from '../../../operations/executor.js';
import type { PMSession, PartialContract, InferredField, Risk, ContractConstraints, HubContext } from './types.js';

export interface ConversationResult {
  response: string;
  partialContract: PartialContract;
  readyToDecompose: boolean;
  clarificationNeeded: string | null;
}

export async function converseTurn(
  session: PMSession,
  userMessage: string,
  context: HubContext
): Promise<ConversationResult> {
  const prompt = buildConversationPrompt(session, userMessage, context);

  const result = await execute(prompt, 'claude', {
    workingDir: context.contextDir,
    timeout: 90000,
    autonomous: true,
  });

  if (!result.success) {
    console.warn('PM conversation execution failed:', result.error);
    return {
      response: "I'm having trouble processing that. Could you rephrase what you're trying to build?",
      partialContract: session.partialContract,
      readyToDecompose: false,
      clarificationNeeded: null,
    };
  }

  const parsed = parseJsonFromText(result.output);
  if (!parsed) {
    console.warn('PM conversation parse failed');
    return {
      response: result.output || "I didn't catch that. What are you trying to accomplish?",
      partialContract: session.partialContract,
      readyToDecompose: false,
      clarificationNeeded: null,
    };
  }

  const updatedContract = mergeExtractedFields(session.partialContract, parsed.extraction || {});

  return {
    response: parsed.response || "What would you like to build?",
    partialContract: updatedContract,
    readyToDecompose: parsed.readyToDecompose === true,
    clarificationNeeded: parsed.clarificationNeeded || null,
  };
}

function buildConversationPrompt(
  session: PMSession,
  userMessage: string,
  context: HubContext
): string {
  const historyText = session.conversationHistory
    .map(t => `${t.role === 'user' ? 'USER' : 'PM'}: ${t.content}`)
    .join('\n\n');

  const currentFields = formatCurrentFields(session.partialContract);

  return `You are Intelligence (future-oriented) in a Viable System Model, acting as a Product Manager.

Your job: Have a natural conversation to understand what the user wants to build, then break it into work contracts.

HUB CONTEXT:
- Hub: ${context.hubId}
- Languages: ${context.languages.join(', ') || 'unknown'}
- Frameworks: ${context.frameworks.join(', ') || 'none detected'}
- Files: ${context.files.slice(0, 20).join(', ')}${context.files.length > 20 ? ` ... (${context.files.length} total)` : ''}
- Prior work: ${context.priorWork.map(w => `${w.name}(${w.status})`).join(', ') || 'none'}
${context.readme ? `- README excerpt: ${context.readme.slice(0, 300)}...` : ''}

CONVERSATION SO FAR:
${historyText || '(starting conversation)'}

CURRENT UNDERSTANDING (7-field contract):
${currentFields}

NEW MESSAGE FROM USER:
${userMessage}

YOUR TASK:
1. Respond naturally as a PM would — acknowledge what they said, ask clarifying questions, probe for details
2. Extract any new information into the 7 contract fields
3. Judge if you have enough to break this into work (readyToDecompose)

THE 7 FIELDS YOU'RE FILLING:
- problem: What specifically needs to change? What's the pain point?
- successMetric: How will we know it's working? What observable outcome?
- scopeIn: What files/areas ARE in scope?
- scopeOut: What's explicitly NOT in scope? (prevents creep)
- constraints: Time limits, dependencies, resource limits?
- assumptions: Tech stack, existing patterns we're building on?
- risks: What could go wrong? What's the hardest part?

RULES:
- Be conversational, not robotic. No "field1: value1" style responses.
- Ask ONE question at a time, not a list of questions.
- Focus on understanding the OUTCOME they want, not just the task.
- If something is vague, probe it. "A button" → "What does the button do? Who uses it?"
- Don't rush to decompose — make sure you understand first.
- Set readyToDecompose=true only when you have: problem, successMetric, and scopeOut defined.

RESPOND WITH JSON:
{
  "response": "Your natural PM response to the user. Conversational, one question max.",
  "extraction": {
    "problem": null or { "value": "...", "confidence": "high|medium|low", "source": "what told you this" },
    "successMetric": null or { "value": "...", "confidence": "...", "source": "..." },
    "scopeIn": null or { "value": ["path/**", ...], "confidence": "...", "source": "..." },
    "scopeOut": null or { "value": ["not-this", ...], "confidence": "...", "source": "..." },
    "constraints": null or { "value": { "timeframe": "...", ... }, "confidence": "...", "source": "..." },
    "assumptions": null or { "value": ["assumption1", ...], "confidence": "...", "source": "..." },
    "risks": null or { "value": [{ "description": "...", "severity": "high|medium|low" }], "confidence": "...", "source": "..." }
  },
  "readyToDecompose": false,
  "clarificationNeeded": null or "what you need to know before proceeding"
}

Only include extraction fields that you learned NEW information about. Don't repeat unchanged fields.`;
}

function formatCurrentFields(partial: PartialContract): string {
  const lines: string[] = [];

  if (partial.problem) {
    lines.push(`- Problem: ${partial.problem.value} (${partial.problem.confidence} confidence)`);
  } else {
    lines.push('- Problem: NOT YET UNDERSTOOD');
  }

  if (partial.successMetric) {
    lines.push(`- Success Metric: ${partial.successMetric.value}`);
  } else {
    lines.push('- Success Metric: NOT DEFINED');
  }

  if (partial.scopeIn) {
    lines.push(`- Scope In: ${partial.scopeIn.value.join(', ')}`);
  }

  if (partial.scopeOut) {
    lines.push(`- Scope Out: ${partial.scopeOut.value.join(', ')}`);
  } else {
    lines.push('- Scope Out: NOT DEFINED (need this to prevent creep)');
  }

  if (partial.constraints) {
    lines.push(`- Constraints: ${JSON.stringify(partial.constraints.value)}`);
  }

  if (partial.assumptions) {
    lines.push(`- Assumptions: ${partial.assumptions.value.join(', ')}`);
  }

  if (partial.risks) {
    lines.push(`- Risks: ${partial.risks.value.map(r => r.description).join(', ')}`);
  }

  return lines.join('\n');
}

function mergeExtractedFields(existing: PartialContract, extraction: any): PartialContract {
  const updated = { ...existing };

  if (extraction.problem) {
    updated.problem = normalizeField(extraction.problem);
  }

  if (extraction.successMetric) {
    updated.successMetric = normalizeField(extraction.successMetric);
  }

  if (extraction.scopeIn) {
    updated.scopeIn = normalizeField(extraction.scopeIn);
    if (updated.scopeIn && typeof updated.scopeIn.value === 'string') {
      updated.scopeIn.value = [updated.scopeIn.value];
    }
  }

  if (extraction.scopeOut) {
    updated.scopeOut = normalizeField(extraction.scopeOut);
    if (updated.scopeOut && typeof updated.scopeOut.value === 'string') {
      updated.scopeOut.value = [updated.scopeOut.value];
    }
  }

  if (extraction.constraints) {
    updated.constraints = normalizeField(extraction.constraints);
  }

  if (extraction.assumptions) {
    updated.assumptions = normalizeField(extraction.assumptions);
    if (updated.assumptions && typeof updated.assumptions.value === 'string') {
      updated.assumptions.value = [updated.assumptions.value];
    }
  }

  if (extraction.risks) {
    updated.risks = normalizeField(extraction.risks);
    if (updated.risks && Array.isArray(updated.risks.value)) {
      updated.risks.value = updated.risks.value.map((r: any) => ({
        description: typeof r === 'string' ? r : r.description || 'Unknown risk',
        severity: r.severity || 'medium',
        mitigation: r.mitigation,
      }));
    }
  }

  return updated;
}

function normalizeField<T>(field: any): InferredField<T> | null {
  if (!field) return null;
  if (field.value === undefined || field.value === null) return null;

  return {
    value: field.value,
    confidence: field.confidence || 'medium',
    source: field.source || 'conversation',
  };
}

function parseJsonFromText(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function canDecompose(partial: PartialContract): boolean {
  if (!partial.problem || partial.problem.confidence === 'low') {
    return false;
  }

  if (!partial.successMetric) {
    return false;
  }

  if (!partial.scopeOut || partial.scopeOut.value.length === 0) {
    return false;
  }

  return true;
}
