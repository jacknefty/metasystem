# Frontend API Mapping

The viewport frontend expects these endpoints. The new backend must implement them.

## Priority 1 — Core (Must Have)

### Nodes (Identity)
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/identities` | GET | List all nodes | `node/identity.ts` → `listNodes()` |
| `/api/identities/:id` | GET | Get single node | `node/identity.ts` → `getNode(id)` |
| `/api/identities` | POST | Create node | `node/identity.ts` → `createNode()` |
| `/api/identities/:id` | DELETE | Terminate node | `node/identity.ts` → `terminateNode(id)` |
| `/api/identities/:id/settings` | GET | Get node settings | `node/identity.ts` → `getNode(id).settings` |
| `/api/identities/:id/settings` | PUT | Update settings | `node/identity.ts` → `updateSettings()` |
| `/api/identities/:id/members` | GET | Get members of context | `edge/membership.ts` → `getMembers(id)` |
| `/api/identities/:id/memberships` | GET | Get contexts node belongs to | `edge/membership.ts` → `getMemberships(id)` |

### Membership
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/nodes/:contextId/join` | POST | Join context | `edge/membership.ts` → `joinContext()` |
| `/api/nodes/:contextId/leave` | POST | Leave context | `edge/membership.ts` → `leaveContext()` |

### Work
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/work` | GET | List work (opt ?projectId=) | `edge/work.ts` → `listWork()` |
| `/api/work/active` | GET | List active work | `edge/work.ts` → `listWork({status: 'active'})` |
| `/api/work/graph/:projectId` | GET | Work DAG for viz | Derive from work + dependencies |
| `/api/work/:id/claim` | POST | Claim work | `edge/work.ts` → `claimWork()` |
| `/api/work/:id/release` | POST | Release claim | `edge/work.ts` → `releaseWork()` |
| `/api/work/:id/submit` | POST | Submit work | `edge/work.ts` → `submitWork()` |
| `/api/work/:id/claimability` | GET | Check if claimable | `node/coordination.ts` → `checkClaimability()` |

### Pool (Bounty)
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/pool` | GET | Available work pool | `node/coordination.ts` → `getBountyPool()` |
| `/api/pool/stats` | GET | Pool statistics | `node/coordination.ts` → `getPoolStats()` |
| `/api/workers/:id/reputation` | GET | Worker reputation | `node/coordination.ts` → `getReputation(id)` |
| `/api/workers/:id/claims` | GET | Worker's active claims | `node/coordination.ts` → `getWorkerClaims(id)` |

### Variety
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/variety/balance` | GET | System variety balance | `edge/variety.ts` → `getBalance()` |
| `/api/variety/contract/:id` | GET | Contract resolution | `edge/variety.ts` → `getResolution(id)` |

### Homeostat
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/vsm/homeostat` | GET | Homeostat state | `node/control.ts` → `getHomeostatState()` |
| `/api/vsm/health` | GET | System health | Same as homeostat |

### Workspace
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/workspace/root` | GET | Get root node | `node/identity.ts` → `getWorkspaceRoot()` |
| `/api/bootstrap` | POST | Bootstrap workspace | Create root node |

## Priority 2 — Important (Need Soon)

### Algedonic
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/algedonic/pending` | GET | Pending signals | `edge/algedonic.ts` → `getPendingSignals()` |
| `/api/algedonic/all` | GET | All signals | `edge/algedonic.ts` → `getAllSignals()` |
| `/api/algedonic/project/:id` | GET | Project signals | Filter by projectId |
| `/api/algedonic/active-nodes` | GET | Nodes with alerts | Derive from signals |
| `/api/algedonic/resolve` | POST | Resolve signal | `edge/algedonic.ts` → `resolveSignal()` |

### Events (SSE)
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/events` | GET (SSE) | Real-time events | Stream from chain EventEmitter |

### Settings
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/settings` | GET | Workspace settings | Config file |
| `/api/settings` | PUT | Update settings | Config file |

## Priority 3 — Nice to Have

