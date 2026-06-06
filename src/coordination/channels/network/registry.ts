/**
 * DAO Registry
 */

import { getRegistryContract, getDAOContract } from './evm/contracts.js';
import { isConnected, getNetworkChain } from './connection.js';

export interface DAO {
  address: string;
  name: string;
  memberCount: number;
}

export async function listDAOs(): Promise<DAO[]> {
  if (!isConnected()) return [];

  const registry = getRegistryContract();
  const count = await registry.daoCount();
  const daos: DAO[] = [];

  for (let i = 0; i < count; i++) {
    const address = await registry.daoAt(i);
    const dao = getDAOContract(address);
    const [name, memberCount] = await Promise.all([
      dao.name(),
      dao.memberCount(),
    ]);
    daos.push({ address, name, memberCount: Number(memberCount) });
  }

  return daos;
}

export async function getDAO(address: string): Promise<DAO | null> {
  if (!isConnected()) return null;

  try {
    const dao = getDAOContract(address);
    const [name, memberCount] = await Promise.all([
      dao.name(),
      dao.memberCount(),
    ]);
    return { address, name, memberCount: Number(memberCount) };
  } catch {
    return null;
  }
}

export async function createDAO(name: string): Promise<string> {
  if (!isConnected()) throw new Error('Not connected');

  const registry = getRegistryContract();
  const tx = await registry.createDAO(name);
  const receipt = await tx.wait();

  for (const log of receipt.logs) {
    if (log.eventName === 'DAOCreated') {
      const address = log.args.dao;

      const chain = getNetworkChain();
      if (chain) {
        await chain.startListening([address]);
      }

      return address;
    }
  }

  throw new Error('DAO creation failed');
}

export async function joinDAO(daoAddress: string): Promise<void> {
  if (!isConnected()) throw new Error('Not connected');

  const dao = getDAOContract(daoAddress);
  const tx = await dao.join();
  await tx.wait();

  const chain = getNetworkChain();
  if (chain) {
    await chain.startListening([daoAddress]);
  }
}

export async function leaveDAO(daoAddress: string): Promise<void> {
  if (!isConnected()) throw new Error('Not connected');

  const dao = getDAOContract(daoAddress);
  const tx = await dao.leave();
  await tx.wait();
}

export async function isDAOMember(daoAddress: string, address?: string): Promise<boolean> {
  if (!isConnected()) return false;

  const dao = getDAOContract(daoAddress);
  const { getNetworkState } = await import('./connection.js');
  const checkAddress = address || getNetworkState().address;

  if (!checkAddress) return false;
  return dao.isMember(checkAddress);
}
