# Unified Dynamics Specification v2

## Overview

A scale-free formalism unifying Bohmian mechanics, Free Energy Principle, and token economics. The same equations govern behavior from individual agents to the network. The $LOOP token is the unit of account for resolved variety.

**Core insight:** Agents (nodes) are particles that evolve through configuration space. Work, conditions, and contexts are environmental states that shape the free energy landscape. The network aggregates free energy across all DAOs — the token price is the market's continuous judgment of F_network.

---

## Part I: The Math

### 1. Scope Hierarchy

```
network
├── dao:0x123...
│   └── context:frontend
│       └── work:add-button
│           └── condition:passes-test
└── dao:0x456...
    └── ...
```

```typescript
type Scope =
  | { level: 'condition'; id: string; workId: string; contextId: string; daoAddress?: string }
  | { level: 'work'; id: string; contextId: string; daoAddress?: string }
  | { level: 'context'; id: string; daoAddress?: string }
  | { level: 'node'; id: string }
  | { level: 'dao'; address: string }
  | { level: 'network' };
```

Agents (nodes) have configuration Q and evolve. Everything else contributes to F.

### 2. Free Energy F

Free energy at any environmental scope:

```
F(S) = Σ variety:in(S) - Σ variety:out(S)
```

Aggregates upward:

```
F(condition) = weight × (1 - met)
F(work) = Σ F(condition)
F(context) = Σ F(work) where status ≠ fulfilled
F(dao) = Σ F(context)
F(network) = Σ F(dao)
```

**Interpretation:**
- F > 0: Unresolved variety. Potential unrealized.
- F = 0: Equilibrium. All perceived variety resolved.
- F < 0: Over-resolved. Resolving things not perceived (operating blind).

### 3. Epistemic Value H

Uncertainty about verifiers at a scope:

```
H(S) = Σ (1 - confidence(τ_v,S)) × weight_v
```

Where confidence in τ is:

```
confidence(τ_v,S) = min(samples(v,S) / threshold, 1.0)
```

High H = we don't know if our verifiers work here. Exploration is valuable.

### 4. Expected Free Energy G

Agents minimize G, not F directly:

```
G(Q, S) = F(Q, S) + γ × H(Q, S)
          \_____/     \_______/
         pragmatic    epistemic
```

- Pragmatic: Resolve variety, reduce F.
- Epistemic: Explore uncertain regions, reduce H.

γ is the exploration coefficient. Higher γ = more exploration.

### 5. Wave Function ψ

The wave function over agent configuration space:

```
ψ(Q) = A(Q) × exp(i × φ(Q))

where:
  A(Q) = exp(-β × G(Q))     amplitude from expected free energy
  φ(Q) = ∫ G(Q') dQ'        phase (path integral)
```

Amplitude is high where G is low. Agents are drawn to regions that minimize expected free energy.

### 6. Precision τ

Learned confidence in a verifier at a scope:

```
τ(v, S) = prior(v) × (1 - w) + empirical(v, S) × w

where:
  prior(v) = maxConfidence from registry
  empirical(v, S) = success_rate(v, S) from observations
  w = min(samples(v, S) / threshold, 1.0)
```

τ inherits downward with scope-specific overrides:

```
τ(v, condition) = τ(v, work) ?? τ(v, context) ?? τ(v, dao) ?? τ(v, network) ?? prior(v)
```

Network-wide τ accumulates evidence across all DAOs — collective learning.

### 7. Agent Configuration Q

Only agents (nodes) have configuration:

```
Q = { verified, active, resources }   ∈ [0,1]³
```

- verified: fraction of claimed work successfully completed
- active: fraction of time actively working vs idle
- resources: fraction of available capacity in use

Uniform across all agents. Environmental variety shapes the landscape they move through.

### 8. Mass m

Scope-specific inertia:

```
m(node, scope) = 1 + earnings(node, scope) × 0.001
```

Heavy agents (proven in this scope) move slowly, resist perturbation.
Light agents (new to this scope) move quickly, explore freely.

### 9. Velocity (Guidance Equation)

```
v(Q) = -∇G(Q) / m
```

Agents move down the G gradient, scaled by inverse mass.

### 10. Quantum Potential

```
U_quantum(Q) = -(ℏ²/2m) × ∇²A(Q) / A(Q) × τ_aggregate
```

