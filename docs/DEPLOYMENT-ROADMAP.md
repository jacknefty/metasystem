# Deployment Roadmap

## Overview

Four phases to go from local implementation to live token on mainnet. Each phase is independently valuable — the system works at each stage.

---

## Phase 1: First DAO Registration

**Goal:** MetaSystem itself becomes the first DAO. Work on the system earns credits in the system.

### 1.1 DAO Registry

```typescript
// src/network/registry.ts

interface DAORegistration {
  address: string;          // 'local:metasystem' until on-chain
  name: string;
  contextPath: string;
  identity: {
    purpose: string;
    scope: string[];
  };
  registeredAt: number;
  F_initial?: number;       // Set on first work
}

const registry = new Map<string, DAORegistration>();

async function registerDAO(dao: DAORegistration): Promise<void> {
  registry.set(dao.address, dao);
  
  await emit('dao:registered', {
    address: dao.address,
    name: dao.name,
    contextPath: dao.contextPath,
  });
}

async function listDAOs(): Promise<DAORegistration[]> {
  return Array.from(registry.values());
}

async function getDAO(address: string): Promise<DAORegistration | null> {
  return registry.get(address) ?? null;
}
```

### 1.2 MetaSystem Self-Registration

```typescript
// On startup or via CLI

await registerDAO({
  address: 'local:metasystem',
  name: 'MetaSystem',
  contextPath: '/Users/lionsmane/Desktop/MetaSystem',
  identity: {
    purpose: 'Build the viable system infrastructure',
    scope: ['**'],
  },
  registeredAt: Date.now(),
});
```

### 1.3 Wire DAO into Existing Flows

Update work creation to include daoAddress:

```typescript
// src/coordination/resources/work.ts

interface CreateWorkInput {
  // ... existing fields
  daoAddress?: string;  // defaults to first registered DAO
}

async function createWork(input: CreateWorkInput): Promise<Work> {
  const daoAddress = input.daoAddress ?? (await listDAOs())[0]?.address;
  // ...
}
```

### 1.4 API Endpoints

```typescript
// src/api/network.ts

// Register a new DAO
POST /api/network/dao
Body: { name, contextPath, purpose, scope }
Response: { address, registeredAt }

// List registered DAOs
GET /api/network/daos
Response: { daos: DAORegistration[] }

// Get DAO details
GET /api/network/dao/:address
Response: DAORegistration

// Get DAO's F (free energy)
GET /api/network/dao/:address/F
Response: { F, workCount, contexts }
```

### 1.5 Deliverables

- [ ] DAO registry with CRUD
- [ ] MetaSystem auto-registered on startup
- [ ] Work creation includes daoAddress
- [ ] API endpoints for DAO management
- [ ] F computation per DAO

---

## Phase 2: Credit Backfill (Optional)

**Goal:** Retroactively credit work already done. Symbolic — establishes that past work has value.

### 2.1 Parse Git History

```typescript
// src/network/backfill.ts

interface HistoricalWork {
  commitHash: string;
  message: string;
  author: string;
  timestamp: number;
  filesChanged: string[];
  insertions: number;
  deletions: number;
}

async function parseGitHistory(contextPath: string, since?: Date): Promise<HistoricalWork[]> {
  const log = execSync(
    `git log --since="${since?.toISOString() ?? '2024-01-01'}" --numstat --format="%H|%s|%an|%at"`,
    { cwd: contextPath, encoding: 'utf-8' }
  );
  
  // Parse into HistoricalWork[]
}
```

### 2.2 Estimate Variety per Commit

Simple heuristic — can be refined:

```typescript
function estimateVariety(work: HistoricalWork): number {
  const lineWeight = 0.1;
  const fileWeight = 2;
  
  const lines = work.insertions + work.deletions;
  const files = work.filesChanged.length;
  
  // Cap at reasonable max
  return Math.min(lines * lineWeight + files * fileWeight, 50);
}
```

### 2.3 Create Backfill Credits

