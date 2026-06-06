/**
 * EVM Provider Access
 */

import { ethers } from 'ethers';

let provider: ethers.Provider | null = null;
let signer: ethers.Signer | null = null;

export function setProvider(p: ethers.Provider, s: ethers.Signer): void {
  provider = p;
  signer = s;
}

export function getProvider(): ethers.Provider {
  if (!provider) throw new Error('Provider not set');
  return provider;
}

export function getSigner(): ethers.Signer {
  if (!signer) throw new Error('Signer not set');
  return signer;
}

export function clearProvider(): void {
  provider = null;
  signer = null;
}

export function hasProvider(): boolean {
  return provider !== null && signer !== null;
}