- High τ_aggregate → strong quantum potential → deterministic paths
- Low τ_aggregate → weak quantum potential → wave spreads → exploration

This is the mechanism by which uncertainty drives exploration. Not a parameter — emerges from learned precision.

### 11. Temperature β

Adaptive, tied to aggregate precision:

```
β(scope) = β_base × τ_aggregate(scope)
```

- High τ → high β → sharp peaks → exploit
- Low τ → low β → flat landscape → explore

### 12. Evolution

Agent position evolves:

```
Q(t + dt) = Q(t) + v(Q) × dt
```

Clamped to [0,1]³.

---

## Part II: Token Economics

### 13. The Core Claim

```
$LOOP minted = variety resolved = value added
```

The token is a unit of account for verified work. Token supply equals cumulative resolved variety across the network's history.

### 14. Minting

On work completion:

```
mint_amount = ΔF × confidence × mint_rate

where:
  ΔF = F_before - F_after           (variety resolved)
  confidence = aggregate τ           (verification quality)
  mint_rate = base_rate × (F_network / F_initial)
```

F-weighted minting:
- High F_network → high mint rate → incentivizes work
- Low F_network → low mint rate → scarcity increases
- New DAOs add F → mint rate increases → incentivizes resolution

### 15. Token Value

```
Token value ∝ 1 / F_network
```

- High F = unrealized potential = weak token
- Low F = productive capacity = strong token

Markets continuously price this. The token IS a measure of network health.

### 16. Bounties

Work posted with bounty in $LOOP:

```
work:posted { bounty: { amount: 100, currency: 'LOOP' } }
```

This creates demand for tokens. Workers need $LOOP to see work. Posters need $LOOP to post.

### 17. The Flywheel

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   Revenue ──► Treasury ──► Bounties ──► Work            │
│      ▲                                    │             │
│      │                                    ▼             │
│   Products ◄── DAOs ◄── Verified ◄── Workers            │
│                           │                             │
│                           ▼                             │
│                     $LOOP minted                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

1. DAO posts bounty for work
2. Worker claims, executes, submits
3. Verification passes → worker receives bounty
4. Network mints $LOOP proportional to ΔF × confidence
5. Product improves → generates revenue
6. Revenue funds more bounties
7. Cycle continues

### 18. Supply Dynamics

```
supply(t) = Σ mint_amount(work) for all verified work

limit as t→∞: supply approaches asymptote as F_network approaches dynamic equilibrium
```

No hard cap. Supply grows with real verified work. But mint_rate decreases as F_network decreases, creating natural scarcity.

---

## Part III: Data Structures

### 19. Free Energy State

```typescript
interface FreeEnergyState {
  scope: Scope;
  perceived: number;
  resolved: number;
  F: number;
  H: number;              // epistemic uncertainty
  G: number;              // F + γH
  computedAt: number;
}
```

### 20. Precision Record

```typescript
interface PrecisionRecord {
  verifierType: string;
  scope: Scope;
  prior: number;
  empirical: number;
  samples: number;
  τ: number;
  updatedAt: number;
}
```

### 21. Prediction/Observation

```typescript
interface Prediction {
  id: string;
  workId: string;
  conditionId: string;
  verifierType: string;
  scope: Scope;
  predicted: number;
  predictedAt: number;
  
  // After observation
  actual?: number;
  error?: number;
  observedAt?: number;
}
```

### 22. Bohmian State (agents only)

```typescript
interface BohmianState {
  nodeId: string;
  
  // Configuration
  Q: { verified: number; active: number; resources: number };
  
  // Dynamics
  velocity: { verified: number; active: number; resources: number };
  mass: number;                    // scope-specific
  
  // Landscape (from environment)
  G: number;                       // expected free energy at Q
  gradG: Configuration;            // gradient
  quantumPotential: number;
  
  // Precision
  τ_aggregate: number;
  β: number;                       // adaptive temperature
  
  lastEvolved: number;
}
```

### 23. Mint Event

```typescript
interface MintEvent {
  workId: string;
  daoAddress: string;
  nodeId: string;
  
  // Variety
  F_before: number;
  F_after: number;
  ΔF: number;
  
  // Verification
  confidence: number;
  verifiers: string[];
  
  // Minting
  mint_rate: number;
  mint_amount: bigint;
  
  // Network state
  F_network_before: number;
  F_network_after: number;
  total_supply_after: bigint;
  
  timestamp: number;
}
```