### Projects
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/projects/create` | POST | Create project | `createNode()` + `joinContext()` |
| `/api/directories` | GET | Browse filesystem | Utility |

### Executors
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/executors` | GET | Available executors | Static list |

### Work Actions
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/work/:id/redispatch` | POST | Retry work | Re-invoke |
| `/api/work/:id/terminate` | POST | Terminate work | `edge/work.ts` |

### Bounty
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/bounty/status` | GET | Bounty summary | Derive from pool |

### Credits (Future/Network)
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/credits/pending` | GET | Pending credits | Future |
| `/api/credits/total` | GET | Total credits | Future |

### Network (Future)
| Endpoint | Method | Purpose | Maps To |
|----------|--------|---------|---------|
| `/api/network/*` | * | EVM integration | Future |

---

## Response Shapes

### Node (Identity)
```typescript
{
  id: string;
  name: string;
  purpose: string;
  scope: string[];
  status: 'active' | 'terminated';
  settings: {
    autonomousMode: boolean;
    executor: string;
    maxAttempts: number;
    availableForWork: boolean;
    // securityMode, confidenceThreshold optional
  };
  memberships: Array<{ context: string; role?: string; joinedAt: number }>;
  memberCount?: number;  // computed: nodes that are members of this context
  createdAt: number;
  updatedAt: number;
}
```

### Work (BountyWork)
```typescript
{
  id: string;
  name: string;
  ownerId: string;
  projectId: string;
  status: string;  // 'active' | 'blocked' | 'executing' | 'pending-review' | 'fulfilled' | ...
  bountyStatus?: 'posted' | 'claimed' | 'submitted' | 'verified' | 'completed' | 'expired' | 'failed';
  bounty?: {
    amount: number;
    currency: 'variety';
    postedAt: number;
    expiresAt?: number;
  };
  claim?: {
    workerId: string;
    claimedAt: number;
    deadline: number;
  };
  conditions: Array<{
    id: string;
    description: string;
    verifier: string;
    varietyWeight?: number;
    met: boolean;
  }>;
  dependsOn: string[];
  createdAt: number;
  updatedAt: number;
}
```

### WorkerReputation
```typescript
{
  identityId: string;
  completedCount: number;
  releasedCount: number;
  totalEarned: number;
  completionRate: number;  // 0-1
  maxConcurrentClaims: number;  // derived from completionRate
}
```

### VarietyBalance
```typescript
{
  perceived: number;   // variety:env:in total
  resolved: number;    // variety:work:out total
  ratio: number;       // perceived / resolved
  healthy: boolean;    // ratio close to 1.0
  // byDomain optional for detailed view
}
```

### HomeostatResult
```typescript
{
  balance: VarietyBalance;
  action: 'none' | 'boost_s4' | 'boost_s3';  // Or use: 'none' | 'invoke' | 'perceive'
  allowDispatch: boolean;  // Or: shouldInvoke
  diagnosis: string;
}
```

### AlgedonicSignal
```typescript
{
  id: string;
  type: 'pain' | 'pleasure';
  source: string;
  subject: string;
  projectId?: string;
  intensity: number;
  message: string;
  requiresAction: boolean;
  emittedAt: number;
}
```

---

## Notes for Implementation

1. **memberCount** — Frontend expects this on identity. Compute it: count nodes where `memberships` includes this id as context.

2. **bountyStatus vs status** — Work has both. `status` is lifecycle (active/fulfilled), `bountyStatus` is claim lifecycle (posted/claimed/etc). Keep both.

3. **WorkGraph** — The particle visualization needs this. Derive from work list + dependsOn edges. Include:
   - `nodes` — work items with conditions, variety totals
   - `edges` — dependency links
   - `leveragePoint` — work item with highest impact (most dependents)
   - `stats` — totals for progress bar

4. **SSE Events** — Frontend uses EventSource to `/api/events`. Stream chain events as they happen. Important for real-time updates.

5. **Backward compat on paths** — Keep `/api/vsm/homeostat` even though we're dropping VSM jargon internally. Or alias to `/api/control/homeostat`.