```typescript
async function backfillCredits(daoAddress: string): Promise<Credit[]> {
  const dao = await getDAO(daoAddress);
  const history = await parseGitHistory(dao.contextPath);
  
  const credits: Credit[] = [];
  
  for (const work of history) {
    const ΔF = estimateVariety(work);
    const confidence = 0.5;  // Lower confidence for historical
    const mintRate = config.minting.base_rate;
    
    const credit: Credit = {
      id: `backfill_${work.commitHash.slice(0, 8)}`,
      workId: `historical:${work.commitHash}`,
      nodeId: 'historical',
      daoAddress,
      ΔF,
      confidence,
      mintRate,
      amount: BigInt(Math.floor(ΔF * confidence * mintRate * 1e18)),
      workProof: {
        workId: `historical:${work.commitHash}`,
        nodeId: 'historical',
        ΔF,
        confidence,
        conditions: [{
          conditionId: 'commit',
          verifier: 'exists:commit',
          commitHash: work.commitHash,
          command: 'git show',
          exitCode: 0,
          outputHash: hash(work.message),
          executedAt: work.timestamp * 1000,
          strategy: 'single',
        }],
        allPassed: true,
        aggregateConfidence: confidence,
        proofHash: hash(work.commitHash),
      },
      proofHash: hash(work.commitHash),
      earnedAt: work.timestamp * 1000,
      challenged: false,
    };
    
    credits.push(credit);
    creditTree.append(credit);
  }
  
  return credits;
}
```

### 2.4 CLI Command

```bash
metasystem backfill --dao local:metasystem --since 2024-01-01
```

### 2.5 Deliverables

- [ ] Git history parser
- [ ] Variety estimation heuristic
- [ ] Backfill credit creation
- [ ] CLI command
- [ ] Append to merkle tree

---

## Phase 3: Contract Deployment

**Goal:** Deploy LOOPToken to testnet, then mainnet. Enable real minting.

### 3.1 Contract Code

```solidity
// contracts/LOOPToken.sol

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract LOOPToken is ERC20, Ownable {
    mapping(bytes32 => uint256) public roots;
    mapping(bytes32 => bool) public claimed;
    
    event RootCommitted(bytes32 indexed root, uint256 timestamp);
    event CreditMinted(address indexed to, uint256 amount, bytes32 indexed leaf);
    
    constructor() ERC20("LOOP", "LOOP") Ownable(msg.sender) {}
    
    function commitRoot(bytes32 root) external onlyOwner {
        require(roots[root] == 0, "Root exists");
        roots[root] = block.timestamp;
        emit RootCommitted(root, block.timestamp);
    }
    
    function mint(
        bytes32 root,
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 index,
        uint256 amount
    ) external {
        require(roots[root] != 0, "Unknown root");
        require(!claimed[leaf], "Already claimed");
        require(verifyProof(leaf, proof, index, root), "Invalid proof");
        
        claimed[leaf] = true;
        _mint(msg.sender, amount);
        
        emit CreditMinted(msg.sender, amount, leaf);
    }
    
    function verifyProof(
        bytes32 leaf,
        bytes32[] calldata proof,
        uint256 index,
        bytes32 root
    ) public pure returns (bool) {
        bytes32 current = leaf;
        
        for (uint256 i = 0; i < proof.length; i++) {
            if (index % 2 == 0) {
                current = keccak256(abi.encodePacked(current, proof[i]));
            } else {
                current = keccak256(abi.encodePacked(proof[i], current));
            }
            index = index / 2;
        }
        
        return current == root;
    }
}
```

### 3.2 Deployment Script

```typescript
// scripts/deploy.ts

import { ethers } from "hardhat";

async function main() {
  const LOOPToken = await ethers.getContractFactory("LOOPToken");
  const token = await LOOPToken.deploy();
  await token.waitForDeployment();
  
  console.log(`LOOPToken deployed to: ${await token.getAddress()}`);
  
  // Save address for bridge
  writeFileSync('.contract-address', await token.getAddress());
}
```

### 3.3 Bridge Integration

