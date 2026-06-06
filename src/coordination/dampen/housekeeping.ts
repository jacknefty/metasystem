/**
 * S2 Housekeeping
 *
 * Detects starvation and hoarding. Runs on work state change events.
 */

import { listWork } from '../../coordination/resources/work.js';
import { emitPain } from '../channels/algedonic.js';
import { getChain } from '../../coordination/channels/chain.js';
import type { DerivedWork } from '../../coordination/resources/derive.js';

const STARVATION_THRESHOLD_MS = 10 * 60 * 1000;
const HOARDING_THRESHOLD_MS = 60 * 60 * 1000;

export interface HousekeepingResult {
  starving: string[];
  hoarding: string[];
  expiredClaims: string[];
}

const signaledStarvation = new Set<string>();
const signaledHoarding = new Set<string>();

export function clearStarvationSignal(workId: string): void {
  signaledStarvation.delete(workId);
}

export function clearHoardingSignal(nodeId: string): void {
  signaledHoarding.delete(nodeId);
}

export async function detectStarvation(): Promise<string[]> {
  const allWork = await listWork({});
  const now = Date.now();
  const starving: string[] = [];

  for (const work of allWork) {
    if (work.bountyStatus !== 'posted' || work.claim) continue;
    if (signaledStarvation.has(work.id)) continue;

    const postedAt = work.bounty?.postedAt || work.createdAt;
    const age = now - postedAt;

    if (age > STARVATION_THRESHOLD_MS) {
      starving.push(work.id);
      signaledStarvation.add(work.id);

      await emitPain(
        'starvation',
        work.id,
        `Work unclaimed for ${Math.floor(age / 60000)} minutes`,
        2,
        work.contextId
      );
    }
  }

  return starving;
}

export async function detectHoarding(): Promise<string[]> {
  const allWork = await listWork({});
  const now = Date.now();
  const hoarders: string[] = [];

  const nodeClaims = new Map<string, DerivedWork[]>();

  for (const work of allWork) {
    if (!work.claim) continue;
    if (work.bountyStatus !== 'claimed' && work.status !== 'executing') continue;

    const claims = nodeClaims.get(work.claim.nodeId) || [];
    claims.push(work);
    nodeClaims.set(work.claim.nodeId, claims);
  }

  for (const [nodeId, claims] of nodeClaims) {
    if (signaledHoarding.has(nodeId)) continue;

    const oldest = Math.min(...claims.map(c => c.claim!.claimedAt));
    const age = now - oldest;

    if (age > HOARDING_THRESHOLD_MS) {
      hoarders.push(nodeId);
      signaledHoarding.add(nodeId);

      await emitPain(
        'hoarding',
        nodeId,
        `Node holding ${claims.length} claims for ${Math.floor(age / 60000)} minutes`,
        1
      );
    }
  }

  return hoarders;
}

export async function expireOverdueClaims(): Promise<string[]> {
  const allWork = await listWork({});
  const now = Date.now();
  const expired: string[] = [];

  for (const work of allWork) {
    if (!work.claim) continue;
    if (work.claim.deadline && now > work.claim.deadline) {
      await getChain().append('work:released', 'system', work.id, {
        nodeId: work.claim.nodeId,
        reason: 'timeout',
      });

      expired.push(work.id);
    }
  }

  return expired;
}

export async function runHousekeeping(): Promise<HousekeepingResult> {
  const [starving, hoarding, expiredClaims] = await Promise.all([
    detectStarvation(),
    detectHoarding(),
    expireOverdueClaims(),
  ]);

  if (starving.length || hoarding.length || expiredClaims.length) {
    console.log(`[Housekeeping] Starving: ${starving.length}, Hoarding: ${hoarding.length}, Expired: ${expiredClaims.length}`);
  }

  return { starving, hoarding, expiredClaims };
}

let lastRun = 0;
const MIN_INTERVAL = 60 * 1000;

export async function maybeRunHousekeeping(): Promise<void> {
  const now = Date.now();
  if (now - lastRun < MIN_INTERVAL) return;

  lastRun = now;
  await runHousekeeping();
}