### 24. Network State

```typescript
interface NetworkState {
  F_network: number;
  F_initial: number;               // at genesis, for mint_rate calc
  total_supply: bigint;
  active_daos: number;
  
  // Aggregate precision (network-wide learning)
  τ_network: Record<string, PrecisionRecord>;
  
  // Health metrics
  F_per_token: number;             // should trend toward zero
  resolution_rate: number;         // ΔF per unit time
  
  updatedAt: number;
}
```

---

## Part IV: Configuration

All tunable parameters in one place:

```typescript
interface DynamicsConfig {
  // Precision learning
  learning: {
    threshold: number;             // samples for full confidence (default: 20)
    weights: {
      automated: number;           // verification weight (default: 1.0)
      selfAssessment: number;      // post-merge check (default: 0.7)
      attestation: number;         // human attestation (default: 0.3)
    };
  };
  
  // Temperature
  β_base: number;                  // base inverse temperature (default: 1.0)
  
  // Exploration
  γ: number;                       // epistemic coefficient (default: 0.1)
  
  // Minting
  minting: {
    base_rate: number;             // tokens per variety bit (default: 1.0)
    min_confidence: number;        // threshold to mint (default: 0.5)
  };
  
  // Events
  events: {
    verbosity: 'minimal' | 'changes' | 'full';
    τ_change_threshold: number;    // emit on change > this (default: 0.05)
  };
  
  // Homeostat
  homeostat: {
    invoke_threshold: number;      // F above this triggers work (default: 0)
    perceive_threshold: number;    // F below this triggers scan (default: -10)
  };
}
```

All defaults. All overridable. System can learn optimal values over time.

---

## Part V: Event Types

### Minimal (default)

```typescript
type MinimalEvents =
  | 'precision:updated'            // τ changed significantly
  | 'action:selected'              // decision made
  | 'mint:executed';               // tokens minted
```

### Changes

```typescript
type ChangeEvents = MinimalEvents
  | 'free-energy:changed'          // F changed at scope
  | 'bohmian:evolved';             // agent moved
```

### Full (debugging)

```typescript
type FullEvents = ChangeEvents
  | 'precision:prediction'
  | 'precision:observation'
  | 'action:evaluated'
  | 'free-energy:computed';
```

---

## Part VI: Computation

### 25. Free Energy

```typescript
async function getFreeEnergy(scope: Scope): Promise<FreeEnergyState> {
  const F = await computeF(scope);
  const H = await computeH(scope);
  const G = F + config.γ * H;
  
  return { scope, perceived, resolved, F, H, G, computedAt: Date.now() };
}

async function computeF(scope: Scope): Promise<number> {
  switch (scope.level) {
    case 'condition':
      const cond = await getCondition(scope.id);
      return cond.met ? 0 : (cond.varietyWeight ?? 10);
      
    case 'work':
      const work = await getWork(scope.id);
      return sum(work.conditions.map(c => computeF({ level: 'condition', ...c })));
      
    case 'context':
      const items = await listWork({ contextId: scope.id, status: ['pending', 'active'] });
      return sum(items.map(w => computeF({ level: 'work', id: w.id, ...scope })));
      
    case 'dao':
      const contexts = await listContexts({ daoAddress: scope.address });
      return sum(contexts.map(c => computeF({ level: 'context', id: c.id, ...scope })));
      
    case 'network':
      const daos = await listDAOs();
      return sum(daos.map(d => computeF({ level: 'dao', address: d.address })));
  }
}

async function computeH(scope: Scope): Promise<number> {
  const verifiers = await getVerifiersInScope(scope);
  let H = 0;
  
  for (const v of verifiers) {
    const precision = await getPrecision(v.type, scope);
    const confidence = Math.min(precision.samples / config.learning.threshold, 1);
    const weight = v.varietyWeight ?? 10;
    H += (1 - confidence) * weight;
  }
  
  return H;
}
```

### 26. Precision Learning

