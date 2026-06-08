/**
 * Audit Probe Framework
 *
 * Pluggable probes for sporadic verification.
 * Each probe checks a different aspect of system health.
 */

import { probeSpine } from './spine.js';
import { probeCirculatory } from './circulatory.js';
import { probeInformational } from './informational.js';
import { probeRecursion } from './recursion.js';
import { probeClosure } from './closure.js';
import type { ProbeType, ProbeResult, ProbeFunction } from './types.js';

export type { ProbeType, ProbeResult, ProbeFinding, ProbeFunction } from './types.js';

const probeRegistry: Record<ProbeType, ProbeFunction> = {
  spine: probeSpine,
  circulatory: probeCirculatory,
  informational: probeInformational,
  recursion: probeRecursion,
  closure: probeClosure,
  identity: probeClosure, // Identity probe uses closure for now
};

export function getProbe(type: ProbeType): ProbeFunction {
  return probeRegistry[type];
}

export async function runProbe(type: ProbeType, scopePath: string): Promise<ProbeResult> {
  const probe = getProbe(type);
  return probe(scopePath);
}

export async function runAllProbes(scopePath: string): Promise<ProbeResult[]> {
  const results: ProbeResult[] = [];
  for (const type of Object.keys(probeRegistry) as ProbeType[]) {
    if (type === 'identity') continue; // Skip duplicate
    results.push(await runProbe(type, scopePath));
  }
  return results;
}

export async function runRandomProbe(scopePath: string): Promise<ProbeResult> {
  const types = Object.keys(probeRegistry).filter(t => t !== 'identity') as ProbeType[];
  const randomType = types[Math.floor(Math.random() * types.length)];
  return runProbe(randomType, scopePath);
}

export { probeSpine } from './spine.js';
export { probeCirculatory } from './circulatory.js';
export { probeInformational } from './informational.js';
export { probeRecursion } from './recursion.js';
export { probeClosure } from './closure.js';
