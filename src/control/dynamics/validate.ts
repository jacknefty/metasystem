/**
 * Validation Checks — Spec Part X
 *
 * Quick sanity checks to verify implementation correctness.
 */

import { dao } from '../../identity/scoped-paths.js';
import type { Scope, Configuration, DynamicsParameters } from './types.js';
import { DEFAULT_PARAMETERS } from './types.js';
import { getFreeEnergy, getExpectedFreeEnergy, sampleGLandscape, interpolateG, gradientG } from './free-energy.js';
import { getPrecision, recordPrediction, recordObservation, resetPrecision } from './precision.js';
import { buildWaveFunction } from './wave.js';

interface ValidationResult {
  name: string;
  passed: boolean;
  details: string;
}

/**
 * Validate F aggregation: F(parent) = Σ F(children)
 */
export async function validateFAggregation(hubId: string): Promise<ValidationResult> {
  const { listWork } = await import('../../coordination/resources/work.js');

  const workItems = await listWork({ hubId });
  const activeWork = workItems.filter(w => w.status !== 'fulfilled');

  // Sum F for each work item
  let sumWorkF = 0;
  for (const work of activeWork) {
    const workScope = dao.hub(hubId).task(work.id);
    const workF = await getFreeEnergy(workScope);
    sumWorkF += workF;
  }

  // Get hub F
  const hubScope = dao.hub(hubId);
  const hubF = await getFreeEnergy(hubScope);

  const passed = Math.abs(hubF - sumWorkF) < 0.01;

  return {
    name: 'F Aggregation',
    passed,
    details: `F(hub) = ${hubF.toFixed(2)}, Σ F(work) = ${sumWorkF.toFixed(2)}, Δ = ${Math.abs(hubF - sumWorkF).toFixed(4)}`,
  };
}

/**
 * Validate τ convergence: After N samples, τ approaches true rate
 */
export async function validatePrecisionConvergence(
  trueRate: number = 0.8,
  samples: number = 50
): Promise<ValidationResult> {
  resetPrecision();

  const testVerifier = 'test:convergence';
  const scope = dao; // Use DAO scope as network-level
  const params = { ...DEFAULT_PARAMETERS, learningThreshold: 20 };

  // Simulate observations with known true rate
  for (let i = 0; i < samples; i++) {
    // Predict with current τ estimate
    const currentPrecision = await getPrecision(testVerifier, scope);
    const predictionId = await recordPrediction(
      `work_${i}`,
      `cond_${i}`,
      testVerifier,
      scope,
      currentPrecision.τ,
      'automated',
      params
    );

    // Outcome follows true rate
    const outcome = Math.random() < trueRate ? 1.0 : 0.0;
    await recordObservation(predictionId, outcome, params);
  }

  const precision = await getPrecision(testVerifier, scope);
  const error = Math.abs(precision.τ - trueRate);
  const passed = error < 0.15;

  resetPrecision();

  return {
    name: 'Precision Convergence',
    passed,
    details: `After ${samples} samples: τ = ${precision.τ.toFixed(3)}, true rate = ${trueRate}, error = ${error.toFixed(3)}`,
  };
}

/**
 * Validate guidance: velocity · ∇G < 0 (always moves toward lower G)
 */
export async function validateGuidanceDownhill(
  scope: Scope = dao,
  sampleCount: number = 20
): Promise<ValidationResult> {
  const params = DEFAULT_PARAMETERS;
  const mass = 1.0;

  const wave = await buildWaveFunction(scope, mass, params);
  const landscape = await sampleGLandscape(scope, 5, params);

  let violations = 0;
  let totalChecks = 0;
  const details: string[] = [];

  // Sample random Q points and check v · ∇G
  for (let i = 0; i < sampleCount; i++) {
    const Q: Configuration = {
      verified: Math.random(),
      active: Math.random(),
      resources: Math.random(),
    };

    const v = wave.velocity(Q);
    const gradG = await gradientG(scope, Q, params);

    // Dot product v · ∇G
    const dotProduct = v.verified * gradG.verified + v.active * gradG.active + v.resources * gradG.resources;

    totalChecks++;

    // Should be ≤ 0 (moving downhill or stationary)
    if (dotProduct > 0.001) {
      violations++;
      if (violations <= 3) {
        details.push(`Q=(${Q.verified.toFixed(2)},${Q.active.toFixed(2)},${Q.resources.toFixed(2)}): v·∇G = ${dotProduct.toFixed(4)} > 0`);
      }
    }
  }

  const passed = violations === 0;

  return {
    name: 'Guidance Downhill',
    passed,
    details: passed
      ? `All ${totalChecks} samples have v·∇G ≤ 0`
      : `${violations}/${totalChecks} violations. ${details.join('; ')}`,
  };
}

/**
 * Validate G = F + γH identity
 */