```typescript
async function recordPrediction(
  workId: string,
  conditionId: string,
  verifierType: string,
  scope: Scope
): Promise<string> {
  const τ = await getPrecision(verifierType, scope);
  const predicted = τ.τ;
  
  const prediction: Prediction = {
    id: randomUUID(),
    workId, conditionId, verifierType, scope,
    predicted,
    predictedAt: Date.now(),
  };
  
  await store(prediction);
  
  if (config.events.verbosity === 'full') {
    await emit('precision:prediction', prediction);
  }
  
  return prediction.id;
}

async function recordObservation(predictionId: string, actual: number): Promise<void> {
  const prediction = await getPrediction(predictionId);
  const error = Math.abs(prediction.predicted - actual);
  
  prediction.actual = actual;
  prediction.error = error;
  prediction.observedAt = Date.now();
  await store(prediction);
  
  // Update precision at all relevant scopes (bubbles up)
  await updatePrecisionChain(prediction.verifierType, prediction.scope, actual);
}

async function updatePrecisionChain(
  verifierType: string,
  scope: Scope,
  outcome: number
): Promise<void> {
  let current: Scope | null = scope;
  
  while (current) {
    await updatePrecision(verifierType, current, outcome);
    current = getParentScope(current);
  }
}

async function updatePrecision(
  verifierType: string,
  scope: Scope,
  outcome: number
): Promise<void> {
  const record = await loadPrecision(verifierType, scope) ?? {
    verifierType,
    scope,
    prior: VERIFIER_REGISTRY[verifierType]?.maxConfidence ?? 0.5,
    empirical: 0.5,
    samples: 0,
    τ: 0.5,
    updatedAt: Date.now(),
  };
  
  const n = record.samples + 1;
  const newEmpirical = record.empirical + (outcome - record.empirical) / n;
  const w = Math.min(n / config.learning.threshold, 1);
  const newτ = record.prior * (1 - w) + newEmpirical * w;
  
  const Δτ = Math.abs(newτ - record.τ);
  
  record.empirical = newEmpirical;
  record.samples = n;
  record.τ = newτ;
  record.updatedAt = Date.now();
  
  await savePrecision(record);
  
  if (Δτ > config.events.τ_change_threshold) {
    await emit('precision:updated', { verifierType, scope, oldτ: record.τ - Δτ, newτ, samples: n });
  }
}
```

### 27. Wave Function

```typescript
async function buildWaveFunction(
  nodeId: string,
  environmentScope: Scope
): Promise<WaveFunction> {
  const mass = await getMass(nodeId, environmentScope);
  const τ_aggregate = await getAggregatePrecision(environmentScope);
  const β = config.β_base * τ_aggregate;
  
  // Sample G landscape
  const landscape = await sampleGLandscape(environmentScope);
  
  return {
    amplitude: (Q) => Math.exp(-β * interpolateG(landscape, Q)),
    
    velocity: (Q) => {
      const gradG = gradientG(landscape, Q);
      return scale(gradG, -1 / mass);
    },
    
    potential: (Q) => {
      const A = Math.exp(-β * interpolateG(landscape, Q));
      if (A < 1e-10) return 0;
      const laplacianA = laplacianAmplitude(landscape, Q, β);
      return -τ_aggregate * laplacianA / (2 * mass * A);
    },
  };
}
```

### 28. Action Selection

```typescript
interface Action {
  type: 'claim-work' | 'invoke-perception' | 'verify-condition' | 'execute';
  target: string;
  scope: Scope;
}

async function selectAction(
  nodeId: string,
  candidates: Action[]
): Promise<Action | null> {
  if (candidates.length === 0) return null;
  
  const evaluations = await Promise.all(
    candidates.map(a => evaluateAction(nodeId, a))
  );
  
  // Minimize G
  evaluations.sort((a, b) => a.G - b.G);
  const selected = evaluations[0];
  
  await emit('action:selected', {
    nodeId,
    action: selected.action,
    G: selected.G,
    alternatives: candidates.length,
  });
  
  return selected.action;
}

async function evaluateAction(nodeId: string, action: Action): Promise<ActionEvaluation> {
  const currentG = await getG(action.scope);
  const expectedG = await estimatePostActionG(action);
  
  return {
    action,
    currentG,
    expectedG,
    G: expectedG,  // we select minimum expected G
    pragmatic: currentG.F - expectedG.F,
    epistemic: currentG.H - expectedG.H,
  };
}
```

