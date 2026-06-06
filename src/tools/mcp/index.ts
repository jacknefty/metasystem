/**
 * MCP Provider
 *
 * Connects to MCP servers to discover and invoke tools.
 */

import { existsSync, readFileSync } from 'fs';
import type { ToolSpec, ToolProvider, ToolResult } from '../types.js';
import { MCPClient, type MCPServerConfig } from './client.js';
import { paths } from '../../identity/paths.js';

const clients = new Map<string, MCPClient>();
let serverConfigs: MCPServerConfig[] = [];

function loadServerConfigs(): MCPServerConfig[] {
  const configPath = paths.tools.mcpServers();
  if (!existsSync(configPath)) return [];

  try {
    const data = JSON.parse(readFileSync(configPath, 'utf-8'));
    return data.servers ?? [];
  } catch (err) {
    console.error('[MCP] Failed to load server configs:', err);
    return [];
  }
}

export function registerMCPServer(config: MCPServerConfig): void {
  serverConfigs.push(config);
}

export async function connectAll(): Promise<void> {
  serverConfigs = loadServerConfigs();

  for (const config of serverConfigs) {
    if (!config.enabled) continue;

    try {
      const client = new MCPClient(config);
      await client.connect();
      clients.set(config.id, client);
      console.log(`[MCP] Connected to ${config.name}`);
    } catch (err) {
      console.error(`[MCP] Failed to connect to ${config.name}:`, err);
    }
  }
}

export async function disconnectAll(): Promise<void> {
  for (const [id, client] of clients) {
    await client.disconnect();
    clients.delete(id);
  }
}

export const mcpProvider: ToolProvider = {
  source: 'mcp',

  async list(): Promise<ToolSpec[]> {
    const tools: ToolSpec[] = [];

    for (const [serverId, client] of clients) {
      try {
        const serverTools = await client.listTools();
        tools.push(...serverTools.map(t => ({
          ...t,
          id: `mcp:${serverId}:${t.id}`,
        })));
      } catch (err) {
        console.error(`[MCP] Failed to list tools from ${serverId}:`, err);
      }
    }

    return tools;
  },

  async invoke(spec: ToolSpec, params: Record<string, unknown>): Promise<ToolResult> {
    const parts = spec.id.split(':');
    if (parts.length < 3 || parts[0] !== 'mcp') {
      return { success: false, error: 'Invalid MCP tool ID', durationMs: 0 };
    }

    const serverId = parts[1];
    const toolName = parts.slice(2).join(':');

    const client = clients.get(serverId);
    if (!client) {
      return { success: false, error: `MCP server not connected: ${serverId}`, durationMs: 0 };
    }

    return client.invokeTool(toolName, params);
  },

  async healthCheck(): Promise<boolean> {
    for (const client of clients.values()) {
      if (!await client.ping()) return false;
    }
    return true;
  },
};

export function getConnectedServers(): string[] {
  return Array.from(clients.keys());
}
