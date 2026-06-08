/**
 * Identity Boundary — Runtime enforcement of identity scope
 *
 * Identity sets policy (settings.ts), boundary enforces it at runtime.
 */

import type { SecurityProvider, SecurityContext, CreateContextParams } from './types.js';
import { AdvisorySecurityProvider } from './providers/advisory.js';
import { EnforcedSecurityProvider } from './providers/enforced.js';

export * from './types.js';
export * from './scope.js';
export * from './context.js';
export * from './tools.js';
export * from './audit-log.js';
export { AdvisorySecurityProvider } from './providers/advisory.js';
export { EnforcedSecurityProvider } from './providers/enforced.js';

export type { SecurityMode } from '../settings.js';

const providers = new Map<string, SecurityProvider>();

/**
 * Get boundary provider for a specific mode.
 */
export function getBoundaryProvider(mode?: 'advisory' | 'enforced' | 'signed'): SecurityProvider {
  const effectiveMode = mode || (process.env.SECURITY_MODE as 'advisory' | 'enforced' | 'signed') || 'advisory';

  let provider = providers.get(effectiveMode);
  if (provider) return provider;

  switch (effectiveMode) {
    case 'enforced':
      provider = new EnforcedSecurityProvider();
      break;
    case 'signed':
      console.warn('[BOUNDARY] Signed mode not yet implemented, using enforced');
      provider = new EnforcedSecurityProvider();
      break;
    case 'advisory':
    default:
      provider = new AdvisorySecurityProvider();
      break;
  }

  providers.set(effectiveMode, provider);
  console.log(`[BOUNDARY] Provider created: ${provider.mode}`);

  return provider;
}

/**
 * Create a boundary context using the appropriate provider.
 */
export async function createBoundaryContext(
  mode: 'advisory' | 'enforced' | 'signed',
  params: CreateContextParams
): Promise<SecurityContext> {
  const provider = getBoundaryProvider(mode);
  return provider.createContext(params);
}

/**
 * Reset all providers (for testing).
 */
export function resetBoundaryProviders(): void {
  providers.clear();
}
