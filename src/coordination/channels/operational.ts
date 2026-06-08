/**
 * Operational Links — Lateral Operations→Operations Connections
 *
 * supply/receive: Value chain between siblings
 * intersect: Shared environment management
 *
 * These ports enable dependency tracking and conflict detection
 * without requiring parent intervention.
 */

import { getChain } from './chain.js';
import { loadSpine, saveSpine } from '../../identity/spine.js';
import { at } from '../../identity/scoped-paths.js';

// =============================================================================
// SUPPLY/RECEIVE — Value Chain
// =============================================================================

export interface Artifact {
  id: string;
  type: string;
  scope: string;
  producedBy: string;
  producedAt: number;
}

export interface Dependency {
  fromScope: string;
  artifactId: string;
  requiredBy: string;
  status: 'pending' | 'available' | 'consumed';
}

const pendingDependencies = new Map<string, Dependency[]>();

/**
 * Supply an artifact to siblings.
 * Records on supply port and emits chain event.
 */
export async function supplyArtifact(
  scopePath: string,
  artifact: Artifact
): Promise<void> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  if (spine) {
    spine.supply.currentLoad += 10;
    spine.supply.lastFired = Date.now();
    saveSpine(scope, spine);
  }

  // Log artifact supply (uses variety:work:out for audit trail)
  await getChain().append('variety:work:out', artifact.producedBy, artifact.id, {
    bits: 10,
    context: `artifact:${artifact.type}:${artifact.scope}`,
    scopePath,  // Scale-free: consistent with network events
  });

  // Fulfill pending dependencies
  const pending = pendingDependencies.get(artifact.id) ?? [];
  for (const dep of pending) {
    dep.status = 'available';
    await deliverDependency(dep);
  }
  pendingDependencies.delete(artifact.id);
}

/**
 * Request to receive an artifact from a sibling.
 * If not yet available, registers as pending.
 */
export async function requestArtifact(
  scopePath: string,
  artifactId: string,
  fromScope: string
): Promise<Dependency> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  if (spine) {
    spine.receive.currentLoad += 10;
    spine.receive.lastFired = Date.now();
    saveSpine(scope, spine);
  }

  const dep: Dependency = {
    fromScope,
    artifactId,
    requiredBy: scopePath,
    status: 'pending',
  };

  // Check if artifact already exists
  const events = await getChain().recall({ subject: artifactId });
  const produced = events.find(e => e.type === 'work:merged');

  if (produced) {
    dep.status = 'available';
  } else {
    // Register as pending
    const existing = pendingDependencies.get(artifactId) ?? [];
    existing.push(dep);
    pendingDependencies.set(artifactId, existing);
  }

  return dep;
}

async function deliverDependency(dep: Dependency): Promise<void> {
  const scope = at(dep.requiredBy);
  const spine = loadSpine(scope);
  if (spine) {
    spine.receive.currentLoad += 5;
    spine.receive.lastFired = Date.now();
    saveSpine(scope, spine);
  }

  console.log(`[Operational] Dependency delivered: ${dep.artifactId} → ${dep.requiredBy}`);
}

// =============================================================================
// INTERSECT — Shared Environment
// =============================================================================

export interface SharedResource {
  resourceId: string;
  resourceType: 'file' | 'api' | 'budget' | 'other';
  scope: string;
  exclusive: boolean;
  claimedBy: string[];
  lastClaimed: number;
}

const sharedResources = new Map<string, SharedResource>();

/**
 * Declare use of a shared resource.
 * Detects potential conflicts with siblings.
 */
export async function declareSharedResource(
  scopePath: string,
  resource: Omit<SharedResource, 'claimedBy' | 'lastClaimed'>
): Promise<{ conflict: boolean; conflictsWith: string[] }> {
  const scope = at(scopePath);
  const spine = loadSpine(scope);
  if (spine) {
    spine.intersect.currentLoad += 10;
    spine.intersect.lastFired = Date.now();
    saveSpine(scope, spine);
  }

  const key = `${resource.resourceType}:${resource.resourceId}`;
  const existing = sharedResources.get(key);

  if (existing) {
    // Check for conflict
    if (existing.exclusive || resource.exclusive) {
      // Exclusive resource already claimed
      return {
        conflict: true,
        conflictsWith: existing.claimedBy,
      };
    }

    // Non-exclusive, add to claimants
    if (!existing.claimedBy.includes(scopePath)) {
      existing.claimedBy.push(scopePath);
      existing.lastClaimed = Date.now();
    }
    sharedResources.set(key, existing);

    return { conflict: false, conflictsWith: [] };
  }

  // New resource claim
  const newResource: SharedResource = {
    ...resource,
    claimedBy: [scopePath],
    lastClaimed: Date.now(),
  };
  sharedResources.set(key, newResource);

  return { conflict: false, conflictsWith: [] };
}

/**
 * Release claim on a shared resource.
 */
export function releaseSharedResource(scopePath: string, resourceId: string): void {
  for (const [key, resource] of sharedResources) {
    if (resource.resourceId === resourceId) {
      resource.claimedBy = resource.claimedBy.filter(c => c !== scopePath);
      if (resource.claimedBy.length === 0) {
        sharedResources.delete(key);
      }
    }
  }
}

/**
 * Get all shared resources a scope participates in.
 */
export function getSharedResources(scopePath: string): SharedResource[] {
  const result: SharedResource[] = [];
  for (const resource of sharedResources.values()) {
    if (resource.claimedBy.includes(scopePath)) {
      result.push(resource);
    }
  }
  return result;
}

/**
 * Detect potential merge conflicts for file-type resources.
 */
export function detectMergeConflicts(scopePath: string): Array<{
  resource: SharedResource;
  conflictsWith: string[];
}> {
  const conflicts: Array<{ resource: SharedResource; conflictsWith: string[] }> = [];

  for (const resource of sharedResources.values()) {
    if (resource.resourceType !== 'file') continue;
    if (!resource.claimedBy.includes(scopePath)) continue;
    if (resource.claimedBy.length <= 1) continue;

    conflicts.push({
      resource,
      conflictsWith: resource.claimedBy.filter(c => c !== scopePath),
    });
  }

  return conflicts;
}
