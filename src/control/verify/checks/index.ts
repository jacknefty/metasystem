/**
 * Completion Checks (Control)
 *
 * Checks run on every work completion.
 */

export type { CheckFinding, CheckResult, CompletionCheck, VerificationResult } from './types.js';

import type { CompletionCheck } from './types.js';
import { checkScopeCompliance } from './scope.js';
import { checkBoundaryRespect } from './boundary.js';
import { checkToolPolicy } from './tools.js';
import { checkClosureProgress } from './closure.js';

export { checkScopeCompliance } from './scope.js';
export { checkBoundaryRespect } from './boundary.js';
export { checkToolPolicy } from './tools.js';
export { checkClosureProgress } from './closure.js';

export const COMPLETION_CHECKS: CompletionCheck[] = [
  { name: 'scope-compliance', run: checkScopeCompliance },
  { name: 'boundary-respect', run: checkBoundaryRespect },
  { name: 'tool-policy', run: checkToolPolicy },
  { name: 'closure-progress', run: checkClosureProgress },
];