### 29. Evolution

```typescript
async function evolveAgent(nodeId: string, dt: number): Promise<BohmianState> {
  const state = await getBohmianState(nodeId);
  const scope = await getAgentEnvironmentScope(nodeId);
  
  const Q = state.Q;
  const wave = await buildWaveFunction(nodeId, scope);
  const velocity = wave.velocity(Q);
  
  const newQ = {
    verified: clamp(Q.verified + velocity.verified * dt, 0, 1),
    active: clamp(Q.active + velocity.active * dt, 0, 1),
    resources: clamp(Q.resources + velocity.resources * dt, 0, 1),
  };
  
  const G = await getG(scope);
  const τ_aggregate = await getAggregatePrecision(scope);
  
  const newState: BohmianState = {
    nodeId,
    Q: newQ,
    velocity,
    mass: await getMass(nodeId, scope),
    G: G.G,
    gradG: gradientG(await sampleGLandscape(scope), newQ),
    quantumPotential: wave.potential(newQ),
    τ_aggregate,
    β: config.β_base * τ_aggregate,
    lastEvolved: Date.now(),
  };
  
  await saveBohmianState(newState);
  
  if (config.events.verbosity !== 'minimal') {
    await emit('bohmian:evolved', { nodeId, Q: newQ, velocity });
  }
  
  return newState;
}
```

### 30. Minting

```typescript
async function mintOnCompletion(workId: string, nodeId: string): Promise<MintEvent> {
  const work = await getWork(workId);
  const scope: Scope = { level: 'work', id: workId, contextId: work.contextId, daoAddress: work.daoAddress };
  
  // Compute ΔF
  const F_before = work.conditions.reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);
  const F_after = work.conditions.filter(c => !c.met).reduce((sum, c) => sum + (c.varietyWeight ?? 10), 0);
  const ΔF = F_before - F_after;
  
  // Get confidence from aggregate precision
  const confidence = await getAggregateConfidence(work.conditions, scope);
  
  if (confidence < config.minting.min_confidence) {
    throw new Error(`Confidence ${confidence} below threshold ${config.minting.min_confidence}`);
  }
  
  // Get network state for mint rate
  const network = await getNetworkState();
  const mint_rate = config.minting.base_rate * (network.F_network / network.F_initial);
  
  // Calculate mint amount
  const mint_amount = BigInt(Math.floor(ΔF * confidence * mint_rate * 1e18));
  
  // Update network state
  const F_network_after = network.F_network - ΔF;
  const total_supply_after = network.total_supply + mint_amount;
  
  const event: MintEvent = {
    workId,
    daoAddress: work.daoAddress,
    nodeId,
    F_before,
    F_after,
    ΔF,
    confidence,
    verifiers: work.conditions.map(c => c.verifier),
    mint_rate,
    mint_amount,
    F_network_before: network.F_network,
    F_network_after,
    total_supply_after,
    timestamp: Date.now(),
  };
  
  await emit('mint:executed', event);
  await updateNetworkState({ F_network: F_network_after, total_supply: total_supply_after });
  
  return event;
}
```

---

## Part VII: Integration

### 31. Homeostat (updated)

```typescript
async function runHomeostat(): Promise<HomeostatResult> {
  const network = await getNetworkState();
  const F = network.F_network;
  
  if (F > config.homeostat.invoke_threshold) {
    // Select work using G minimization
    const candidates = await getCandidateClaimActions();
    const action = await selectAction('homeostat', candidates);
    
    if (action) {
      await executeAction(action);
      return { state: 'invoked', F, action };
    }
  }
  
  if (F < config.homeostat.perceive_threshold) {
    const candidates = await getCandidatePerceptionActions();
    const action = await selectAction('homeostat', candidates);
    
    if (action) {
      await executeAction(action);
      return { state: 'perceived', F, action };
    }
  }
  
  return { state: 'equilibrium', F };
}
```

### 32. Verification Runner (updated)

