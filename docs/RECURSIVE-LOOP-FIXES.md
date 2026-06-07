# Recursive Loop Fixes Specification

Four gaps prevent the full recursive value loop from closing. Each fix below is self-contained.

---

## Fix 1: Scoped Variety Accounting

**Gap:** Variety events are emitted flat — no scope filtering on queries.

**Current:**
```typescript
// variety.ts
export async function emitPerceived(emitter, subject, bits, context?) {
  await emitVariety('env', 'in', emitter, subject, bits, { context });
}
```

**Fix:**

### 1.1 Update `emitVariety` signature

File: `src/coordination/resources/token.ts`

```typescript
export async function emitVariety(
  domain: VarietyDomain,
  direction: VarietyDirection,
  source: string,
  subject: string,
  bits: number,
  opts?: { 
    workId?: string; 
    conditionId?: string; 
    contextId?: string;      // ADD
    daoAddress?: string;     // ADD
  }
): Promise<VarietyToken>
```

Add `contextId` and `daoAddress` to the event payload.

### 1.2 Update `emitPerceived` / `emitResolved`

File: `src/coordination/resources/variety.ts`

```typescript
export async function emitPerceived(
  emitter: string,
  subject: string,
  bits: number,
  contextId?: string,
  daoAddress?: string
): Promise<void> {
  await emitVariety('env', 'in', emitter, subject, bits, { contextId, daoAddress });
}

export async function emitResolved(
  emitter: string,
  subject: string,
  bits: number,
  workId?: string,
  contextId?: string,
  daoAddress?: string
): Promise<void> {
  await emitVariety('work', 'out', emitter, subject, bits, { workId, contextId, daoAddress });
}
```

### 1.3 Update call sites

File: `src/coordination/resources/work.ts`

In `postBounty()`:
```typescript
await emitPerceived(work.ownerId, workId, bountyAmount, work.contextId, work.daoAddress);
```

In `completeWork()`:
```typescript
await emitResolved(nodeId, workId, bountyAmount, workId, work.contextId, work.daoAddress);
```

### 1.4 Add scoped balance query

File: `src/coordination/resources/token.ts`

```typescript
export async function getScopedBalance(scope: Scope): Promise<SystemBalance> {
  const events = await getChain().recall({});
  
  const domainBalances: Record<VarietyDomain, VarietyBalance> = {
    work: { domain: 'work', in: 0, out: 0, net: 0 },
    env: { domain: 'env', in: 0, out: 0, net: 0 },
    coord: { domain: 'coord', in: 0, out: 0, net: 0 },
    identity: { domain: 'identity', in: 0, out: 0, net: 0 },
  };

  for (const event of events) {
    const parsed = parseEventType(event.type);
    if (!parsed) continue;
    
    const payload = event.payload as { bits?: number; contextId?: string; daoAddress?: string };
    
    // Filter by scope
    if (!matchesScope(payload, scope)) continue;
    
    const { domain, direction } = parsed;
    const bits = payload.bits ?? 0;
    
    if (direction === 'in') {
      domainBalances[domain].in += bits;
    } else {
      domainBalances[domain].out += bits;
    }
    domainBalances[domain].net = domainBalances[domain].in - domainBalances[domain].out;
  }

  const perceived = Object.values(domainBalances).reduce((sum, d) => sum + d.in, 0);
  const resolved = Object.values(domainBalances).reduce((sum, d) => sum + d.out, 0);
  const ratio = resolved > 0 ? perceived / resolved : (perceived > 0 ? Infinity : 0);

  return {
    perceived,
    resolved,
    ratio,
    healthy: ratio >= 0.8 && ratio <= 1.2,
    byDomain: domainBalances,
  };
}

function matchesScope(payload: { contextId?: string; daoAddress?: string }, scope: Scope): boolean {
  switch (scope.level) {
    case 'network':
      return true;
    case 'dao':
      return payload.daoAddress === scope.address;
    case 'context':
      return payload.contextId === scope.id;
    case 'node':
    case 'work':
    case 'condition':
      return payload.contextId === scope.contextId;
    default:
      return true;
  }
}
```

