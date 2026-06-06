/**
 * Builtin Tools Provider
 */

import type { ToolSpec, ToolProvider, ToolResult } from '../types.js';
import { readFile, writeFile } from './file.js';
import { executeShell } from './shell.js';

const builtinTools: ToolSpec[] = [
  {
    id: 'builtin:file:read',
    name: 'Read File',
    source: 'builtin',
    description: 'Read contents of a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to read' },
        encoding: { type: 'string', description: 'Encoding (default: utf-8)' },
      },
      required: ['path'],
    },
    capabilities: ['file:read'],
    pathParameters: ['path'],
    idempotent: true,
  },
  {
    id: 'builtin:file:write',
    name: 'Write File',
    source: 'builtin',
    description: 'Write contents to a file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to write' },
        content: { type: 'string', description: 'Content to write' },
        append: { type: 'boolean', description: 'Append instead of overwrite' },
      },
      required: ['path', 'content'],
    },
    capabilities: ['file:write'],
    pathParameters: ['path'],
  },
  {
    id: 'builtin:shell:execute',
    name: 'Execute Shell Command',
    source: 'builtin',
    description: 'Run a shell command',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        cwd: { type: 'string', description: 'Working directory' },
        timeout: { type: 'number', description: 'Timeout in ms' },
      },
      required: ['command'],
    },
    capabilities: ['shell:execute'],
    pathParameters: ['cwd'],
    timeout: 60000,
  },
];

const handlers: Record<string, (params: Record<string, unknown>) => Promise<ToolResult>> = {
  'builtin:file:read': async (params) =>
    readFile(params.path as string, params.encoding as string),
  'builtin:file:write': async (params) =>
    writeFile(params.path as string, params.content as string, params.append as boolean),
  'builtin:shell:execute': async (params) =>
    executeShell(params.command as string, params.cwd as string, params.timeout as number),
};

export const builtinProvider: ToolProvider = {
  source: 'builtin',

  async list(): Promise<ToolSpec[]> {
    return builtinTools;
  },

  async invoke(spec: ToolSpec, params: Record<string, unknown>): Promise<ToolResult> {
    const handler = handlers[spec.id];
    if (!handler) {
      return { success: false, error: `No handler for ${spec.id}`, durationMs: 0 };
    }
    return handler(params);
  },
};