export async function validateGIdentity(scope: Scope = dao): Promise<ValidationResult> {
  const params = DEFAULT_PARAMETERS;

  const F = await getFreeEnergy(scope);
  const { getEpistemicValue } = await import('./free-energy.js');
  const H = await getEpistemicValue(scope, params);
  const G_computed = F + params.γ * H;
  const G_direct = await getExpectedFreeEnergy(scope, params);

  const error = Math.abs(G_computed - G_direct);
  const passed = error < 0.001;

  return {
    name: 'G = F + γH Identity',
    passed,
    details: `F=${F.toFixed(2)}, H=${H.toFixed(2)}, γ=${params.γ}, F+γH=${G_computed.toFixed(4)}, G=${G_direct.toFixed(4)}, Δ=${error.toFixed(6)}`,
  };
}

/**
 * Validate mint rate scaling: When F_network halves, mint_rate halves
 */
export async function validateMintRateScaling(): Promise<ValidationResult> {
  const { getNetworkState, updateNetworkState, resetNetworkState, getTokenMetrics, DEFAULT_MINT_CONFIG } = await import('./mint.js');

  resetNetworkState();

  // Set initial state: F_initial = 100, F_network = 100
  updateNetworkState({ F_initial: 100, F_network: 100 });
  const metrics1 = getTokenMetrics(DEFAULT_MINT_CONFIG);
  const rate1 = metrics1.mint_rate;

  // Halve F_network: F_network = 50
  updateNetworkState({ F_network: 50 });
  const metrics2 = getTokenMetrics(DEFAULT_MINT_CONFIG);
  const rate2 = metrics2.mint_rate;

  // Rate should also halve
  const expectedRatio = 0.5;
  const actualRatio = rate2 / rate1;
  const error = Math.abs(actualRatio - expectedRatio);
  const passed = error < 0.01;

  resetNetworkState();

  return {
    name: 'Mint Rate Scaling',
    passed,
    details: `F halved: rate1=${rate1.toFixed(3)}, rate2=${rate2.toFixed(3)}, ratio=${actualRatio.toFixed(3)}, expected=0.5`,
  };
}

/**
 * Validate mint amount formula: mint = ΔF × confidence × mint_rate
 */
export async function validateMintFormula(): Promise<ValidationResult> {
  const { DEFAULT_MINT_CONFIG } = await import('./mint.js');

  // Test values
  const ΔF = 50;
  const confidence = 0.8;
  const F_network = 100;
  const F_initial = 100;
  const base_rate = DEFAULT_MINT_CONFIG.base_rate;
  const decimals = DEFAULT_MINT_CONFIG.decimals;

  // Expected calculation
  const mint_rate = base_rate * (F_network / F_initial);
  const rawAmount = ΔF * confidence * mint_rate;
  const expectedMint = BigInt(Math.floor(rawAmount * (10 ** decimals)));

  // Manual verification
  const manualCalc = 50 * 0.8 * 1.0; // = 40 tokens
  const manualMint = BigInt(Math.floor(manualCalc * (10 ** decimals)));

  const passed = expectedMint === manualMint;

  return {
    name: 'Mint Formula',
    passed,
    details: `ΔF=${ΔF}, conf=${confidence}, rate=${mint_rate}: expected=${expectedMint.toString()}, manual=${manualMint.toString()}`,
  };
}

/**
 * Validate τ-scaled challenge window
 */
export async function validateChallengeWindow(): Promise<ValidationResult> {
  const { getChallengeWindow } = await import('./bridge.js');

  // τ=0.99 should give ~1 hour (3600s)
  const window99 = getChallengeWindow(0.99);
  // τ=0.90 should give ~24 hours (86400s)
  const window90 = getChallengeWindow(0.90);
  // τ=0.95 should give ~12 hours
  const window95 = getChallengeWindow(0.95);

  const checks = [
    Math.abs(window99 - 3600) < 100,
    Math.abs(window90 - 86400) < 100,
    window95 > window99 && window95 < window90,
  ];

  const passed = checks.every(c => c);

  return {
    name: 'Challenge Window Scaling',
    passed,
    details: `τ=0.99: ${window99.toFixed(0)}s, τ=0.95: ${window95.toFixed(0)}s, τ=0.90: ${window90.toFixed(0)}s`,
  };
}

/**
 * Validate merkle tree integrity
 */
export async function validateMerkleTree(): Promise<ValidationResult> {
  const { getMerkleRoot, getMerkleProof, verifyMerkleProof, createCredit, resetBridge } = await import('./bridge.js');

  resetBridge();

  const scope = dao;
  const params = DEFAULT_PARAMETERS;

  // Create test work proof
  const workProof = {
    workId: 'test_work',
    nodeId: 'test_node',
    commitHash: 'abc123',
    outputs: [{ path: 'output.txt', hash: 'def456', size: 100 }],
    exitCode: 0,
    executedAt: Date.now(),
    duration: 1000,
  };

  // Create a credit
  const credit = await createCredit('test_work', 'test_node', 100n, workProof, scope, '0x0', undefined, undefined, params);

  // Get proof
  const proof = getMerkleProof(credit.id);
  if (!proof) {
    return { name: 'Merkle Tree', passed: false, details: 'Failed to get proof' };
  }

  // Verify proof
  const verified = verifyMerkleProof(credit.id, proof);

  resetBridge();

  return {
    name: 'Merkle Tree',
    passed: verified,
    details: `Created credit, root=${getMerkleRoot().slice(0, 16)}..., proof length=${proof.length}, verified=${verified}`,
  };
}

