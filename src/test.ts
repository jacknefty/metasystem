/**
 * Tests for edge module
 */

import { LocalChain, setChain } from './coordination/channels/chain.js';
import { deriveNode, deriveWork, deriveAllNodes, deriveAllWork } from './coordination/resources/derive.js';
import { joinHub, leaveHub, getMembers, getMemberships, isMember } from './coordination/resources/membership.js';
import { createWork, postBounty, claimWork, submitWork, completeWork, getWork, listWork, listAvailableWork } from './coordination/resources/work.js';
import { emitPerceived, emitResolved, getBalance, getDiagnosis } from './coordination/resources/variety.js';
import { emitVariety, getResolution, mintCredit, getPendingCredits, getSystemBalance, bitsToAmount } from './coordination/resources/token.js';
import { createNode, getNode, listNodes, updateSettings } from './identity/node.js';
import { getBountyPool, getPoolStats, checkClaimability, getReputation } from './coordination/resources/pool.js';
import { runDynamicsControlTick } from './control/balance/homeostat.js';
import { dynamicsHomeostat, clearFreeEnergyCache } from './control/dynamics/index.js';
import { executeWork, finalizeWork } from './operations/execute.js';
import { join } from 'path';
import { unlinkSync, existsSync } from 'fs';

const TEST_CHAIN_PATH = join(process.cwd(), 'test-chain.jsonl');

function setupTestChain(): LocalChain {
  if (existsSync(TEST_CHAIN_PATH)) {
    unlinkSync(TEST_CHAIN_PATH);
  }
  const chain = new LocalChain(TEST_CHAIN_PATH);
  setChain(chain);
  return chain;
}

function cleanupTestChain(): void {
  if (existsSync(TEST_CHAIN_PATH)) {
    unlinkSync(TEST_CHAIN_PATH);
  }
}

async function testChain() {
  console.log('=== Testing Chain ===\n');

  const chain = setupTestChain();

  // 1. Append identity:created
  const identity = await chain.append('identity:created', 'system', 'node-1', {
    name: 'Test Node',
    purpose: 'Testing the chain',
    scope: ['**'],
  });
  console.log('1. Created identity:', identity.id);

  // 2. Append work:created
  await chain.append('work:created', 'node-1', 'work-1', {
    name: 'Test Work',
    hubId: 'node-1',
    hubPath: '/tmp/test-project',
    conditions: [
      { id: 'c1', description: 'File exists', verifier: 'exists:test.txt' },
    ],
  });
  console.log('2. Created work');

  // 3. Append variety:env:in
  await chain.append('variety:env:in', 'node-1', 'work-1', {
    bits: 10,
    context: 'work created',
  });
  console.log('3. Emitted variety:env:in');

  // 4. Test event listener
  let receivedEvent = false;
  chain.on('event', () => { receivedEvent = true; });

  await chain.append('variety:work:out', 'node-1', 'work-1', {
    bits: 10,
    workId: 'work-1',
  });

  // 5. Verify persistence
  const chain2 = new LocalChain(TEST_CHAIN_PATH);
  const reloaded = await chain2.recall({});
  console.log(`4. Reloaded ${reloaded.length} events from disk`);
  console.log(`5. Event listener works: ${receivedEvent}`);

  cleanupTestChain();
  return reloaded.length === 4 && receivedEvent;
}

