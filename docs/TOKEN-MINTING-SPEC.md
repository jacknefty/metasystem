# Token Minting Specification

## Overview

Proof-of-Verification minting. Work IS the proof. τ determines verification strategy. Anyone can challenge by re-running.

---

## 1. Core Flow

```
work:submitted
     │
     ▼
┌─────────────────────────────────────┐
│  Strategy Selection (from τ)        │
│                                     │
│  τ ≥ 0.99  → single, replayable     │
│  τ ≥ 0.90  → single, challengeable  │
│  τ ≥ 0.80  → 2 verifiers            │
│  τ < 0.80  → 3+ verifiers           │
└─────────────────────────────────────┘
     │
     ▼
verification executes (1-N verifiers)
     │
     ▼
work:verified { proof, strategy }
     │
     ▼
credit:earned → append to merkle tree
     │
     ▼
[user triggers /mint when ready]
     │
     ▼
generate proofs → sign root → submit tx
     │
     ▼
contract: verify merkle → verify work proof → mint
```

---

## 2. Verification Strategy

```typescript
// src/control/verify/strategy.ts

type StrategyType = 'single' | 'optimistic' | 'consensus';

interface VerificationStrategy {
  type: StrategyType;
  verifierCount: number;
  challengeable: boolean;
  challengeWindow?: number;  // seconds
  replayable: boolean;
}

function getStrategy(verifier: string, scope: Scope): VerificationStrategy {
  const τ = getPrecision(verifier, scope);
  
  if (τ >= 0.99) {
    return {
      type: 'single',
      verifierCount: 1,
      challengeable: false,
      replayable: true,
    };
  }
  
  if (τ >= 0.90) {
    return {
      type: 'optimistic',
      verifierCount: 1,
      challengeable: true,
      challengeWindow: 3600,  // 1 hour
      replayable: true,
    };
  }
  
  // Lower precision = more verifiers needed
  const n = τ >= 0.80 ? 2 : Math.ceil(3 / τ);
  
  return {
    type: 'consensus',
    verifierCount: Math.min(n, 7),  // cap at 7
    challengeable: true,
    challengeWindow: 3600,
    replayable: τ >= 0.70,
  };
}
```

---

## 3. Work Proof Structure

```typescript
// src/token/proof.ts

interface ConditionProof {
  conditionId: string;
  verifier: string;
  
  // Environment
  commitHash: string;
  containerHash?: string;      // pinned environment, if used
  
  // Execution
  command: string;
  exitCode: number;
  outputHash: string;          // hash of stdout+stderr
  executedAt: number;
  
  // Strategy used
  strategy: StrategyType;
  verifierNodes?: string[];    // if consensus
  consensusResults?: boolean[];
}

interface WorkProof {
  workId: string;
  nodeId: string;              // who did the work
  
  // Variety resolved
  ΔF: number;
  confidence: number;
  
  // Conditions
  conditions: ConditionProof[];
  
  // Aggregate
  allPassed: boolean;
  aggregateConfidence: number;
  
  // Proof hash (deterministic)
  proofHash: string;           // hash(workId + commitHash + all outputHashes)
}

function hashWorkProof(proof: WorkProof): string {
  const data = [
    proof.workId,
    proof.nodeId,
    proof.ΔF.toString(),
    ...proof.conditions.map(c => 
      `${c.conditionId}:${c.commitHash}:${c.outputHash}:${c.exitCode}`
    ),
  ].join('|');
  
  return keccak256(data);
}
```

---

## 4. Credit Structure

```typescript
// src/token/credits.ts

interface Credit {
  id: string;
  workId: string;
  nodeId: string;
  daoAddress?: string;
  
  // Amount
  ΔF: number;
  confidence: number;
  mintRate: number;
  amount: bigint;              // ΔF × confidence × mintRate × 1e18
  
  // Proof
  workProof: WorkProof;
  proofHash: string;
  
  // State
  earnedAt: number;
  challengeableUntil?: number;
  challenged: boolean;
  mintedAt?: number;
  txHash?: string;
}
```

