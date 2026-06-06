/**
 * Security Context — AsyncLocalStorage for concurrent execution safety
 */

import { AsyncLocalStorage } from 'async_hooks';
import type { SecurityContext } from './types.js';

const securityStore = new AsyncLocalStorage<SecurityContext>();

export function withSecurityContext<T>(ctx: SecurityContext, fn: () => T): T {
  return securityStore.run(ctx, fn);
}

export function getCurrentContext(): SecurityContext | undefined {
  return securityStore.getStore();
}

export async function withSecurityContextAsync<T>(
  ctx: SecurityContext,
  fn: () => Promise<T>
): Promise<T> {
  return securityStore.run(ctx, fn);
}