async function testDerivation() {
  console.log('\n=== Testing Derivation ===\n');

  const chain = setupTestChain();

  // Create a node
  await chain.append('identity:created', 'system', 'node-1', {
    name: 'Worker Node',
    purpose: 'Execute work',
    scope: ['src/**'],
  });

  // Update settings
  await chain.append('identity:settings', 'system', 'node-1', {
    executor: 'aider',
    maxAttempts: 5,
  });

  // Join a project
  await chain.append('membership:joined', 'system', 'node-1', {
    hub: 'project-1',
    role: 'worker',
  });

  // Create work
  await chain.append('work:created', 'node-1', 'work-1', {
    name: 'Implement feature',
    hubId: 'project-1',
    hubPath: '/tmp/test-project',
    conditions: [
      { id: 'c1', description: 'Tests pass', verifier: 'passes:npm test' },
      { id: 'c2', description: 'File exists', verifier: 'exists:feature.ts' },
    ],
  });

  // Post bounty
  await chain.append('work:posted', 'node-1', 'work-1', {
    bounty: { amount: 100, currency: 'variety', postedAt: Date.now() },
  });

  // Claim work
  await chain.append('work:claimed', 'node-1', 'work-1', {
    nodeId: 'node-1',
    claimedAt: Date.now(),
    deadline: Date.now() + 3600000,
  });

  // Submit work
  await chain.append('work:submitted', 'node-1', 'work-1', {
    nodeId: 'node-1',
    branch: 'work/work-1',
    submittedAt: Date.now(),
  });

  // Mark condition met
  await chain.append('condition:met', 'system', 'work-1', {
    conditionId: 'c1',
    evidence: 'All tests pass',
  });

  // Complete work
  await chain.append('work:completed', 'system', 'work-1', {
    nodeId: 'node-1',
    bountyAmount: 100,
    completedAt: Date.now(),
  });

  // Derive state
  const events = await chain.recall({});

  // Test single node derivation
  const nodeEvents = events.filter(e => e.subject === 'node-1');
  const node = deriveNode(nodeEvents);
  console.log('1. Derived node:', node?.name, '- status:', node?.status);
  console.log('   Settings:', node?.settings.executor, 'maxAttempts:', node?.settings.maxAttempts);
  console.log('   Memberships:', node?.memberships.length);

  // Test single work derivation
  const workEvents = events.filter(e => e.subject === 'work-1');
  const work = deriveWork(workEvents);
  console.log('2. Derived work:', work?.name, '- status:', work?.status);
  console.log('   Bounty status:', work?.bountyStatus);
  console.log('   Conditions met:', work?.conditions.filter(c => c.met).length, '/', work?.conditions.length);
  console.log('   Gap:', work?.gap);

  // Test batch derivation
  const allNodes = deriveAllNodes(events);
  const allWork = deriveAllWork(events);
  console.log('3. Batch derived:', allNodes.size, 'nodes,', allWork.size, 'work items');

  cleanupTestChain();

  const nodeOk = node?.status === 'active' &&
                 node?.settings.executor === 'aider' &&
                 node?.memberships.length === 1;
  const workOk = work?.status === 'fulfilled' &&
                 work?.bountyStatus === 'completed' &&
                 work?.gap === 1;

  return nodeOk && workOk;
}

async function testMembership() {
  console.log('\n=== Testing Membership ===\n');

  const chain = setupTestChain();

  // Create two nodes
  await chain.append('identity:created', 'system', 'project-1', {
    name: 'Test Project',
    purpose: 'A project context',
    scope: ['**'],
  });

  await chain.append('identity:created', 'system', 'worker-1', {
    name: 'Worker Node',
    purpose: 'Execute work',
    scope: ['src/**'],
  });

  // Worker joins project
  await joinHub('worker-1', 'project-1', 'developer');
  console.log('1. Worker joined project');

  // Check membership
  const is = await isMember('worker-1', 'project-1');
  console.log('2. isMember:', is);

  // Get members of project
  const members = await getMembers('project-1');
  console.log('3. Project members:', members.length);

  // Get worker's memberships
  const memberships = await getMemberships('worker-1');
  console.log('4. Worker memberships:', memberships.length);

  // Leave project
  await leaveHub('worker-1', 'project-1');
  const isAfter = await isMember('worker-1', 'project-1');
  console.log('5. After leave, isMember:', isAfter);

  cleanupTestChain();

  return is && members.length === 1 && memberships.length === 1 && !isAfter;
}

async function testWorkLifecycle() {
  console.log('\n=== Testing Work Lifecycle ===\n');

  const chain = setupTestChain();

  // Create project and worker
  await chain.append('identity:created', 'system', 'project-1', {
    name: 'Test Project',
    purpose: 'A project',
    scope: ['**'],
  });

  await chain.append('identity:created', 'system', 'worker-1', {
    name: 'Worker',
    purpose: 'Work',
    scope: ['**'],
  });

  // Create work
  const workId = await createWork({
    name: 'Build feature',
    hubId: 'project-1',
    hubPath: '/tmp/test-project',
    ownerId: 'project-1',
    conditions: [
      { id: 'c1', description: 'Tests pass', verifier: 'passes:npm test', varietyWeight: 20 },
    ],
  });
  console.log('1. Created work:', workId);

  // Post bounty
  await postBounty(workId);
  let work = await getWork(workId);
  console.log('2. Posted bounty:', work?.bounty?.amount);

  // Claim work
  await claimWork(workId, 'worker-1');
  work = await getWork(workId);
  console.log('3. Claimed by:', work?.claim?.nodeId);

  // Submit work
  await submitWork(workId, 'feature/work-1');
  work = await getWork(workId);
  console.log('4. Submitted, status:', work?.bountyStatus);

  // Complete work
  await completeWork(workId);
  work = await getWork(workId);
  console.log('5. Completed, status:', work?.status);

  // List work
  const all = await listWork({});
  const available = await listAvailableWork();
  console.log('6. Total work:', all.length, 'Available:', available.length);

  cleanupTestChain();

  return work?.status === 'fulfilled' && work?.bountyStatus === 'completed' && available.length === 0;
}