---

## 5. Incremental Merkle Tree

```typescript
// src/token/tree.ts

class CreditMerkleTree {
  private leaves: Map<string, { hash: string; index: number }> = new Map();
  private tree: string[][] = [[]];
  
  append(credit: Credit): number {
    const leaf = this.hashLeaf(credit);
    const index = this.tree[0].length;
    
    this.tree[0].push(leaf);
    this.leaves.set(credit.id, { hash: leaf, index });
    this.rebuildPath(index);
    
    return index;
  }
  
  hashLeaf(credit: Credit): string {
    return keccak256(encode([
      credit.workId,
      credit.nodeId,
      credit.amount,
      credit.proofHash,
      credit.earnedAt,
    ]));
  }
  
  get root(): string {
    const levels = this.tree.length;
    return this.tree[levels - 1][0] ?? EMPTY_ROOT;
  }
  
  getProof(creditId: string): MerkleProof {
    const entry = this.leaves.get(creditId);
    if (!entry) throw new Error('Credit not in tree');
    
    const path: string[] = [];
    let index = entry.index;
    
    for (let level = 0; level < this.tree.length - 1; level++) {
      const isRight = index % 2 === 1;
      const siblingIndex = isRight ? index - 1 : index + 1;
      
      if (siblingIndex < this.tree[level].length) {
        path.push(this.tree[level][siblingIndex]);
      } else {
        path.push(EMPTY_NODE);
      }
      
      index = Math.floor(index / 2);
    }
    
    return {
      leaf: entry.hash,
      index: entry.index,
      path,
    };
  }
  
  private rebuildPath(index: number): void {
    let currentIndex = index;
    
    for (let level = 0; level < this.tree.length; level++) {
      const pairIndex = currentIndex - (currentIndex % 2);
      const left = this.tree[level][pairIndex] ?? EMPTY_NODE;
      const right = this.tree[level][pairIndex + 1] ?? EMPTY_NODE;
      const parent = keccak256(left + right);
      
      const parentIndex = Math.floor(currentIndex / 2);
      
      if (!this.tree[level + 1]) {
        this.tree[level + 1] = [];
      }
      this.tree[level + 1][parentIndex] = parent;
      
      currentIndex = parentIndex;
    }
  }
}
```

---

## 6. Event Handlers

```typescript
// src/token/events.ts

const creditTree = new CreditMerkleTree();

// Verification complete → earn credit
chain.on('work:verified', async (event) => {
  const { workId, passed, confidence, proof } = event.payload;
  if (!passed) return;
  
  const work = await getWork(workId);
  const network = await getNetworkState();
  
  const ΔF = computeΔF(work);
  const mintRate = config.minting.base_rate * (network.F_network / network.F_initial);
  const amount = BigInt(Math.floor(ΔF * confidence * mintRate * 1e18));
  
  const credit: Credit = {
    id: randomUUID(),
    workId,
    nodeId: work.claim.nodeId,
    daoAddress: work.daoAddress,
    ΔF,
    confidence,
    mintRate,
    amount,
    workProof: proof,
    proofHash: hashWorkProof(proof),
    earnedAt: Date.now(),
    challengeableUntil: proof.strategy === 'optimistic' 
      ? Date.now() + config.challengeWindow * 1000 
      : undefined,
    challenged: false,
  };
  
  await saveCredit(credit);
  creditTree.append(credit);
  
  await emit('credit:earned', {
    creditId: credit.id,
    workId,
    nodeId: credit.nodeId,
    amount: credit.amount.toString(),
    proofHash: credit.proofHash,
  });
});
```

---

## 7. Challenge System

