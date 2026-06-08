/**
 * Identity — Public API
 *
 * Node lifecycle, contexts, settings, paths.
 */

// Node lifecycle
export {
  createNode,
  getNode,
  listNodes,
  terminateNode,
  updateSettings,
  resolveContextSettings,
  checkAutonomy,
  DEFAULT_SETTINGS,
  type DerivedNode,
} from './node.js';

// Hub management (project/DAO containers)
export {
  createHub,
  listHubs,
  getHub,
  closeHub,
  type CreateHubInput,
} from './hub.js';

// Epic (major outcome grouping)
export {
  createEpic,
  completeEpic,
  type CreateEpicInput,
} from './epic.js';

// Story (bounty level - contract boundary)
export {
  createStory,
  postStoryBounty,
  claimStory,
  submitStory,
  verifyStory,
  completeStory,
  type CreateStoryInput,
} from './story.js';

// Task (agent's internal decomposition)
export {
  createTask,
  completeTask,
  type CreateTaskInput,
} from './task.js';

// Scaffold (VSM folder generator)
export {
  scaffoldScope,
  type ScopeType,
  type ScaffoldOptions,
} from './scaffold.js';

// Spine (VSM port structure)
export {
  createSpine,
  loadSpine,
  saveSpine,
  ensureSpine,
  bind,
  unbind,
  receive,
  send,
  resetCycle,
  measureVariety,
  sumOverflow,
  sumCapacity,
  sumLoad,
  getAllPorts,
  sumLoadByDirection,
  checkEssentialVariables,
  checkTimeInvariants,
  detectPortAnomalies,
  shouldTriggerAudit,
  markAuditTriggered,
  evaluateEssentialVariable,
  TIME_SCALES,
  DEFAULT_ESSENTIAL_VARIABLES,
  DEFAULT_STEP_PARAMETERS,
  type Spine,
  type Port,
  type Transducer,
  type PortDirection,
  type PortTrigger,
  type EssentialVariable,
  type StepParameter,
  type EscalationLevel,
  type TimeInvariants,
  type PortAnomaly,
  type PainSignal,
  type ControlIntelligenceTension,
  type ResourceNegotiation,
  type AccountabilityReport,
} from './spine.js';

// Settings
export {
  resolveSettings,
  getSetting,
  type NodeSettings,
  type AutonomyLevel,
} from './settings.js';

// Paths
export { paths, getDataDir } from './paths.js';

// Bootstrap
export {
  bootstrap,
  ensureInitialized,
  isInitialized,
  getConfig,
  updateConfig,
} from './bootstrap.js';

// Contract (identity document)
export {
  loadIdentity,
  saveIdentity,
  parseIdentity,
  getIdentityPath,
  computeAttestation,
  canClose,
  updateClosureCondition,
  updateScopeProgress,
  loadIdentityAtScope,
  saveIdentityAtScope,
  type IdentityContract,
  type IdentityFrontmatter,
  type Membership,
} from './contract.js';

// Policy (Identity updates)
export {
  emitPolicy,
  proposePolicyChange,
  receivePolicyFromParent,
  type PolicyChangeType,
  type PolicyChange,
} from './policy.js';

// Drift (identity deviation detection)
export {
  evaluateIdentityDrift,
  checkAndHandleDrift,
  probeIdentityDrift,
  type DriftAnalysis,
} from './drift.js';

// Scoped paths (listChildren, getParentPath)
export {
  listChildren,
  getParentPath,
} from './scoped-paths.js';

// Merkle (identity attestation)
export {
  collectAllIdentities,
  buildMerkleTree,
  getProof,
  verifyProof,
  getIdentityRoot,
  type MerkleLeaf,
  type MerkleTree,
} from './merkle.js';

// Boundary (tool permission checking)
export * as boundary from './boundary/index.js';

// Sync (identity root monitoring)
export {
  checkIdentityRoot,
  getIdentityRootHistory,
  getPendingRootCommits,
  markRootCommitted,
} from './sync.js';
