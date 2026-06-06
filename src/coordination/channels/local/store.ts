/**
 * LocalChain — JSONL-backed ChainBackend
 *
 * Append-only event log with filesystem persistence.
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import type { ChainBackend, EventFilter } from '../backend.js';
import { createEvent, type ChainEvent, type EventType, type EventPayloads } from '../events.js';
import { paths } from '../../../identity/paths.js';

const DEFAULT_CHAIN_PATH = paths.chainFile();

export class LocalChain extends EventEmitter implements ChainBackend {
  private log: ChainEvent[] = [];
  private loaded = false;
  private chainPath: string;

  constructor(path?: string) {
    super();
    this.chainPath = path ?? DEFAULT_CHAIN_PATH;
  }

  private ensureLoaded(): void {
    if (this.loaded) return;

    if (existsSync(this.chainPath)) {
      const content = readFileSync(this.chainPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (let i = 0; i < lines.length; i++) {
        try {
          this.log.push(JSON.parse(lines[i]));
        } catch {
          console.warn(`[Chain] Skipping malformed line ${i + 1}`);
        }
      }
    }

    this.loaded = true;
  }

  private ensureDir(): void {
    const dir = dirname(this.chainPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private persist(event: ChainEvent): void {
    this.ensureDir();
    appendFileSync(this.chainPath, JSON.stringify(event) + '\n');
  }

  async append<T extends EventType>(
    type: T,
    emitter: string,
    subject: string,
    payload: EventPayloads[T]
  ): Promise<ChainEvent<T>> {
    this.ensureLoaded();

    const event = createEvent(type, emitter, subject, payload);
    this.log.push(event);
    this.persist(event);
    this.emit('event', event);

    return event;
  }

  async recall(filter: EventFilter): Promise<ChainEvent[]> {
    this.ensureLoaded();
    let results = this.log;

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
    this.ensureLoaded();
    return this.log.find(e => e.id === id) ?? null;
  }

  async getLatest(subject: string, type?: EventType): Promise<ChainEvent | null> {
    this.ensureLoaded();

    let candidates = this.log.filter(e => e.subject === subject);
    if (type) {
      candidates = candidates.filter(e => e.type === type);
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.timestamp - a.timestamp);
    return candidates[0];
  }

  getPath(): string {
    return this.chainPath;
  }

  getEventCount(): number {
    this.ensureLoaded();
    return this.log.length;
  }

  clear(): void {
    this.log = [];
    this.loaded = true;
  }
}