async function testVariety() {
  console.log('\n=== Testing Variety ===\n');

  setupTestChain();

  // Emit perceived variety
  await emitPerceived('system', 'work-1', 50, { context: 'work created' });
  await emitPerceived('system', 'work-2', 30, { context: 'work created' });
  console.log('1. Emitted 80 bits perceived');

  // Check balance (unresolved)
  let balance = await getBalance();
  console.log('2. Balance:', balance.perceived, 'perceived,', balance.resolved, 'resolved');
  console.log('   Ratio:', balance.ratio === Infinity ? '∞' : balance.ratio.toFixed(2));
  console.log('   Diagnosis:', getDiagnosis(balance));

  // Resolve some variety
  await emitResolved('worker-1', 'work-1', 50, { workId: 'work-1', context: 'work completed' });
  balance = await getBalance();
  console.log('3. After resolving 50:', balance.ratio.toFixed(2));

  // Resolve remaining
  await emitResolved('worker-1', 'work-2', 30, { workId: 'work-2', context: 'work completed' });
  balance = await getBalance();
  console.log('4. Final balance:', balance.ratio.toFixed(2), 'healthy:', balance.healthy);

  cleanupTestChain();

  return balance.ratio === 1.0 && balance.healthy;
}

async function testTokenAndCredits() {
  console.log('\n=== Testing Token & Credits ===\n');

  const chain = setupTestChain();

  // Create work with conditions
  const hubId = await createNode({ name: 'Project', purpose: 'Test' });
  const nodeId = await createNode({ name: 'Worker', purpose: 'Work' });

  const workId = await createWork({
    name: 'Feature',
    hubId,
    hubPath: '/tmp/test-project',
    ownerId: hubId,
    conditions: [
      { id: 'c1', description: 'Tests pass', verifier: 'llm', varietyWeight: 25 },
      { id: 'c2', description: 'Code reviewed', verifier: 'llm', varietyWeight: 15 },
    ],
  });
  await postBounty(workId);
  console.log('1. Created work with 40 bits total weight');

  // Emit variety for work creation
  await emitVariety('env', 'in', hubId, workId, 40, { workId, context: 'work created' });

  // Check resolution before completion
  let resolution = await getResolution(workId);
  console.log('2. Before completion - position:', resolution.position.toFixed(2), 'collapsed:', resolution.collapsed);

  // Emit resolved variety (work done)
  await emitVariety('work', 'out', nodeId, workId, 40, { workId, context: 'work done' });

  // Check resolution after
  resolution = await getResolution(workId);
  console.log('3. After resolution - position:', resolution.position.toFixed(2), 'collapsed:', resolution.collapsed);

  // Mint credit
  const credit = await mintCredit(workId, nodeId);
  console.log('4. Credit minted:');
  console.log('   Bits:', credit.bits);
  console.log('   Amount:', credit.amount.toString().slice(0, 6) + '...' + ' (40 × 10^18)');
  console.log('   Proof:', credit.proofHash.slice(0, 16) + '...');

  // Query pending credits
  const pending = await getPendingCredits(nodeId);
  console.log('5. Pending credits for worker:', pending.length);

  // Check system balance with all domains
  const sysBalance = await getSystemBalance();
  console.log('6. System balance:');
  console.log('   env.in:', sysBalance.byDomain.env.in, 'env.out:', sysBalance.byDomain.env.out);
  console.log('   work.in:', sysBalance.byDomain.work.in, 'work.out:', sysBalance.byDomain.work.out);

  // Test bitsToAmount
  const amount = bitsToAmount(100);
  const expected = BigInt(100) * BigInt(10 ** 18);
  console.log('7. bitsToAmount(100) correct:', amount === expected);

  cleanupTestChain();

  return resolution.collapsed &&
         credit.bits === 40 &&
         pending.length === 1 &&
         amount === expected;
}

async function testNodeIdentity() {
  console.log('\n=== Testing Node Identity ===\n');

  setupTestChain();

  // Create node
  const nodeId = await createNode({
    name: 'Test Worker',
    purpose: 'Execute tasks',
    scope: ['src/**'],
  });
  console.log('1. Created node:', nodeId);

  // Get node
  const node = await getNode(nodeId);
  console.log('2. Node name:', node?.name);

  // Update settings
  await updateSettings(nodeId, { availableForWork: true, executor: 'aider' });
  const updated = await getNode(nodeId);
  console.log('3. Updated executor:', updated?.settings.executor);
  console.log('   Available:', updated?.settings.availableForWork);

  // List nodes
  const all = await listNodes({});
  const available = await listNodes({ availableForWork: true });
  console.log('4. All nodes:', all.length, 'Available:', available.length);

  cleanupTestChain();

  return node?.name === 'Test Worker' &&
         updated?.settings.executor === 'aider' &&
         updated?.settings.availableForWork === true;
}

