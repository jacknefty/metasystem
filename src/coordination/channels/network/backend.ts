/**
 * NetworkChain — EVM-backed ChainBackend
 *
 * Translates contract events ↔ ChainEvents.
 * Same interface as LocalChain.
 */

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import type { ChainBackend, EventFilter } from '../backend.js';
import type { ChainEvent, EventType, EventPayloads, NetworkOrigin } from '../events.js';
import { getDAOContract } from './evm/contracts.js';

const LOOP_SCALE = 1e18;

export class NetworkChain extends EventEmitter implements ChainBackend {
  private eventCache: ChainEvent[] = [];
  private listening = false;
  private chainId: number = 0;

  setChainId(id: number): void {
    this.chainId = id;
  }

  async append<T extends EventType>(
    type: T,
    emitter: string,
    subject: string,
    payload: EventPayloads[T]
  ): Promise<ChainEvent<T>> {
    const p = payload as Record<string, unknown>;
    const networkOrigin = p.networkOrigin as NetworkOrigin | undefined;

    if (!networkOrigin?.daoAddress) {
      throw new Error('Network append requires networkOrigin.daoAddress in payload');
    }

    const daoAddress = networkOrigin.daoAddress;

    switch (type) {
      case 'work:created':
        await this.createWork(daoAddress, subject, payload);
        break;
      case 'work:claimed':
        await this.claimWork(daoAddress, subject);
        break;
      case 'work:submitted':
        await this.submitWork(daoAddress, subject, p.branch as string);
        break;
      case 'work:verified':
        await this.verifyWork(daoAddress, subject, p.passed as boolean, p.confidence as number);
        break;
      default:
        throw new Error(`Event type ${type} not supported on network`);
    }

    return {
      id: `pending_${Date.now()}`,
      type,
      timestamp: Date.now(),
      emitter,
      subject,
      payload,
    } as ChainEvent<T>;
  }

  async recall(filter: EventFilter): Promise<ChainEvent[]> {
    let results = [...this.eventCache];

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      results = results.filter(e => types.includes(e.type));
    }
    if (filter.subject) {
      results = results.filter(e => e.subject === filter.subject);
    }
    if (filter.emitter) {
      results = results.filter(e => e.emitter === filter.emitter);
    }
    if (filter.since) {
      results = results.filter(e => e.timestamp >= filter.since!);
    }
    if (filter.until) {
      results = results.filter(e => e.timestamp <= filter.until!);
    }
    if (filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results;
  }

  async getEvent(id: string): Promise<ChainEvent | null> {
    return this.eventCache.find(e => e.id === id) ?? null;
  }

