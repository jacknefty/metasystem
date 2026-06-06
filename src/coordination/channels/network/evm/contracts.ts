/**
 * Contract ABIs and Instances
 */

import { ethers } from 'ethers';
import { getSigner } from './provider.js';
import { getConfig } from '../../../../identity/bootstrap.js';

const REGISTRY_ABI = [
  'function daoCount() view returns (uint256)',
  'function daoAt(uint256) view returns (address)',
  'function createDAO(string name) returns (address)',
  'event DAOCreated(address indexed dao, string name)',
];

const DAO_ABI = [
  'function name() view returns (string)',
  'function memberCount() view returns (uint256)',
  'function isMember(address) view returns (bool)',
  'function join()',
  'function leave()',
  'function createWork(bytes32 id, string conditions, uint256 bounty) payable',
  'function claimWork(bytes32 id)',
  'function submitWork(bytes32 id, string submission)',
  'function verifyWork(bytes32 id, bool passed, uint256 confidence)',
  'function emitPain(string nodeId, string message, uint8 severity)',
  'event WorkCreated(bytes32 indexed id, bytes32 contentHash, uint256 bounty)',
  'event WorkClaimed(bytes32 indexed id, address indexed claimer, uint256 expiry)',
  'event WorkSubmitted(bytes32 indexed id, string submission)',
  'event WorkFulfilled(bytes32 indexed id, address worker, address auditor, uint256 reward)',
  'event MemberJoined(address indexed member)',
  'event MemberLeft(address indexed member)',
  'event AlgedonicPain(string indexed nodeId, string message, uint8 severity)',
];

const LOOP_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

let registryContract: ethers.Contract | null = null;
const daoContracts = new Map<string, ethers.Contract>();

export function getRegistryContract(): ethers.Contract {
  if (registryContract) return registryContract;

  const config = getConfig();
  const address = config.network?.registryAddress;

  if (!address) throw new Error('Registry address not configured');

  registryContract = new ethers.Contract(address, REGISTRY_ABI, getSigner());
  return registryContract;
}

export function getDAOContract(address: string): ethers.Contract {
  let contract = daoContracts.get(address);
  if (!contract) {
    contract = new ethers.Contract(address, DAO_ABI, getSigner());
    daoContracts.set(address, contract);
  }
  return contract;
}

export function getLOOPContract(address: string): ethers.Contract {
  return new ethers.Contract(address, LOOP_ABI, getSigner());
}

export function clearContracts(): void {
  registryContract = null;
  daoContracts.clear();
}

export { REGISTRY_ABI, DAO_ABI, LOOP_ABI };