async function testCoordination() {
  console.log('\n=== Testing Coordination ===\n');

  const chain = setupTestChain();

  // Create project and worker
  const hubId = await createNode({ name: 'Project', purpose: 'A project' });
  const nodeId = await createNode({ name: 'Worker', purpose: 'Do work' });
  await updateSettings(nodeId, { availableForWork: true });

  // Create and post work
  const workId = await createWork({
    name: 'Build feature',
    hubId,
    hubPath: '/tmp/test-project',
    ownerId: hubId,
    conditions: [{ id: 'c1', description: 'Done', verifier: 'llm', varietyWeight: 25 }],
  });
  await postBounty(workId, 25);

  // Check pool
  const pool = await getBountyPool();
  const stats = await getPoolStats();
  console.log('1. Pool size:', pool.length, 'Claimable:', stats.claimable);

  // Check claimability
  const { claimable, reasons } = await checkClaimability(workId, nodeId);
  console.log('2. Claimable:', claimable, reasons.length ? `(${reasons.join(', ')})` : '');

  // Check reputation (fresh worker)
  const rep = await getReputation(nodeId);
  console.log('3. Reputation - completed:', rep.completedCount, 'rate:', rep.completionRate);
  console.log('   Max claims:', rep.maxConcurrentClaims);

  cleanupTestChain();

  return pool.length === 1 && claimable && rep.maxConcurrentClaims >= 1;
}

async function testControlLoop() {
  console.log('\n=== Testing Control Loop ===\n');

  setupTestChain();

  // Create project and worker
  const hubId = await createNode({ name: 'Project', purpose: 'A project' });
  const nodeId = await createNode({ name: 'Worker', purpose: 'Do work' });
  await updateSettings(nodeId, { availableForWork: true });

  // Create work — postBounty emits variety:env:in automatically
  const workId = await createWork({
    name: 'Task',
    hubId,
    hubPath: '/tmp/test-project',
    ownerId: hubId,
    conditions: [{ id: 'c1', description: 'Done', verifier: 'llm', varietyWeight: 10 }],
  });
  await postBounty(workId, 10);

  // Check dynamics - should want to invoke (F > 0)
  const state1 = await dynamicsHomeostat();
  console.log('1. Dynamics:', state1.action, '- F:', state1.F.toFixed(2), 'G:', state1.G.toFixed(2));

  // Run dynamics control tick - should assign work
  const tick = await runDynamicsControlTick();
  console.log('2. Invoked:', tick.invocationResult?.invoked.length ?? 0, 'workers');
  console.log('   Assigned:', tick.invocationResult?.workAssigned.length ?? 0, 'work items');

  // Execute and finalize
  if (tick.invocationResult?.workAssigned.length) {
    const assignment = tick.invocationResult.workAssigned[0];
    const result = await executeWork(assignment.workId, assignment.nodeId);
    console.log('3. Execution:', result.success ? 'success' : 'failed');

    await finalizeWork(assignment.workId, true);
  }

  // Clear cache so we get fresh F computation
  clearFreeEnergyCache();

  // Check dynamics after - should be balanced (F ~ 0)
  const state2 = await dynamicsHomeostat();
  console.log('4. After completion:', state2.action, '- F:', state2.F.toFixed(2));

  cleanupTestChain();

  return state1.action === 'invoke' &&
         (tick.invocationResult?.workAssigned.length ?? 0) === 1 &&
         state2.F === 0;
}

async function main() {
  const results: Record<string, boolean> = {};

  results.chain = await testChain();
  results.derivation = await testDerivation();
  results.membership = await testMembership();
  results.work = await testWorkLifecycle();
  results.variety = await testVariety();
  results.tokenCredits = await testTokenAndCredits();
  results.nodeIdentity = await testNodeIdentity();
  results.coordination = await testCoordination();
  results.controlLoop = await testControlLoop();

  console.log('\n=== Results ===');
  for (const [name, ok] of Object.entries(results)) {
    console.log(`${name}: ${ok ? '✓' : '✗'}`);
  }

  const allPassed = Object.values(results).every(Boolean);
  if (allPassed) {
    console.log('\n✓ All tests passed!');
  } else {
    console.log('\n✗ Some tests failed');
    process.exit(1);
  }
}

main().catch(console.error);
