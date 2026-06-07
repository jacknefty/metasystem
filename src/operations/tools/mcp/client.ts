/**
 * MCP Client
 *
 * Protocol implementation for MCP server communication.
 */

import { spawn, type ChildProcess } from 'child_process';
import type { ToolSpec, ToolResult } from '../types.js';

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export class MCPClient {
  private config: MCPServerConfig;
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';

  constructor(config: MCPServerConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.process = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      console.error(`[MCP:${this.config.id}] stderr:`, data.toString());
    });

    this.process.on('error', (err) => {
      console.error(`[MCP:${this.config.id}] Process error:`, err);
    });

    this.process.on('exit', (code) => {
      console.log(`[MCP:${this.config.id}] Process exited with code ${code}`);
      this.process = null;
      for (const pending of this.pending.values()) {
        pending.reject(new Error('MCP process exited'));
      }
      this.pending.clear();
    });

    await this.ping();
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.send({ method: 'ping' });
      return true;
    } catch {
      return false;
    }
  }

  async listTools(): Promise<ToolSpec[]> {
    const response = await this.send({ method: 'tools/list' }) as {
      tools: Array<{
        name: string;
        description: string;
        inputSchema: unknown;
      }>;
    };

    return response.tools.map(t => ({
      id: t.name,
      name: t.name,
      source: 'mcp' as const,
      description: t.description,
      parameters: t.inputSchema as ToolSpec['parameters'],
      capabilities: inferCapabilities(t.name),
    }));
  }

  async invokeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const start = Date.now();

    try {
      const response = await this.send({
        method: 'tools/call',
        params: { name, arguments: params },
      }) as { content: unknown };

      return {
        success: true,
        output: response.content,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'MCP call failed',
        durationMs: Date.now() - start,
      };
    }
  }

  abort(): void {
    for (const pending of this.pending.values()) {
      pending.reject(new Error('Aborted'));
    }
    this.pending.clear();
  }

  private async send(message: { method: string; params?: unknown }): Promise<unknown> {
    if (!this.process?.stdin) {
      throw new Error('Not connected');
    }

    const id = ++this.requestId;
    const request = { jsonrpc: '2.0', id, ...message };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.process!.stdin!.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('MCP request timeout'));
        }
      }, 30000);
    });
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line) as {
          id: number;
          result?: unknown;
          error?: { message: string };
        };
        const pending = this.pending.get(response.id);

        if (pending) {
          this.pending.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error.message));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // Ignore non-JSON output
      }
    }
  }
}

function inferCapabilities(toolName: string): string[] {
  const name = toolName.toLowerCase();
  const caps: string[] = [];

  if (name.includes('read') || name.includes('get') || name.includes('list')) {
    if (name.includes('file')) caps.push('file:read');
    else caps.push('external:api');
  }
  if (name.includes('write') || name.includes('edit') || name.includes('create')) {
    if (name.includes('file')) caps.push('file:write');
    else caps.push('external:api');
  }
  if (name.includes('search')) caps.push('network:search');
  if (name.includes('fetch') || name.includes('http')) caps.push('network:fetch');
  if (name.includes('bash') || name.includes('shell') || name.includes('exec')) caps.push('shell:execute');
  if (name.includes('git')) caps.push(name.includes('read') ? 'git:read' : 'git:write');

  return caps.length > 0 ? caps : ['external:api'];
}
