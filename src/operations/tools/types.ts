/**
 * Tool Types
 *
 * Scale-free: same interface for shell commands, MCP tools,
 * API calls, or domain-specific capabilities.
 */

export type ToolSource = 'builtin' | 'mcp';

export interface ToolSpec {
  id: string;
  name: string;
  source: ToolSource;
  description: string;

  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };

  capabilities: ToolCapability[];

  // Path parameters for scope enforcement
  pathParameters?: string[];

  // Auto-detect paths (default true for file: capabilities)
  autoDetectPaths?: boolean;

  timeout?: number;
  retryable?: boolean;
  idempotent?: boolean;
}

export type ToolCapability =
  | 'file:read'
  | 'file:write'
  | 'network:fetch'
  | 'network:search'
  | 'shell:execute'
  | 'git:read'
  | 'git:write'
  | 'external:api'
  | string;

export interface ToolInvocation {
  toolId: string;
  parameters: Record<string, unknown>;
  context: {
    nodeId: string;
    workId?: string;
    scope: string[];
  };
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  durationMs: number;
  truncated?: boolean;
}

export interface ToolProvider {
  source: ToolSource;
  list(): Promise<ToolSpec[]>;
  invoke(spec: ToolSpec, params: Record<string, unknown>): Promise<ToolResult>;
  healthCheck?(): Promise<boolean>;
}
