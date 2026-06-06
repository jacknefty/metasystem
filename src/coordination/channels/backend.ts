/**
 * ChainBackend Interface
 *
 * Both LocalChain and NetworkChain implement this.
 */

import type { ChainEvent, EventType, EventPayloads } from './events.js';

export interface EventFilter {
  type?: EventType | EventType[];
  subject?: string;
  emitter?: string;
  since?: number;
  until?: number;
  limit?: number;
}

export interface ChainBackend {
  append<T extends EventType>(
    type: T,
    emitter: string,
    subject: string,
    payload: EventPayloads[T]
  ): Promise<ChainEvent<T>>;

  recall(filter: EventFilter): Promise<ChainEvent[]>;
  getEvent(id: string): Promise<ChainEvent | null>;
  getLatest(subject: string, type?: EventType): Promise<ChainEvent | null>;

  on(event: 'event', listener: (event: ChainEvent) => void): this;
  off(event: 'event', listener: (event: ChainEvent) => void): this;
}
