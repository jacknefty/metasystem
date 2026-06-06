/**
 * Chain — Singleton access
 *
 * Returns appropriate backend (local, network, or composite).
 */

import type { ChainBackend } from './backend.js';
import { LocalChain } from './local/store.js';

export { LocalChain } from './local/store.js';
export type { ChainBackend, EventFilter } from './backend.js';

let instance: ChainBackend | null = null;

export function getChain(): ChainBackend {
  if (!instance) {
    instance = new LocalChain();
  }
  return instance;
}

export function setChain(backend: ChainBackend): void {
  instance = backend;
}