---

## Fix 2: F Propagation Up Recursion

**Gap:** Child F doesn't aggregate to parent F automatically.

**Current:** `getFreeEnergy()` computes F for a single scope, no aggregation.

**Fix:**

### 2.1 Add recursive F computation

File: `src/control/dynamics/free-energy.ts` (new file)

```typescript
import { Scope, getParentScope, scopeKey } from './types.js';
import { getScopedBalance } from '../../coordination/resources/token.js';
import { getChain } from '../../coordination/channels/chain.js';

export interface FreeEnergyState {
  scope: Scope;
  F_local: number;      // This scope's own variety
  F_children: number;   // Sum of children's F
  F_total: number;      // F_local + F_children
  childCount: number;
  computedAt: number;
}

const freeEnergyCache = new Map<string, FreeEnergyState>();
const CACHE_TTL = 5000; // 5 seconds

export async function getFreeEnergy(scope: Scope): Promise<FreeEnergyState> {
  const key = scopeKey(scope);
  const cached = freeEnergyCache.get(key);
  if (cached && Date.now() - cached.computedAt < CACHE_TTL) {
    return cached;
  }

  // Get local F from scoped variety balance
  const balance = await getScopedBalance(scope);
  const F_local = balance.perceived - balance.resolved;

  // Get children's F
  const children = await getChildScopes(scope);
  let F_children = 0;
  
  for (const child of children) {
    const childState = await getFreeEnergy(child);
    F_children += childState.F_total;
  }

  const state: FreeEnergyState = {
    scope,
    F_local,
    F_children,
    F_total: F_local + F_children,
    childCount: children.length,
    computedAt: Date.now(),
  };

  freeEnergyCache.set(key, state);
  return state;
}

async function getChildScopes(scope: Scope): Promise<Scope[]> {
  switch (scope.level) {
    case 'network': {
      // Children are all DAOs
      const events = await getChain().recall({ type: 'dao:registered' });
      return events.map(e => ({ level: 'dao', address: e.subject } as Scope));
    }
    case 'dao': {
      // Children are contexts in this DAO
      const events = await getChain().recall({ type: 'context:created' });
      return events
        .filter(e => (e.payload as { daoAddress?: string }).daoAddress === scope.address)
        .map(e => ({ level: 'context', id: e.subject, daoAddress: scope.address } as Scope));
    }
    case 'context': {
      // Children are work items in this context
      const events = await getChain().recall({ type: 'work:created' });
      return events
        .filter(e => (e.payload as { contextId?: string }).contextId === scope.id)
        .map(e => ({ level: 'work', id: e.subject, contextId: scope.id } as Scope));
    }
    case 'work': {
      // Children are conditions
      const events = await getChain().recall({ type: 'work:created', subject: scope.id });
      if (events.length === 0) return [];
      const conditions = (events[0].payload as { conditions?: Array<{ id: string }> }).conditions || [];
      return conditions.map(c => ({
        level: 'condition',
        id: c.id,
        workId: scope.id,
        contextId: scope.contextId,
      } as Scope));
    }
    default:
      return [];
  }
}

export function invalidateFreeEnergyCache(scope: Scope): void {
  // Invalidate this scope and all ancestors
  let current: Scope | null = scope;
  while (current) {
    freeEnergyCache.delete(scopeKey(current));
    current = getParentScope(current);
  }
}
```

### 2.2 Invalidate on variety events

File: `src/runtime.ts`

Add to the event handler:

```typescript
import { invalidateFreeEnergyCache } from './control/dynamics/free-energy.js';

// In the variety event handlers:
if (event.type.startsWith('variety:')) {
  const payload = event.payload as { contextId?: string; daoAddress?: string };
  if (payload.contextId) {
    invalidateFreeEnergyCache({ level: 'context', id: payload.contextId });
  }
}
```

