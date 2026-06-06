/**
 * valid:<format>:<path> — File format validation
 *
 * Validates that a file exists and is parseable in the declared format.
 * Formats: json, yaml, yml, toml
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parseVerifier } from '../registry.js';
import type { ConditionInput, VerifyContext, VerifierResult } from '../types.js';

type FormatParser = (content: string) => unknown;

function simpleYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let value: unknown = trimmed.slice(colonIdx + 1).trim();

      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null') value = null;
      else if (/^-?\d+$/.test(value as string)) value = parseInt(value as string, 10);
      else if (/^-?\d+\.\d+$/.test(value as string)) value = parseFloat(value as string);
      else if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
        value = (value as string).slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

function simpleToml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let value: unknown = trimmed.slice(eqIdx + 1).trim();

      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (/^-?\d+$/.test(value as string)) value = parseInt(value as string, 10);
      else if (/^-?\d+\.\d+$/.test(value as string)) value = parseFloat(value as string);
      else if ((value as string).startsWith('"') && (value as string).endsWith('"')) {
        value = (value as string).slice(1, -1);
      }

      result[key] = value;
    }
  }

  return result;
}

let yamlParser: FormatParser | null = null;
let tomlParser: FormatParser | null = null;

try {
  yamlParser = require('js-yaml').load;
} catch { /* not installed */ }

try {
  tomlParser = require('@iarna/toml').parse;
} catch { /* not installed */ }

const parsers: Record<string, FormatParser> = {
  json: (content) => JSON.parse(content),
  yaml: yamlParser || simpleYaml,
  yml: yamlParser || simpleYaml,
  toml: tomlParser || simpleToml,
};

export async function verifyValid(
  condition: ConditionInput,
  context: VerifyContext
): Promise<VerifierResult> {
  const { args } = parseVerifier(condition.verifier);

  if (args.length < 2) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: `Invalid verifier format: ${condition.verifier}. Expected valid:<format>:<path>`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const [format, ...pathParts] = args;
  const filePath = pathParts.join(':');
  const parser = parsers[format.toLowerCase()];

  if (!parser) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: `Unknown format: ${format}. Supported: json, yaml, yml, toml`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  const fullPath = join(context.workingDir, filePath);

  if (!existsSync(fullPath)) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: `File not found: ${filePath}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    parser(content);

    return {
      passed: true,
      confidence: 1.0,
      evidence: `File ${filePath} is valid ${format.toUpperCase()}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  } catch (err) {
    return {
      passed: false,
      confidence: 1.0,
      evidence: `Invalid ${format.toUpperCase()}: ${err instanceof Error ? err.message : 'Parse error'}`,
      conditionId: condition.id,
      verifiedAt: Date.now(),
      sourceType: 'deterministic',
    };
  }
}