```typescript
// src/token/challenge.ts

interface ChallengeResult {
  creditId: string;
  valid: boolean;
  replayedAt: number;
  
  // If invalid
  discrepancy?: {
    conditionId: string;
    expected: { exitCode: number; outputHash: string };
    actual: { exitCode: number; outputHash: string };
  };
}

async function challengeCredit(creditId: string): Promise<ChallengeResult> {
  const credit = await getCredit(creditId);
  if (!credit) throw new Error('Credit not found');
  
  if (credit.mintedAt) throw new Error('Already minted');
  if (!credit.challengeableUntil) throw new Error('Not challengeable');
  if (Date.now() > credit.challengeableUntil) throw new Error('Challenge window closed');
  
  const proof = credit.workProof;
  
  for (const cond of proof.conditions) {
    if (!cond.replayable) continue;
    
    // Checkout exact commit
    await checkout(cond.commitHash);
    
    // Run in same environment if pinned
    const result = cond.containerHash
      ? await runInContainer(cond.containerHash, cond.command)
      : await run(cond.command);
    
    const actualOutputHash = hash(result.output);
    
    // Check pass/fail matches (not exact output)
    const expectedPass = cond.exitCode === 0;
    const actualPass = result.exitCode === 0;
    
    if (expectedPass !== actualPass) {
      await markCreditInvalid(creditId);
      await emit('credit:challenged', {
        creditId,
        valid: false,
        conditionId: cond.conditionId,
      });
      
      return {
        creditId,
        valid: false,
        replayedAt: Date.now(),
        discrepancy: {
          conditionId: cond.conditionId,
          expected: { exitCode: cond.exitCode, outputHash: cond.outputHash },
          actual: { exitCode: result.exitCode, outputHash: actualOutputHash },
        },
      };
    }
  }
  
  return { creditId, valid: true, replayedAt: Date.now() };
}
```

---

## 8. Mint Preparation

```typescript
// src/token/mint.ts

interface MintBundle {
  // Root (signed by operator)
  root: string;
  rootSignature: string;
  
  // Credits to mint
  credits: Array<{
    credit: Credit;
    merkleProof: MerkleProof;
  }>;
  
  // Totals
  totalAmount: bigint;
  creditCount: number;
}

async function prepareMint(nodeId: string): Promise<MintBundle> {
  const pending = await getPendingCredits(nodeId);
  
  // Filter out challenged and not-yet-safe
  const mintable = pending.filter(c => 
    !c.mintedAt && 
    !c.challenged &&
    (!c.challengeableUntil || Date.now() > c.challengeableUntil)
  );
  
  if (mintable.length === 0) {
    throw new Error('No credits ready to mint');
  }
  
  const root = creditTree.root;
  const rootSignature = await signRoot(root);
  
  const credits = mintable.map(credit => ({
    credit,
    merkleProof: creditTree.getProof(credit.id),
  }));
  
  const totalAmount = credits.reduce((sum, c) => sum + c.credit.amount, 0n);
  
  return {
    root,
    rootSignature,
    credits,
    totalAmount,
    creditCount: credits.length,
  };
}
```

---

## 9. Smart Contract

```solidity
// contracts/LOOPToken.sol

contract LOOPToken is ERC20 {
  mapping(bytes32 => uint256) public roots;      // root => timestamp
  mapping(bytes32 => bool) public claimed;       // leaf => minted
  
  address public operator;
  
  event RootCommitted(bytes32 indexed root, uint256 timestamp);
  event CreditMinted(address indexed to, uint256 amount, bytes32 leaf);
  
  function mint(
    bytes32 root,
    bytes calldata rootSig,
    CreditProof[] calldata proofs
  ) external {
    // Verify and store root if new
    if (roots[root] == 0) {
      require(verifySignature(root, rootSig, operator), "Invalid root signature");
      roots[root] = block.timestamp;
      emit RootCommitted(root, block.timestamp);
    }
    
    uint256 totalAmount = 0;
    
    for (uint i = 0; i < proofs.length; i++) {
      CreditProof memory p = proofs[i];
      
      require(!claimed[p.leaf], "Already claimed");
      require(verifyMerkle(p.leaf, p.path, p.index, root), "Invalid merkle proof");
      
      claimed[p.leaf] = true;
      totalAmount += p.amount;
      
      emit CreditMinted(msg.sender, p.amount, p.leaf);
    }
    
    _mint(msg.sender, totalAmount);
  }
  
  function verifyMerkle(
    bytes32 leaf,
    bytes32[] memory path,
    uint256 index,
    bytes32 root
  ) internal pure returns (bool) {
    bytes32 current = leaf;
    
    for (uint i = 0; i < path.length; i++) {
      if (index % 2 == 0) {
        current = keccak256(abi.encodePacked(current, path[i]));
      } else {
        current = keccak256(abi.encodePacked(path[i], current));
      }
      index = index / 2;
    }
    
    return current == root;
  }
}
```

