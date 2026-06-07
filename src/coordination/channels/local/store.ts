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

  // Indexes for fast lookup
  private byType = new Map<EventType, ChainEvent[]>();
  private bySubject = new Map<string, ChainEvent[]>();
  private byId = new Map<string, ChainEvent>();

  constructor(path?: string) {
    super();
    this.chainPath = path ?? DEFAULT_CHAIN_PATH;
  }

  private indexEvent(event: ChainEvent): void {
    // Index by type
    const typeList = this.byType.get(event.type) ?? [];
    typeList.push(event);
    this.byType.set(event.type, typeList);

    // Index by subject
    const subjectList = this.bySubject.get(event.subject) ?? [];
    subjectList.push(event);
    this.bySubject.set(event.subject, subjectList);

    // Index by id
    this.byId.set(event.id, event);
  }

  private ensureLoaded(): void {
    if (this.loaded) return;

    if (existsSync(this.chainPath)) {
      const content = readFileSync(this.chainPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (let i = 0; i < lines.length; i++) {
        try {
          const event = JSON.parse(lines[i]) as ChainEvent;
          this.log.push(event);
          this.indexEvent(event);
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
    this.indexEvent(event);
    this.persist(event);
    this.emit('event', event);

    return event;
  }

  async recall(filter: EventFilter): Promise<ChainEvent[]> {
    this.ensureLoaded();

    // Use indexes for common single-filter cases
    let results: ChainEvent[];

    if (filter.type && !Array.isArray(filter.type) && !filter.subject && !filter.emitter) {
      // Fast path: single type lookup
      results = this.byType.get(filter.type) ?? [];
    } else if (filter.subject && !filter.type && !filter.emitter) {
      // Fast path: subject lookup
      results = this.bySubject.get(filter.subject) ?? [];
    } else if (filter.type && !Array.isArray(filter.type) && filter.subject) {
      // Intersect type and subject indexes (use smaller set)
      const byType = this.byType.get(filter.type) ?? [];
      const bySubject = this.bySubject.get(filter.subject) ?? [];
      if (byType.length < bySubject.length) {
        results = byType.filter(e => e.subject === filter.subject);
      } else {
        results = bySubject.filter(e => e.type === filter.type);
      }
    } else {
      // Fall back to full scan
      results = [...this.log];

      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        results = results.filter(e => types.includes(e.type));
      }
      if (filter.subject) {
        results = results.filter(e => e.subject === filter.subject);
      }
    }

    // Apply remaining filters
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
    return this.byId.get(id) ?? null;
  }

  async getLatest(subject: string, type?: EventType): Promise<ChainEvent | null> {
    this.ensureLoaded();

    let candidates = this.bySubject.get(subject) ?? [];
    if (type) {
      candidates = candidates.filter(e => e.type === type);
    }

    if (candidates.length === 0) return null;

    // Events are appended in order, so last one is latest
    return candidates[candidates.length - 1];
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
    this.byType.clear();
    this.bySubject.clear();
    this.byId.clear();
    this.loaded = true;
  }
}