### 2.3 Add API endpoint

File: `src/api.ts`

```typescript
import { getFreeEnergy } from './control/dynamics/free-energy.js';

app.get('/api/dynamics/free-energy/:level/:id?', wrap(async (req, res) => {
  const { level, id } = req.params;
  const { address } = req.query;
  
  let scope: Scope;
  switch (level) {
    case 'network':
      scope = { level: 'network' };
      break;
    case 'dao':
      scope = { level: 'dao', address: str(address) };
      break;
    case 'context':
      scope = { level: 'context', id: str(id) };
      break;
    default:
      res.status(400).json({ error: 'Invalid level' });
      return;
  }
  
  const state = await getFreeEnergy(scope);
  res.json(state);
}));
```

---

## Fix 3: Auto-Commit Merkle Root

**Gap:** Credits are pending locally. Bridge to EVM is manual.

**Fix:**

### 3.1 Add periodic Merkle commit

File: `src/bridge/auto-commit.ts` (new file)

```typescript
import { getPendingCredits, markCreditCommitted } from '../coordination/resources/token.js';
import { computeMerkleRoot, buildMerkleTree } from './merkle.js';
import { getChain } from '../coordination/channels/chain.js';

const COMMIT_THRESHOLD = 10;      // Commit when this many credits pending
const COMMIT_INTERVAL = 60_000;   // Or every 60 seconds if any pending

let lastCommitTime = 0;

export async function maybeCommitMerkleRoot(): Promise<{
  committed: boolean;
  creditCount: number;
  root?: string;
}> {
  const pending = await getPendingCredits();
  
  if (pending.length === 0) {
    return { committed: false, creditCount: 0 };
  }

  const now = Date.now();
  const shouldCommit = 
    pending.length >= COMMIT_THRESHOLD ||
    (pending.length > 0 && now - lastCommitTime > COMMIT_INTERVAL);

  if (!shouldCommit) {
    return { committed: false, creditCount: pending.length };
  }

  // Build Merkle tree from pending credits
  const leaves = pending.map(c => c.proofHash);
  const tree = buildMerkleTree(leaves);
  const root = computeMerkleRoot(tree);

  // Record commitment
  await getChain().append('merkle:committed', 'system', root, {
    creditIds: pending.map(c => c.id),
    root,
    leafCount: pending.length,
    committedAt: now,
  });

  // Mark credits as committed (not yet minted on-chain)
  for (const credit of pending) {
    await markCreditCommitted(credit.id, root);
  }

  lastCommitTime = now;

  return {
    committed: true,
    creditCount: pending.length,
    root,
  };
}
```

### 3.2 Add to runtime loop

File: `src/runtime.ts`

```typescript
import { maybeCommitMerkleRoot } from './bridge/auto-commit.js';

// In the housekeeping interval or as a separate interval:
setInterval(async () => {
  const result = await maybeCommitMerkleRoot();
  if (result.committed) {
    console.log(`[Bridge] Committed Merkle root: ${result.root} (${result.creditCount} credits)`);
  }
}, 30_000);
```

### 3.3 Add token.ts helper

File: `src/coordination/resources/token.ts`

```typescript
export async function markCreditCommitted(creditId: string, merkleRoot: string): Promise<void> {
  await getChain().append('credit:committed', 'system', creditId, {
    merkleRoot,
    committedAt: Date.now(),
  });
}

export async function getPendingCredits(): Promise<PendingCredit[]> {
  const earned = await getChain().recall({ type: 'credit:earned' });
  const committed = await getChain().recall({ type: 'credit:committed' });
  
  const committedIds = new Set(committed.map(e => e.subject));
  
  return earned
    .filter(e => !committedIds.has(e.subject))
    .map(e => {
      const p = e.payload as EventPayloads['credit:earned'];
      return {
        id: e.subject,
        workId: p.workId,
        nodeId: p.nodeId,
        bits: p.bits,
        amount: BigInt(p.amount),
        proofHash: p.proofHash,
        earnedAt: e.timestamp,
      };
    });
}
```