---

## 10. On-Chain Challenge (Optional)

For high-value credits, challenge can be on-chain:

```solidity
// contracts/ChallengeRegistry.sol

contract ChallengeRegistry {
  struct Challenge {
    bytes32 creditLeaf;
    address challenger;
    uint256 stake;
    uint256 deadline;
    bool resolved;
    bool valid;
  }
  
  mapping(bytes32 => Challenge) public challenges;
  
  function challenge(bytes32 creditLeaf) external payable {
    require(msg.value >= MIN_STAKE, "Insufficient stake");
    require(challenges[creditLeaf].challenger == address(0), "Already challenged");
    
    challenges[creditLeaf] = Challenge({
      creditLeaf: creditLeaf,
      challenger: msg.sender,
      stake: msg.value,
      deadline: block.timestamp + CHALLENGE_PERIOD,
      resolved: false,
      valid: true  // assumed valid until proven otherwise
    });
  }
  
  function resolveChallenge(
    bytes32 creditLeaf,
    bool isValid,
    bytes calldata proof  // off-chain verification result, signed by N verifiers
  ) external {
    Challenge storage c = challenges[creditLeaf];
    require(!c.resolved, "Already resolved");
    require(block.timestamp < c.deadline, "Challenge expired");
    
    // Verify proof from verifier committee
    require(verifyCommitteeSignature(creditLeaf, isValid, proof), "Invalid proof");
    
    c.resolved = true;
    c.valid = isValid;
    
    if (!isValid) {
      // Credit is fraudulent — reward challenger
      payable(c.challenger).transfer(c.stake + FRAUD_REWARD);
    } else {
      // Challenge failed — stake forfeited
      // Stake goes to credit owner or burned
    }
  }
}
```

---

## 11. API Endpoints

```typescript
// src/api/token.ts

// Get pending credits for a node
GET /api/credits/:nodeId
Response: {
  credits: Credit[];
  totalPending: string;      // bigint as string
  mintableNow: string;       // after challenge windows
  challengeable: Credit[];
}

// Prepare mint transaction
POST /api/mint/prepare
Body: { nodeId: string }
Response: {
  bundle: MintBundle;
  transaction: {
    to: string;              // contract address
    data: string;            // encoded calldata
    estimatedGas: number;
  };
}

// Challenge a credit (any node can call)
POST /api/credits/:creditId/challenge
Response: {
  result: ChallengeResult;
}

// Get tree state
GET /api/tree/state
Response: {
  root: string;
  leafCount: number;
  lastUpdated: number;
}
```

---

## 12. Integration with Verification Runner

