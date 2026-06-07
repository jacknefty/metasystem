/**
 * Algedonic — Pain/pleasure signals that bypass normal channels
 *
 * Severity levels:
 * 1 — Minor (logged, no escalation)
 * 2 — Significant (requires attention)
 * 3 — Critical (escalates up recursion until acknowledged)
 */

import { getChain } from './chain.js';
import type { ChainEvent } from './events.js';

export interface AlgedonicSignal {
  id: string;
  type: 'pain' | 'pleasure';
  severity: 1 | 2 | 3;
  source: string;
  message: string;
  subject: string;
  hubId?: string;
  originHubId?: string;
  escalationLevel: number;
  timestamp: number;
  acknowledged: boolean;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

const ESCALATION_THRESHOLD = 3;
const MAX_ESCALATION_LEVELS = 5;

export async function emitPain(
  source: string,
  subject: string,
  message: string,
  severity: 1 | 2 | 3 = 2,
  hubId?: string
): Promise<AlgedonicSignal> {
  const event = await getChain().append('algedonic:pain', source, subject, {
    severity,
    source,
    message,
    hubId,
    originHubId: hubId,
    escalationLevel: 0,
  });

  const signal: AlgedonicSignal = {
    id: event.id,
    type: 'pain',
    severity,
    source,
    message,
    subject,
    hubId,
    originHubId: hubId,
    escalationLevel: 0,
    timestamp: event.timestamp,
    acknowledged: false,
  };

  if (severity >= ESCALATION_THRESHOLD && hubId) {
    await escalatePain(signal);
  }

  return signal;
}

export async function emitPleasure(
  source: string,
  subject: string,
  message: string,
  significance: 1 | 2 | 3 = 2,
  hubId?: string
): Promise<AlgedonicSignal> {
  const event = await getChain().append('algedonic:pleasure', source, subject, {
    significance,
    source,
    message,
    hubId,
  });

  return {
    id: event.id,
    type: 'pleasure',
    severity: significance,
    source,
    message,
    subject,
    hubId,
    escalationLevel: 0,
    timestamp: event.timestamp,
    acknowledged: false,
  };
}

async function escalatePain(signal: AlgedonicSignal): Promise<void> {
  if (signal.escalationLevel >= MAX_ESCALATION_LEVELS) {
    console.warn(`[Algedonic] Max escalation reached for ${signal.id}`);
    return;
  }

  if (!signal.hubId) return;

  const parentHubs = await findParentHubs(signal.hubId);

  if (parentHubs.length === 0) {
    console.log(`[Algedonic] Pain reached root: ${signal.message}`);

    const { isConnected, getNetworkChain, getNetworkState } = await import('./network/connection.js');
    if (isConnected()) {
      const chain = getNetworkChain();
      const state = getNetworkState();
      if (chain && state.address) {
        console.log(`[Algedonic] Escalating to network`);
        const config = await import('../../identity/bootstrap.js').then(m => m.getConfig());
        const daoAddress = config.network?.daoAddress;
        if (daoAddress) {
          await chain.escalatePain(daoAddress, state.address, signal.message, signal.severity);
        }
      }
    }
    return;
  }

  for (const parentId of parentHubs) {
    console.log(`[Algedonic] Escalating pain to ${parentId}: ${signal.message}`);

    await getChain().append('algedonic:pain', 'escalation', signal.subject, {
      severity: signal.severity,
      source: signal.source,
      message: `[ESCALATED from ${signal.hubId}] ${signal.message}`,
      hubId: parentId,
      originHubId: signal.originHubId,
      escalationLevel: signal.escalationLevel + 1,
    });
  }
}

async function findParentHubs(hubId: string): Promise<string[]> {
  const events = await getChain().recall({});
  const parents: string[] = [];

  for (const event of events) {
    if (event.type === 'membership:joined' && event.subject === hubId) {
      const p = event.payload as { hub: string };
      parents.push(p.hub);
    }
  }

  return parents;
}

export async function acknowledgePain(
  signalId: string,
  acknowledgedBy: string
): Promise<void> {
  await getChain().append('algedonic:acknowledged', acknowledgedBy, signalId, {
    acknowledgedAt: Date.now(),
  });
}

export async function getPendingSignals(hubId?: string): Promise<AlgedonicSignal[]> {
  const events = await getChain().recall({});

  const painEvents = events.filter(e => e.type === 'algedonic:pain');
  const ackEvents = events.filter(e => e.type === 'algedonic:acknowledged');

  const acknowledged = new Set(ackEvents.map(e => e.subject));

  const signals: AlgedonicSignal[] = [];

  for (const event of painEvents) {
    if (acknowledged.has(event.id)) continue;

    const p = event.payload as {
      severity: 1 | 2 | 3;
      source: string;
      message: string;
      hubId?: string;
      originHubId?: string;
      escalationLevel?: number;
    };

    if (hubId && p.hubId !== hubId) continue;

    signals.push({
      id: event.id,
      type: 'pain',
      severity: p.severity,
      source: p.source,
      message: p.message,
      subject: event.subject,
      hubId: p.hubId,
      originHubId: p.originHubId,
      escalationLevel: p.escalationLevel || 0,
      timestamp: event.timestamp,
      acknowledged: false,
    });
  }

  return signals.sort((a, b) => b.severity - a.severity || b.timestamp - a.timestamp);
}

export async function getAllSignals(hubId?: string): Promise<AlgedonicSignal[]> {
  const events = await getChain().recall({});

  const painEvents = events.filter(e => e.type === 'algedonic:pain');
  const pleasureEvents = events.filter(e => e.type === 'algedonic:pleasure');
  const ackEvents = events.filter(e => e.type === 'algedonic:acknowledged');

  const ackMap = new Map<string, { at: number; by: string }>();
  for (const e of ackEvents) {
    const p = e.payload as { acknowledgedAt: number };
    ackMap.set(e.subject, { at: p.acknowledgedAt, by: e.emitter });
  }

  const signals: AlgedonicSignal[] = [];

  for (const event of [...painEvents, ...pleasureEvents]) {
    const p = event.payload as {
      severity?: number;
      significance?: number;
      source: string;
      message: string;
      hubId?: string;
      originHubId?: string;
      escalationLevel?: number;
    };

    if (hubId && p.hubId !== hubId) continue;

    const ack = ackMap.get(event.id);

    signals.push({
      id: event.id,
      type: event.type === 'algedonic:pain' ? 'pain' : 'pleasure',
      severity: (p.severity || p.significance || 2) as 1 | 2 | 3,
      source: p.source,
      message: p.message,
      subject: event.subject,
      hubId: p.hubId,
      originHubId: p.originHubId,
      escalationLevel: p.escalationLevel || 0,
      timestamp: event.timestamp,
      acknowledged: !!ack,
      acknowledgedAt: ack?.at,
      acknowledgedBy: ack?.by,
    });
  }

  return signals.sort((a, b) => b.timestamp - a.timestamp);
}