---

## Fix 4: DAO-Level F Display in Governance Tab

**Gap:** Governance tab shows system constants but not the DAO's aggregate F.

**Fix:**

### 4.1 Add API client function

File: `viewport/src/api/client.ts`

```typescript
export interface FreeEnergyState {
  scope: { level: string; id?: string; address?: string };
  F_local: number;
  F_children: number;
  F_total: number;
  childCount: number;
  computedAt: number;
}

export async function fetchFreeEnergy(level: string, id?: string, address?: string): Promise<FreeEnergyState | null> {
  let path = `/dynamics/free-energy/${level}`;
  if (id) path += `/${encodeURIComponent(id)}`;
  if (address) path += `?address=${encodeURIComponent(address)}`;
  
  const res = await api.get<FreeEnergyState>(path);
  return res.data || null;
}
```

### 4.2 Update GovernancePanel

File: `viewport/src/components/GovernancePanel.tsx`

Add to state:
```typescript
const [freeEnergy, setFreeEnergy] = useState<FreeEnergyState | null>(null);
```

Add to load function:
```typescript
// Determine scope from nodeId
const isDAO = /^0x[a-fA-F0-9]{40}$/.test(nodeId);
const fe = isDAO 
  ? await fetchFreeEnergy('dao', undefined, nodeId)
  : await fetchFreeEnergy('context', nodeId);
setFreeEnergy(fe);
```

Add section before "Your Voting Power":
```tsx
{/* Aggregate Free Energy */}
{freeEnergy && (
  <Section title="Free Energy (F)">
    <div className="grid grid-cols-3 gap-3 mb-3">
      <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
        <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Local</div>
        <div className="text-xl font-mono" style={{ 
          color: freeEnergy.F_local > 0 ? COLORS.status.warning : COLORS.status.healthy 
        }}>
          {freeEnergy.F_local}
        </div>
      </div>
      <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
        <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Children ({freeEnergy.childCount})</div>
        <div className="text-xl font-mono" style={{ 
          color: freeEnergy.F_children > 0 ? COLORS.status.warning : COLORS.status.healthy 
        }}>
          {freeEnergy.F_children}
        </div>
      </div>
      <div className="p-3 rounded" style={{ background: COLORS.bg.elevated }}>
        <div className="text-xs mb-1" style={{ color: COLORS.text.muted }}>Total</div>
        <div className="text-xl font-mono" style={{ 
          color: freeEnergy.F_total > 0 ? COLORS.status.warning : COLORS.status.healthy 
        }}>
          {freeEnergy.F_total}
        </div>
      </div>
    </div>
    <div className="text-xs" style={{ color: COLORS.text.muted }}>
      F = perceived - resolved. Positive F means unresolved variety (work to do).
      Children's F propagates up — a DAO's F is the sum of all contexts' F.
    </div>
  </Section>
)}
```

---

## Dependency Order

1. **Fix 1** (Scoped Variety) — no dependencies
2. **Fix 2** (F Propagation) — depends on Fix 1 for `getScopedBalance(scope)`
3. **Fix 3** (Auto-Commit) — no dependencies, can be parallel with 1-2
4. **Fix 4** (Governance UI) — depends on Fix 2 for `getFreeEnergy(scope)`

## Validation

After all fixes:

```bash
# Check scoped variety
curl "http://localhost:3000/api/dynamics/free-energy/dao?address=0x..."

# Should return:
{
  "F_local": 0,
  "F_children": 147,  # Sum of contexts
  "F_total": 147,
  "childCount": 3
}

# Check Merkle commits
curl http://localhost:3000/api/bridge/root
# Should show latest committed root with credit count
```

The loop is complete when:
- Work posted at context level → F increases at context AND DAO
- Work completed → F decreases, credit minted, Merkle committed
- Credit → on-chain LOOP (via bridge confirmation)
- LOOP scarcity at DAO level reflects aggregate value creation below