```typescript
// src/control/verify/runner.ts (updated)

async function runVerification(workId: string): Promise<VerifierResult[]> {
  const work = await getWork(workId);
  const scope: Scope = { level: 'work', id: workId, contextId: work.contextId };
  
  const results: VerifierResult[] = [];
  const conditionProofs: ConditionProof[] = [];
  
  const commitHash = await getCurrentCommit(work.contextPath);
  
  for (const condition of work.conditions) {
    const { fn } = parseVerifier(condition.verifier);
    
    // Get τ-based strategy
    const strategy = getStrategy(condition.verifier, scope);
    
    // Record prediction
    const predictionId = await recordPrediction(workId, condition.id, fn, scope);
    
    // Execute based on strategy
    let result: VerifierResult;
    let consensusResults: boolean[] | undefined;
    let verifierNodes: string[] | undefined;
    
    if (strategy.type === 'consensus') {
      const nodes = await selectVerifierNodes(strategy.verifierCount);
      verifierNodes = nodes.map(n => n.id);
      
      const nodeResults = await Promise.all(
        nodes.map(node => executeVerificationOnNode(node, condition, work))
      );
      
      consensusResults = nodeResults.map(r => r.passed);
      const passCount = consensusResults.filter(Boolean).length;
      const passed = passCount >= Math.ceil(strategy.verifierCount / 2);
      
      result = {
        passed,
        confidence: passCount / strategy.verifierCount,
        evidence: `Consensus: ${passCount}/${strategy.verifierCount} passed`,
        conditionId: condition.id,
      };
    } else {
      const verifier = getVerifier(fn);
      result = await verifier(condition, context);
    }
    
    results.push(result);
    
    // Record observation
    await recordObservation(predictionId, result.passed ? 1.0 : 0.0);
    
    // Build condition proof
    conditionProofs.push({
      conditionId: condition.id,
      verifier: condition.verifier,
      commitHash,
      command: extractCommand(condition.verifier),
      exitCode: result.passed ? 0 : 1,
      outputHash: hash(result.evidence),
      executedAt: Date.now(),
      strategy: strategy.type,
      verifierNodes,
      consensusResults,
    });
  }
  
  const allPassed = results.every(r => r.passed);
  const aggregateConfidence = await aggregateWithPrecision(results, scope);
  
  // Build work proof
  const workProof: WorkProof = {
    workId,
    nodeId: work.claim.nodeId,
    ΔF: computeΔF(work),
    confidence: aggregateConfidence,
    conditions: conditionProofs,
    allPassed,
    aggregateConfidence,
    proofHash: '',  // computed below
  };
  workProof.proofHash = hashWorkProof(workProof);
  
  // Emit with proof attached
  await verifyWork(workId, allPassed, aggregateConfidence, workProof);
  
  return results;
}
```

---

## 13. Configuration Additions

```typescript
// Add to DynamicsConfig

interface MintingConfig {
  base_rate: number;              // tokens per variety bit (default: 1.0)
  min_confidence: number;         // threshold to earn credit (default: 0.5)
  
  challenge: {
    window: number;               // seconds (default: 3600)
    enabled: boolean;             // enable challenge system (default: true)
  };
  
  consensus: {
    maxVerifiers: number;         // cap verifier count (default: 7)
    minPrecisionForSingle: number; // τ threshold for single verification (default: 0.99)
    minPrecisionForOptimistic: number; // τ threshold for optimistic (default: 0.90)
  };
  
  tree: {
    persistPath: string;          // where to save tree state
    persistInterval: number;      // ms between saves (default: 60000)
  };
}
```

---

## 14. Implementation Order

### Week 1: Core Structures
- [ ] VerificationStrategy from τ
- [ ] WorkProof and ConditionProof types
- [ ] Credit type with proof attachment
- [ ] IncrementalMerkleTree

### Week 2: Integration
- [ ] Update verification runner to build proofs
- [ ] Event handlers for credit:earned
- [ ] Challenge system (local)
- [ ] prepareMint function

### Week 3: Contract + API
- [ ] LOOPToken contract
- [ ] API endpoints
- [ ] Root signing
- [ ] Integration tests

### Week 4: Hardening
- [ ] Tree persistence
- [ ] Recovery from crashes
- [ ] Consensus verification (multi-node)
- [ ] On-chain challenge (optional)
