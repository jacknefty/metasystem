/**
 * Operations — Public API
 *
 * Work execution, worktrees, merge queue.
 */

// Execute
export {
  executeWork,
  finalizeWork,
} from './execute.js';

// Executor
export {
  execute,
  listExecutors,
  getExecutorConfig,
  isExecutorAvailable,
  listAvailableExecutors,
  type ExecutionResult,
  type ExecutorConfig,
  type ExecuteOptions,
} from './executor.js';

// Worktree
export {
  createWorktree,
  removeWorktree,
  getWorktreePath,
  getWorktree,
  listWorktrees,
  cleanupStaleWorktrees,
  type Worktree,
} from './worktree.js';

// Merge queue
export {
  addToMergeQueue,
  processMergeQueue,
  rebuildMergeQueue,
  getMergeQueueStatus,
  getMergeQueue,
  type MergeQueueItem,
} from './merge-queue.js';

// Git utilities (limited exposure)
export {
  isGitRepo,
  getCurrentBranch,
  getDefaultBranch,
  listBranches,
  type GitResult,
} from './git.js';
