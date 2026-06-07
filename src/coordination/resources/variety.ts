/**
 * Variety Accounting
 *
 * The Second Axiom: Control variety must equal Intelligence variety.
 * This module provides convenience wrappers around token.ts for the
 * most common variety operations.
 */

import { emitVariety, getSystemBalance, queryTokens, type SystemBalance } from './token.js';

export type SystemVarietyBalance = SystemBalance;

export interface VarietyOptions {
  context?: string;      // descriptive label ("work posted", "scan complete")
  contextId?: string;    // scope identifier for filtering
  daoAddress?: string;   // DAO scope identifier
  workId?: string;       // for resolved variety
  scopePath?: string;    // full scope path for recursive F computation
}

export async function emitPerceived(
  emitter: string,
  subject: string,
  bits: number,
  opts?: VarietyOptions
): Promise<void> {
  await emitVariety('env', 'in', emitter, subject, bits, {
    context: opts?.context,
    contextId: opts?.contextId,
    daoAddress: opts?.daoAddress,
    scopePath: opts?.scopePath,
  });
}

export async function emitResolved(
  emitter: string,
  subject: string,
  bits: number,
  opts?: VarietyOptions
): Promise<void> {
  await emitVariety('work', 'out', emitter, subject, bits, {
    workId: opts?.workId,
    context: opts?.context,
    contextId: opts?.contextId,
    daoAddress: opts?.daoAddress,
    scopePath: opts?.scopePath,
  });
}

export async function getBalance(): Promise<SystemBalance> {
  return getSystemBalance();
}

export async function getWorkResolution(workId: string): Promise<{
  perceivedIn: number;
  resolvedOut: number;
  net: number;
  status: 'unresolved' | 'resolved' | 'over-resolved';
}> {
  const tokens = await queryTokens({ subject: workId });

  let perceivedIn = 0;
  let resolvedOut = 0;

  for (const token of tokens) {
    if (token.direction === 'in') {
      perceivedIn += token.bits;
    } else {
      resolvedOut += token.bits;
    }
  }

  const net = perceivedIn - resolvedOut;
  let status: 'unresolved' | 'resolved' | 'over-resolved';

  if (net > 0) status = 'unresolved';
  else if (net < 0) status = 'over-resolved';
  else status = 'resolved';

  return { perceivedIn, resolvedOut, net, status };
}

export function getDiagnosis(balance: SystemBalance): string {
  if (balance.ratio === Infinity) {
    return 'Perceiving but not resolving. No work output yet.';
  }
  if (balance.ratio === 0) {
    return 'Resolving without perceiving. Operating blind.';
  }
  if (balance.ratio > 1.0) {
    return `Intelligence dominant (${balance.ratio.toFixed(2)}). Unresolved variety exists.`;
  }
  if (balance.ratio < 1.0) {
    return `Control dominant (${balance.ratio.toFixed(2)}). Over-resolved.`;
  }
  return 'Equilibrium (ratio 1.00). Second Axiom satisfied.';
}