```typescript
// src/network/bridge.ts

import { ethers } from "ethers";
import LOOPTokenABI from "../contracts/LOOPToken.json";

interface BridgeConfig {
  rpcUrl: string;
  contractAddress: string;
  operatorKey: string;  // For signing roots
}

class NetworkBridge {
  private contract: ethers.Contract;
  private operator: ethers.Wallet;
  
  constructor(config: BridgeConfig) {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.operator = new ethers.Wallet(config.operatorKey, provider);
    this.contract = new ethers.Contract(
      config.contractAddress,
      LOOPTokenABI,
      this.operator
    );
  }
  
  async commitRoot(root: string): Promise<string> {
    const tx = await this.contract.commitRoot(root);
    const receipt = await tx.wait();
    return receipt.hash;
  }
  
  async prepareMintTx(
    root: string,
    leaf: string,
    proof: string[],
    index: number,
    amount: bigint
  ): Promise<ethers.TransactionRequest> {
    return {
      to: await this.contract.getAddress(),
      data: this.contract.interface.encodeFunctionData('mint', [
        root, leaf, proof, index, amount
      ]),
    };
  }
  
  async isClaimed(leaf: string): Promise<boolean> {
    return this.contract.claimed(leaf);
  }
}
```

### 3.4 Deployment Sequence

```
1. Deploy to Sepolia testnet
   - Test full mint flow
   - Verify merkle proofs work
   - Test challenge scenarios

2. Audit (optional but recommended)
   - Contract is simple (~50 lines)
   - OpenZeppelin base is audited
   - Custom logic is minimal

3. Deploy to mainnet
   - Update bridge config
   - Commit first root
   - Enable minting in production
```

### 3.5 Deliverables

- [ ] LOOPToken.sol contract
- [ ] Hardhat project setup
- [ ] Deploy script
- [ ] Bridge class
- [ ] Testnet deployment
- [ ] Mainnet deployment

---

## Phase 4: Cross-DAO Aggregation

**Goal:** Multiple DAOs, network-wide F, shared τ learning.

### 4.1 Network State

```typescript
// src/network/state.ts

interface NetworkState {
  F_network: number;
  F_initial: number;
  total_supply: bigint;
  dao_count: number;
  
  // Per-DAO breakdown
  daos: Array<{
    address: string;
    F: number;
    credits_earned: bigint;
    credits_minted: bigint;
  }>;
  
  // Network-wide precision
  τ_network: Map<string, PrecisionRecord>;
  
  updatedAt: number;
}

async function computeNetworkState(): Promise<NetworkState> {
  const daos = await listDAOs();
  
  let F_network = 0;
  const daoStates = [];
  
  for (const dao of daos) {
    const F = await getFreeEnergy({ level: 'dao', address: dao.address });
    const credits = await getDAOCredits(dao.address);
    
    F_network += F.F;
    daoStates.push({
      address: dao.address,
      F: F.F,
      credits_earned: sumCredits(credits.filter(c => !c.mintedAt)),
      credits_minted: sumCredits(credits.filter(c => c.mintedAt)),
    });
  }
  
  // Network-wide τ (aggregate across all DAOs)
  const τ_network = await aggregateNetworkPrecision();
  
  return {
    F_network,
    F_initial: await getF_initial(),
    total_supply: await getTotalMinted(),
    dao_count: daos.length,
    daos: daoStates,
    τ_network,
    updatedAt: Date.now(),
  };
}
```

### 4.2 τ Sharing

Precision learned in one DAO benefits others:

```typescript
// When updating precision, also update network level
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
  
  // Also update network-wide
  await updatePrecision(verifierType, { level: 'network' }, outcome);
}

// New DAOs inherit network τ
async function getPrecision(verifierType: string, scope: Scope): Promise<PrecisionRecord> {
  // Check scope-specific first
  const specific = await loadPrecision(verifierType, scope);
  if (specific && specific.samples >= config.learning.threshold) {
    return specific;
  }
  
  // Fall back through hierarchy
  const parent = getParentScope(scope);
  if (parent) {
    return getPrecision(verifierType, parent);
  }
  
  // Fall back to network
  const network = await loadPrecision(verifierType, { level: 'network' });
  if (network) {
    return network;
  }
  
  // Fall back to prior
  return defaultPrecision(verifierType);
}
```

### 4.3 F_initial Genesis

```typescript
// Set F_initial on first real work across network
async function initializeNetwork(): Promise<void> {
  const state = await computeNetworkState();
  
  if (state.F_initial === 0 && state.F_network > 0) {
    await setF_initial(state.F_network);
    
    await emit('network:initialized', {
      F_initial: state.F_network,
      dao_count: state.dao_count,
    });
  }
}
```

### 4.4 API Endpoints

