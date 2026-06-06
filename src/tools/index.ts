/**
 * Tool Registry
 *
 * Central registry for all available tools.
 */

import type { ToolSpec, ToolProvider, ToolSource } from './types.js';

const providers = new Map<ToolSource, ToolProvider>();
const toolCache = new Map<string, { spec: ToolSpec; source: ToolSource }>();

export function registerProvider(provider: ToolProvider): void {
  providers.set(provider.source, provider);
}

export async function refreshTools(): Promise<void> {
  toolCache.clear();

  for (const [source, provider] of providers) {
    try {
      const tools = await provider.list();
      for (const spec of tools) {
        toolCache.set(spec.id, { spec, source });
      }
      console.log(`[Tools] Loaded ${tools.length} tools from ${source}`);
    } catch (err) {
      console.error(`[Tools] Failed to list from ${source}:`, err);
    }
  }
}

export function getTool(id: string): ToolSpec | null {
  return toolCache.get(id)?.spec ?? null;
}

export function listTools(filter?: {
  source?: ToolSource;
  capability?: string;
}): ToolSpec[] {
  let tools = Array.from(toolCache.values()).map(t => t.spec);

  if (filter?.source) {
    tools = tools.filter(t => toolCache.get(t.id)?.source === filter.source);
  }
  if (filter?.capability) {
    const cap = filter.capability;
    tools = tools.filter(t => t.capabilities.includes(cap));
  }

  return tools;
}

export function getProvider(toolId: string): ToolProvider | null {
  const entry = toolCache.get(toolId);
  if (!entry) return null;
  return providers.get(entry.source) ?? null;
}

export { invoke } from './invoke.js';
export type { ToolSpec, ToolResult, ToolInvocation, ToolProvider, ToolSource, ToolCapability } from './types.js';
