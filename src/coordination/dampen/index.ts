/**
 * Dampen — Public API
 *
 * Scope locking, housekeeping, strategy.
 */

// Scope locking
export {
  acquireScope,
  releaseScope,
  getLock,
  isScopeLocked,
  getActiveLocks,
  rebuildLocks,
  clearStaleLocks,
  type ScopeLock,
  type AcquireResult,
} from './locks.js';

// Scope checking
export {
  checkFileInScope,
  filterFilesToScope,
  expandScope,
  enforceScope,
} from './scope.js';

// Housekeeping
export {
  runHousekeeping,
  maybeRunHousekeeping,
  clearStarvationSignal,
  clearHoardingSignal,
} from './housekeeping.js';

// Strategy
export {
  analyzeCoupling,
  getNextExecutableWork,
} from './strategy.js';