  async getLatest(subject: string, type?: EventType): Promise<ChainEvent | null> {
    let candidates = this.eventCache.filter(e => e.subject === subject);
    if (type) candidates = candidates.filter(e => e.type === type);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => b.timestamp - a.timestamp)[0];
  }

  async startListening(daoAddresses: string[]): Promise<void> {
    if (this.listening) return;
    this.listening = true;

    for (const address of daoAddresses) {
      const dao = getDAOContract(address);
      this.attachListeners(dao, address);
    }
  }

  stopListening(): void {
    this.listening = false;
  }

  private attachListeners(dao: ethers.Contract, daoAddress: string): void {
    const origin: NetworkOrigin = {
      daoAddress,
      chainId: this.chainId,
    };

    dao.on('WorkCreated', (workId: string, _contentHash: string, bounty: bigint, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'work:created',
        timestamp: Date.now(),
        emitter: daoAddress,
        subject: workId,
        payload: {
          name: workId,
          hubId: daoAddress,
          contextPath: '',
          conditions: [],
          networkOrigin: { ...origin, txHash },
        },
      });

      this.cacheAndEmit({
        id: `${txHash}_${event.index}_variety`,
        type: 'variety:work:in',
        timestamp: Date.now(),
        emitter: 'network',
        subject: workId,
        payload: {
          bits: Number(bounty) / LOOP_SCALE,
          workId,
          context: 'network-bounty',
        },
      });
    });

    dao.on('WorkClaimed', (workId: string, claimer: string, expiry: bigint, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'work:claimed',
        timestamp: Date.now(),
        emitter: claimer,
        subject: workId,
        payload: {
          nodeId: claimer,
          claimedAt: Date.now(),
          deadline: Number(expiry) * 1000,
          networkOrigin: { ...origin, txHash },
        },
      });
    });

    dao.on('WorkSubmitted', (workId: string, submission: string, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'work:submitted',
        timestamp: Date.now(),
        emitter: daoAddress,
        subject: workId,
        payload: {
          nodeId: '',
          branch: submission,
          submittedAt: Date.now(),
          networkOrigin: { ...origin, txHash },
        },
      });
    });

    dao.on('WorkFulfilled', (workId: string, worker: string, _auditor: string, reward: bigint, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'work:completed',
        timestamp: Date.now(),
        emitter: daoAddress,
        subject: workId,
        payload: {
          nodeId: worker,
          bountyAmount: Number(reward),
          completedAt: Date.now(),
          networkOrigin: { ...origin, txHash },
        },
      });

      this.cacheAndEmit({
        id: `${txHash}_${event.index}_variety`,
        type: 'variety:work:out',
        timestamp: Date.now(),
        emitter: 'network',
        subject: workId,
        payload: {
          bits: Number(reward) / LOOP_SCALE,
          workId,
          context: 'network-fulfilled',
        },
      });

      this.cacheAndEmit({
        id: `${txHash}_${event.index}_credit`,
        type: 'credit:earned',
        timestamp: Date.now(),
        emitter: daoAddress,
        subject: worker,
        payload: {
          workId,
          nodeId: worker,
          bits: Number(reward) / LOOP_SCALE,
          amount: reward.toString(),
          proofHash: txHash,
        },
      });
    });

    dao.on('MemberJoined', (member: string, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'membership:joined',
        timestamp: Date.now(),
        emitter: member,
        subject: member,
        payload: {
          context: daoAddress,
          role: 'member',
        },
      });
    });

    dao.on('MemberLeft', (member: string, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'membership:left',
        timestamp: Date.now(),
        emitter: member,
        subject: member,
        payload: {
          context: daoAddress,
        },
      });
    });

    dao.on('AlgedonicPain', (nodeId: string, message: string, severity: number, event: ethers.Log) => {
      const txHash = event.transactionHash;

      this.cacheAndEmit({
        id: `${txHash}_${event.index}`,
        type: 'algedonic:pain',
        timestamp: Date.now(),
        emitter: 'network',
        subject: nodeId,
        payload: {
          severity: severity as 1 | 2 | 3,
          source: 'network',
          message,
          hubId: daoAddress,
          originContextId: daoAddress,
          escalationLevel: 0,
        },
      });
    });
  }

  private cacheAndEmit(event: ChainEvent): void {
    this.eventCache.push(event);
    this.emit('event', event);
  }

  private async createWork(daoAddress: string, workId: string, payload: unknown): Promise<void> {
    const dao = getDAOContract(daoAddress);
    const p = payload as { conditions?: string; bounty?: number };
    const bounty = ethers.parseEther(String(p.bounty || 0));
    const tx = await dao.createWork(ethers.id(workId), p.conditions || '', bounty, { value: bounty });
    await tx.wait();
  }

  private async claimWork(daoAddress: string, workId: string): Promise<void> {
    const dao = getDAOContract(daoAddress);
    const tx = await dao.claimWork(ethers.id(workId));
    await tx.wait();
  }

  private async submitWork(daoAddress: string, workId: string, submission: string): Promise<void> {
    const dao = getDAOContract(daoAddress);
    const tx = await dao.submitWork(ethers.id(workId), submission);
    await tx.wait();
  }

  private async verifyWork(daoAddress: string, workId: string, passed: boolean, confidence: number): Promise<void> {
    const dao = getDAOContract(daoAddress);
    const tx = await dao.verifyWork(ethers.id(workId), passed, Math.floor(confidence * 100));
    await tx.wait();
  }

  async escalatePain(daoAddress: string, nodeId: string, message: string, severity: 1 | 2 | 3): Promise<void> {
    const dao = getDAOContract(daoAddress);
    const tx = await dao.emitPain(nodeId, message, severity);
    await tx.wait();
  }
}