```typescript
// src/api/network.ts

// Network overview
GET /api/network/state
Response: NetworkState

// Network F over time
GET /api/network/history?since=timestamp
Response: { history: Array<{ timestamp, F_network, total_supply }> }

// Network τ for a verifier
GET /api/network/precision/:verifierType
Response: PrecisionRecord

// Compare DAO performance
GET /api/network/leaderboard
Response: {
  byResolution: Array<{ address, name, ΔF_resolved }>,
  byEfficiency: Array<{ address, name, F_per_credit }>,
}
```

### 4.5 Deliverables

- [ ] NetworkState computation
- [ ] Cross-DAO F aggregation
- [ ] Network-wide τ sharing
- [ ] F_initial genesis logic
- [ ] API endpoints
- [ ] Dashboard data

---

## Timeline

| Phase | Duration | Depends On |
|-------|----------|------------|
| Phase 1: First DAO | 2-3 days | Nothing |
| Phase 2: Backfill | 1-2 days | Phase 1 |
| Phase 3: Contract | 1 week | Phase 1 |
| Phase 4: Multi-DAO | 1 week | Phase 3 |

**Total: ~3 weeks to mainnet with multi-DAO support**

---

## Validation Checkpoints

### After Phase 1
- [ ] MetaSystem registered as DAO
- [ ] New work includes daoAddress
- [ ] F computable per DAO
- [ ] API returns DAO list

### After Phase 2
- [ ] Historical commits parsed
- [ ] Backfill credits in tree
- [ ] Total credits reasonable (not inflated)

### After Phase 3
- [ ] Contract deployed to testnet
- [ ] Can commit roots
- [ ] Can mint with valid proof
- [ ] Invalid proofs rejected
- [ ] Double-mint prevented

### After Phase 4
- [ ] Multiple DAOs registered
- [ ] F_network = Σ F_dao
- [ ] τ shared across DAOs
- [ ] Mint rate uses F_network / F_initial
- [ ] Leaderboard shows DAO comparison

---

## Configuration

```typescript
// config/network.ts

interface NetworkConfig {
  // Contract
  rpcUrl: string;                    // e.g., https://mainnet.infura.io/v3/...
  contractAddress: string;           // After deployment
  operatorKey: string;               // For root commits
  
  // Genesis
  autoRegisterSelf: boolean;         // Register MetaSystem on startup
  selfContextPath: string;           // Path to MetaSystem repo
  
  // Backfill
  backfillEnabled: boolean;
  backfillSince: string;             // ISO date
  backfillConfidence: number;        // Lower than live work
  
  // Network
  rootCommitInterval: number;        // ms between auto-commits (0 = manual)
  minCreditsForCommit: number;       // Don't commit for tiny amounts
}
```

---

## Migration from metasystem-dao

The existing `/Users/lionsmane/.metasystem-dao/` has:
- 728 LOOP in pending credits
- 93 completed work items
- Established chain with event history

Options:

### A. Fresh Start
- MetaSystem is new DAO, clean slate
- Old DAO stays separate
- Simpler, no migration complexity

### B. Import Credits
- Parse `pending-credits.json`
- Map to new Credit format
- Include in genesis merkle tree
- Honors past work

### C. Merge Chains
- Import full chain.jsonl
- Replay events into new system
- Most complete, most complex

**Recommendation: B (Import Credits)**

The credits are the value. The chain history is interesting but not essential. Import the 93 credits as genesis, start fresh from there.

```typescript
async function importLegacyCredits(path: string): Promise<void> {
  const data = JSON.parse(readFileSync(path, 'utf-8'));
  
  for (const legacy of data.credits) {
    const credit: Credit = {
      id: legacy.id,
      workId: legacy.contractId,
      nodeId: legacy.identityId,
      daoAddress: 'local:metasystem-dao-legacy',
      ΔF: legacy.bits,
      confidence: 1.0,  // Already verified
      mintRate: 1.0,
      amount: BigInt(legacy.amount),
      workProof: {
        workId: legacy.contractId,
        nodeId: legacy.identityId,
        ΔF: legacy.bits,
        confidence: 1.0,
        conditions: [],
        allPassed: true,
        aggregateConfidence: 1.0,
        proofHash: legacy.proofHash,
      },
      proofHash: legacy.proofHash,
      earnedAt: legacy.earnedAt,
      challenged: false,
    };
    
    creditTree.append(credit);
  }
}
```
