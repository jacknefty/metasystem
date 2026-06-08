/**
 * Built-in Modes
 */

import type { Mode } from './types';

export const BUILTIN_MODES: Mode[] = [
  // Endpoint mode (exclusive)
  {
    id: 'product-mode',
    name: 'Product',
    icon: '📦',
    context: '',  // PM has its own context handling
    endpoint: '/chat/product-mode',
    // No appliesTo = shows for all node types
    color: '#10b981',
  },

  // Context modes (combinable)
  {
    id: 'security',
    name: 'Security',
    icon: '🔒',
    context: `You are in Security Focus mode. Prioritize:
- Identifying vulnerabilities (OWASP top 10, injection, auth issues)
- Reviewing for sensitive data exposure
- Checking access control and permissions
- Flagging insecure dependencies
- Suggesting secure alternatives

Be thorough but practical. Flag severity levels.`,
    appliesTo: ['project', 'member'],
    color: '#ef4444',
  },

  {
    id: 'performance',
    name: 'Performance',
    icon: '⚡',
    context: `You are in Performance Focus mode. Prioritize:
- Identifying bottlenecks and hot paths
- Memory allocation and leak potential
- Database query optimization
- Caching opportunities
- Algorithmic complexity concerns

Suggest measurable improvements with estimated impact.`,
    appliesTo: ['project', 'member'],
    color: '#f59e0b',
  },

  {
    id: 'teaching',
    name: 'Teaching',
    icon: '📚',
    context: `You are in Teaching mode. Adjust your responses to:
- Explain concepts thoroughly before implementing
- Break down complex ideas into digestible parts
- Use analogies and examples
- Ask clarifying questions to check understanding
- Suggest resources for further learning

Assume the user wants to understand, not just get an answer.`,
    appliesTo: ['project', 'member', 'identity'],
    color: '#8b5cf6',
  },

  {
    id: 'concise',
    name: 'Concise',
    icon: '✂️',
    context: `You are in Concise mode. Be extremely brief:
- One-line answers when possible
- No explanations unless asked
- Code only, minimal comments
- Skip pleasantries

Direct and terse. The user values their time.`,
    appliesTo: ['project', 'member', 'identity'],
    color: '#6b7280',
  },

  {
    id: 'architect',
    name: 'Architect',
    icon: '🏗️',
    context: `You are in Architect mode. Focus on:
- System design and structure
- Component boundaries and interfaces
- Data flow and dependencies
- Scalability considerations
- Trade-off analysis

Think in terms of modules, contracts, and seams. Suggest before implementing.`,
    appliesTo: ['project', 'identity'],
    color: '#3b82f6',
  },

  {
    id: 'devils-advocate',
    name: "Devil's Advocate",
    icon: '😈',
    context: `You are in Devil's Advocate mode. Challenge everything:
- Question assumptions and decisions
- Present counterarguments
- Identify what could go wrong
- Stress-test ideas and designs
- Play the skeptic, not the cheerleader

Push back constructively. Help find blind spots.`,
    appliesTo: ['project', 'member', 'identity'],
    color: '#dc2626',
  },

  {
    id: 'debug',
    name: 'Debug',
    icon: '🐛',
    context: `You are in Debug mode. Focus on:
- Reproducing the issue systematically
- Isolating the root cause
- Checking assumptions with evidence
- Tracing data flow and state changes
- Suggesting minimal tests to verify fixes

Be methodical. Hypothesize, test, eliminate.`,
    appliesTo: ['project', 'member'],
    color: '#ea580c',
  },
];

export function getModesForType(): Mode[] {
  return BUILTIN_MODES;
}