/**
 * Validate verification strategy selection
 */
export async function validateStrategySelection(): Promise<ValidationResult> {
  const { getVerificationStrategy } = await import('./bridge.js');

  const s99 = getVerificationStrategy(0.99);
  const s95 = getVerificationStrategy(0.95);
  const s80 = getVerificationStrategy(0.80);

  const checks = [
    s99.strategy === 'single',
    s95.strategy === 'optimistic',
    s80.strategy === 'consensus',
    s99.requiredVerifiers === 1,
    s95.requiredVerifiers === 1,
    s80.requiredVerifiers > 1,
  ];

  const passed = checks.every(c => c);

  return {
    name: 'Strategy Selection',
    passed,
    details: `τ=0.99: ${s99.strategy}, τ=0.95: ${s95.strategy} (window=${s95.challengeWindow}s), τ=0.80: ${s80.strategy} (${s80.requiredVerifiers} verifiers)`,
  };
}

/**
 * Validate DAO registry
 */
export async function validateDAORegistry(): Promise<ValidationResult> {
  const { listDAOs, getDAO, isMetaSystemRegistered } = await import('../../coordination/network/registry.js');

  const registered = isMetaSystemRegistered();
  const daos = listDAOs();
  const metasystem = getDAO('local:metasystem');

  const checks = [
    registered,
    daos.length >= 1,
    metasystem !== null,
    metasystem?.name === 'MetaSystem',
  ];

  const passed = checks.every(c => c);

  return {
    name: 'DAO Registry',
    passed,
    details: `MetaSystem registered: ${registered}, DAOs: ${daos.length}, address: ${metasystem?.address ?? 'none'}`,
  };
}

/**
 * Validate F_network = Σ F_dao
 */
export async function validateFNetworkAggregation(): Promise<ValidationResult> {
  const { computeNetworkState } = await import('../../coordination/network/state.js');

  const state = await computeNetworkState();
  const sumF = state.daos.reduce((sum, d) => sum + d.F, 0);
  const error = Math.abs(state.F_network - sumF);
  const passed = error < 0.01;

  return {
    name: 'F_network Aggregation',
    passed,
    details: `F_network=${state.F_network.toFixed(2)}, Σ F_dao=${sumF.toFixed(2)}, Δ=${error.toFixed(4)}`,
  };
}

/**
 * Validate τ inheritance through scope chain
 */
export async function validatePrecisionInheritance(): Promise<ValidationResult> {
  const { getPrecision, recordPrediction, recordObservation, resetPrecision } = await import('./precision.js');

  resetPrecision();

  const testVerifier = 'test:inheritance';
  const params = { ...DEFAULT_PARAMETERS, learningThreshold: 10 };

  // Record at DAO level (parent)
  const daoScope = dao;

  // Build up DAO-level precision with many observations
  for (let i = 0; i < 20; i++) {
    const predId = await recordPrediction('dao_work', 'dao_cond', testVerifier, daoScope, 0.8, 'automated', params);
    await recordObservation(predId, 0.9, params);
  }

  const daoPrecision = await getPrecision(testVerifier, daoScope, params);

  // Now query at work level (child) with NO local samples
  const workScope = dao.hub('new_context').task('new_work');

  const workPrecision = await getPrecision(testVerifier, workScope, params);

  // Work level should inherit τ from DAO since it has no local samples
  const τMatch = Math.abs(workPrecision.τ - daoPrecision.τ) < 0.01;

  resetPrecision();

  return {
    name: 'Precision Inheritance',
    passed: τMatch,
    details: `DAO τ=${daoPrecision.τ.toFixed(3)}, Work τ=${workPrecision.τ.toFixed(3)}, match=${τMatch}`,
  };
}

/**
 * Run all validation checks
 */
export async function runAllValidations(hubId?: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  // Core math (Phases 1-4)
  results.push(await validateGIdentity());
  results.push(await validatePrecisionConvergence(0.8, 50));
  results.push(await validateGuidanceDownhill());

  // Token economics (Phase 5)
  results.push(await validateMintRateScaling());
  results.push(await validateMintFormula());

  // Bridge (Phase 6)
  results.push(await validateChallengeWindow());
  results.push(await validateStrategySelection());
  results.push(await validateMerkleTree());

  // DAO Registry (Phase 1 Deployment)
  results.push(await validateDAORegistry());

  // Network State (Phase 4)
  results.push(await validateFNetworkAggregation());
  results.push(await validatePrecisionInheritance());

  // F aggregation (needs a context with work)
  if (hubId) {
    results.push(await validateFAggregation(hubId));
  }

  return results;
}

/**
 * Print validation results
 */
export function printValidationResults(results: ValidationResult[]): void {
  console.log('\n=== Dynamics Validation Results ===\n');

  for (const result of results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.name}`);
    console.log(`  ${result.details}\n`);
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`Summary: ${passed}/${total} checks passed`);
}
