/**
 * Channels — Public API
 *
 * Chain access and event types.
 */

// Chain access (primary interface)
export { getChain, setChain, LocalChain } from './chain.js';
export type { ChainBackend, EventFilter } from './backend.js';

// Event types (needed for type checking)
export type {
  ChainEvent,
  EventType,
  EventPayloads,
  Condition,
  Bounty,
  WorkContract,
} from './events.js';
export { createEvent, isEventType } from './events.js';

// Algedonic signals
export {
  emitPain,
  emitPleasure,
  acknowledgePain,
  getPendingSignals,
  getAllSignals,
  getAlarmPortLoad,
  type AlgedonicSignal,
} from './algedonic.js';

// Operational links (Operations→Operations lateral)
export {
  supplyArtifact,
  requestArtifact,
  declareSharedResource,
  releaseSharedResource,
  getSharedResources,
  detectMergeConflicts,
  type Artifact,
  type Dependency,
  type SharedResource,
} from './operational.js';

// Accountability (periodic reports)
export {
  emitReport,
  emitReportOnEvent,
  startPeriodicReporting,
} from './accountability.js';
