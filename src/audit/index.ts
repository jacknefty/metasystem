/**
 * Audit Module (sporadic)
 *
 * Sporadic re-verification at each recursion level.
 * Pluggable probe framework for different verification types.
 */

export type {
  NodeAuditResult,
  HubAuditResult,
  DaoAuditResult,
  AuditFinding,
} from './types.js';

export { auditOwnWork } from './node/audit.js';
export { checkCreditIntegrity } from './node/checks/index.js';
export { auditNodeVerification } from './context/audit.js';
export { auditContextAudit } from './dao/audit.js';

export { selfAssess } from './assess.js';

// Probe Framework
export {
  getProbe,
  runProbe,
  runAllProbes,
  runRandomProbe,
  probeSpine,
  probeCirculatory,
  probeInformational,
  probeRecursion,
  probeClosure,
  type ProbeType,
  type ProbeResult,
  type ProbeFinding,
  type ProbeFunction,
} from './probes/index.js';