```typescript
async function runVerification(workId: string): Promise<VerifierResult[]> {
  const work = await getWork(workId);
  const scope: Scope = { level: 'work', id: workId, contextId: work.contextId };
  
  const results: VerifierResult[] = [];
  
  for (const condition of work.conditions) {
    const { fn } = parseVerifier(condition.verifier);
    
    // Record prediction
    const predictionId = await recordPrediction(workId, condition.id, fn, scope);
    
    // Run verification
    const verifier = getVerifier(fn);
    const result = await verifier(condition, context);
    results.push(result);
    
    // Record observation
    await recordObservation(predictionId, result.passed ? 1.0 : 0.0);
  }
  
  // Aggregate with precision weighting
  const confidence = await aggregateWithPrecision(results, scope);
  const allPassed = results.every(r => r.passed);
  
  await verifyWork(workId, allPassed, confidence);
  
  // Mint if passed
  if (allPassed && work.claim?.nodeId) {
    await mintOnCompletion(workId, work.claim.nodeId);
  }
  
  return results;
}

async function aggregateWithPrecision(results: VerifierResult[], scope: Scope): Promise<number> {
  let uncertainty = 1.0;
  
  for (const result of results) {
    const { fn } = parseVerifier(result.verifier);
    const precision = await getPrecision(fn, scope);
    const weighted = result.confidence * precision.τ;
    uncertainty *= (1 - weighted);
  }
  
  return 1 - uncertainty;
}
```

---

## Part VIII: Invariants

1. **F aggregation**: F(parent) = Σ F(children) at every level

2. **Bounds**: 0 ≤ τ ≤ 1, 0 ≤ Q.* ≤ 1, F ≥ 0 for unresolved, supply ≥ 0

3. **Conservation**: variety:in events have matching potential variety:out

4. **Monotonic precision**: τ variance decreases with √samples

5. **Guidance**: velocity · ∇G ≤ 0 (always moves toward lower G)

6. **Mint integrity**: mint_amount = ΔF × confidence × mint_rate exactly

7. **Token accounting**: total_supply = Σ mint_amount for all mints

---

## Part IX: Implementation Order

### Phase 1: Core Computation (Week 1)
- [ ] Scoped F computation (`getFreeEnergy`)
- [ ] H computation (`computeH`)
- [ ] G = F + γH
- [ ] Config structure with defaults

### Phase 2: Precision Learning (Week 1-2)
- [ ] Prediction/observation recording
- [ ] τ update with scope inheritance
- [ ] Network-wide τ aggregation
- [ ] Wire into verification runner

### Phase 3: Wave Function (Week 2)
- [ ] Build ψ from G landscape
- [ ] Adaptive β = β_base × τ_aggregate
- [ ] Quantum potential with τ weighting
- [ ] Agent evolution using new wave

### Phase 4: Action Selection (Week 2-3)
- [ ] G-based action evaluation
- [ ] Replace bounty-only selection
- [ ] Epistemic value in exploration

### Phase 5: Token Economics (Week 3)
- [ ] Mint rate from F_network / F_initial
- [ ] Mint on work completion
- [ ] Network state tracking
- [ ] Events for mint transparency

### Phase 6: Network Layer (Week 4+)
- [ ] DAO scope type
- [ ] Cross-DAO F aggregation
- [ ] Network-wide τ sharing
- [ ] On-chain state sync

---

## Part X: Validation

To verify correctness:

1. **F aggregates**: `F(network) = Σ F(dao)` — sum manually and compare

2. **τ converges**: After 50 samples, |τ - true_rate| < 0.1

3. **G selects better**: Given known success rates, G picks higher EV than bounty-only

4. **Velocity downhill**: Sample random Q, verify v · ∇G < 0

5. **Mint rate scales**: When F_network halves, mint_rate halves

6. **Token value correlation**: Plot token price vs 1/F_network over time

---

## Appendix: Key Equations Summary

```
F(S) = Σ variety:in(S) - Σ variety:out(S)

H(S) = Σ (1 - confidence(τ)) × weight

G(S) = F(S) + γ × H(S)

ψ(Q) = exp(-β × G(Q))

τ(v,S) = prior × (1-w) + empirical × w,  w = samples/threshold

β(S) = β_base × τ_aggregate(S)

v(Q) = -∇G(Q) / m

m(node, S) = 1 + earnings(node, S) × 0.001

mint = ΔF × confidence × base_rate × (F_network / F_initial)

Token value ∝ 1 / F_network
```

Eleven equations. Scale-free. Bohmian dynamics on free energy landscape. Token as unit of resolved variety.
