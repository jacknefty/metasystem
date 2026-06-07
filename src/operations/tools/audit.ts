/**
 * Tool Audit — S3* for tools
 *
 * Sporadic verification that tools are behaving correctly.
 * Uses known-good inputs to validate outputs haven't drifted.
 */

import { invoke } from './invoke.js';
import { listTools } from './index.js';
import { emitPain } from '../../coordination/channels/algedonic.js';
import { getChain } from '../../coordination/channels/chain.js';
import type { ToolResult } from './types.js';

const AUDIT_SAMPLE_RATE = 0.1;

export interface ToolTestCase {
  toolId: string;
  input: Record<string, unknown>;
  expectedOutput?: {
    type: 'exact' | 'contains' | 'regex' | 'truthy' | 'type';
    value: unknown;
  };
  expectSuccess: boolean;
}

export interface ToolAuditResult {
  toolId: string;
  passed: boolean;
  testCase: ToolTestCase;
  actualResult: ToolResult;
  discrepancy?: string;
  auditedAt: number;
}

const testCases = new Map<string, ToolTestCase[]>();

export function registerTestCase(testCase: ToolTestCase): void {
  const cases = testCases.get(testCase.toolId) ?? [];
  cases.push(testCase);
  testCases.set(testCase.toolId, cases);
}

export async function selectForAudit(): Promise<string[]> {
  const tools = listTools();
  const selected: string[] = [];

  for (const tool of tools) {
    if (!testCases.has(tool.id)) continue;

    if (Math.random() < AUDIT_SAMPLE_RATE) {
      selected.push(tool.id);
    }
  }

  return selected;
}

export async function auditTool(toolId: string): Promise<ToolAuditResult | null> {
  const cases = testCases.get(toolId);
  if (!cases || cases.length === 0) return null;

  const testCase = cases[Math.floor(Math.random() * cases.length)];

  const result = await invoke({
    toolId,
    parameters: testCase.input,
    context: {
      nodeId: 'system:audit',
      scope: ['**'],
    },
  });

  const passed = validateResult(testCase, result);
  let discrepancy: string | undefined;

  if (!passed) {
    discrepancy = describeDiscrepancy(testCase, result);

    await emitPain(
      'tool-audit',
      toolId,
      `Tool audit failed: ${discrepancy}`,
      2
    );
  }

  const auditResult: ToolAuditResult = {
    toolId,
    passed,
    testCase,
    actualResult: result,
    discrepancy,
    auditedAt: Date.now(),
  };

  await getChain().append('tool:audited', 'system:audit', toolId, {
    passed,
    discrepancy,
  });

  return auditResult;
}

function validateResult(testCase: ToolTestCase, result: ToolResult): boolean {
  if (result.success !== testCase.expectSuccess) {
    return false;
  }

  if (!testCase.expectedOutput) {
    return true;
  }

  const { type, value } = testCase.expectedOutput;
  const actual = result.output;

  switch (type) {
    case 'exact':
      return JSON.stringify(actual) === JSON.stringify(value);

    case 'contains':
      return JSON.stringify(actual).includes(String(value));

    case 'regex':
      return new RegExp(String(value)).test(JSON.stringify(actual));

    case 'truthy':
      return !!actual === !!value;

    case 'type':
      return typeof actual === value;

    default:
      return true;
  }
}

function describeDiscrepancy(testCase: ToolTestCase, result: ToolResult): string {
  if (result.success !== testCase.expectSuccess) {
    return `Expected ${testCase.expectSuccess ? 'success' : 'failure'}, got ${result.success ? 'success' : 'failure'}`;
  }

  if (testCase.expectedOutput) {
    return `Output mismatch: expected ${testCase.expectedOutput.type} ${JSON.stringify(testCase.expectedOutput.value).slice(0, 100)}`;
  }

  return 'Unknown discrepancy';
}

export async function runToolAuditPass(): Promise<ToolAuditResult[]> {
  const toolIds = await selectForAudit();
  const results: ToolAuditResult[] = [];

  for (const toolId of toolIds) {
    const result = await auditTool(toolId);
    if (result) {
      results.push(result);
    }
  }

  if (results.length > 0) {
    const failed = results.filter(r => !r.passed).length;
    console.log(`[Tool Audit] Audited ${results.length} tools, ${failed} failed`);
  }

  return results;
}

// Built-in test cases
registerTestCase({
  toolId: 'builtin:file:read',
  input: { path: '/dev/null' },
  expectSuccess: true,
  expectedOutput: { type: 'exact', value: '' },
});

registerTestCase({
  toolId: 'builtin:file:read',
  input: { path: '/nonexistent/path/that/should/fail' },
  expectSuccess: false,
});

registerTestCase({
  toolId: 'builtin:shell:execute',
  input: { command: 'echo "audit-test"' },
  expectSuccess: true,
  expectedOutput: { type: 'contains', value: 'audit-test' },
});
