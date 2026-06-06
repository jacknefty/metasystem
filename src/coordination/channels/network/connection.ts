/**
 * Network Connection
 */

import { ethers } from 'ethers';
import { NetworkChain } from './backend.js';
import { setProvider, clearProvider } from './evm/provider.js';
import { clearContracts } from './evm/contracts.js';
import { getConfig, updateConfig } from '../../../identity/bootstrap.js';

export type NetworkStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface NetworkState {
  status: NetworkStatus;
  chainId: number | null;
  address: string | null;
  error: string | null;
}

let state: NetworkState = {
  status: 'disconnected',
  chainId: null,
  address: null,
  error: null,
};

let networkChain: NetworkChain | null = null;

export function getNetworkState(): NetworkState {
  return { ...state };
}

export function getNetworkChain(): NetworkChain | null {
  return networkChain;
}

export function isConnected(): boolean {
  return state.status === 'connected';
}

export async function connect(config?: {
  rpcUrl?: string;
  privateKey?: string;
  chainId?: number;
}): Promise<void> {
  if (state.status === 'connected') return;

  state = { ...state, status: 'connecting', error: null };

  try {
    const cfg = getConfig();
    const rpcUrl = config?.rpcUrl || cfg.network?.rpcUrl;
    const privateKey = config?.privateKey || cfg.network?.privateKey;

    if (!rpcUrl) {
      throw new Error('No RPC URL configured');
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    if (config?.chainId && config.chainId !== chainId) {
      throw new Error(`Chain ID mismatch: expected ${config.chainId}, got ${chainId}`);
    }

    let signer: ethers.Signer;
    if (privateKey) {
      signer = new ethers.Wallet(privateKey, provider);
    } else {
      throw new Error('Private key required for signing');
    }

    const address = await signer.getAddress();

    setProvider(provider, signer);
    networkChain = new NetworkChain();
    networkChain.setChainId(chainId);

    state = {
      status: 'connected',
      chainId,
      address,
      error: null,
    };

    updateConfig({
      network: {
        ...cfg.network,
        enabled: true,
        rpcUrl,
        chainId,
      },
    });

    console.log(`[Network] Connected: ${address} on chain ${chainId}`);
  } catch (err) {
    state = {
      status: 'error',
      chainId: null,
      address: null,
      error: err instanceof Error ? err.message : 'Connection failed',
    };
    throw err;
  }
}

export async function disconnect(): Promise<void> {
  if (networkChain) {
    networkChain.stopListening();
    networkChain = null;
  }

  clearProvider();
  clearContracts();

  state = {
    status: 'disconnected',
    chainId: null,
    address: null,
    error: null,
  };

  console.log('[Network] Disconnected');
}
