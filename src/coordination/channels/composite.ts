/**
 * CompositeChain — Local + Network
 *
 * Writes go to appropriate backend based on networkOrigin.
 * Reads merge both.
 */

import { EventEmitter } from 'events';
import type { ChainBackend, EventFilter } from './backend.js';
import type { ChainEvent, EventType, EventPayloads, NetworkOrigin } from './events.js';
import { LocalChain } from './local/store.js';
import { NetworkChain } from './network/backend.js';

const NETWORK_EVENTS = new Set<EventType>([
  'work:created',
  'work:posted',
  'work:claimed',
  'work:submitted',
  'work:verified',
  'work:completed',
  'membership:joined',
  'membership:left',
]);

export class CompositeChain extends EventEmitter implements ChainBackend {
  constructor(
    private local: LocalChain,
    private network: NetworkChain
  ) {
    super();
    local.on('event', (e) => this.emit('event', e));
    network.on('event', (e) => this.emit('event', e));
  }

  async append<T extends EventType>(
    type: T,
    emitter: string,
    subject: string,
    payload: EventPayloads[T]
  ): Promise<ChainEvent<T>> {
    const p = payload as Record<string, unknown>;
    const networkOrigin = p.networkOrigin as NetworkOrigin | undefined;
    const isNetworkWork = !!networkOrigin?.daoAddress;

    const event = await this.local.append(type, emitter, subject, payload);

    if (isNetworkWork && NETWORK_EVENTS.has(type)) {
      try {
        await this.network.append(type, emitter, subject, payload);
      } catch (err) {
        console.error('[Composite] Network append failed:', err);
      }
    }

    return event;
  }

  async recall(filter: EventFilter): Promise<ChainEvent[]> {
    const [local, network] = await Promise.all([
      this.local.recall(filter),
      this.network.recall(filter),
    ]);

    const seen = new Set<string>();
    const merged: ChainEvent[] = [];

    for (const e of [...local, ...network]) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }

    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getEvent(id: string): Promise<ChainEvent | null> {
    return (await this.local.getEvent(id)) || (await this.network.getEvent(id));
  }

  async getLatest(subject: string, type?: EventType): Promise<ChainEvent | null> {
    const [local, network] = await Promise.all([
      this.local.getLatest(subject, type),
      this.network.getLatest(subject, type),
    ]);

    if (!local) return network;
    if (!network) return local;
    return local.timestamp > network.timestamp ? local : network;
  }
}

export function createCompositeChain(local: LocalChain, network: NetworkChain): CompositeChain {
  return new CompositeChain(local, network);
}
