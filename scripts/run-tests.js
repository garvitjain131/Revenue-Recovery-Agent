/*
 * run-tests.js
 * 
 * Automated Verification Suite for Revenue Recovery Agent.
 * 
 * Validates:
 *   1. Financial Scoring & Net Expected Recovery calculations
 *   2. Multi-factor Recovery Confidence calculations
 *   3. Recovery Strategy Engine candidate generation & ranking
 *   4. Policy Guardian 14-Point safety checks & Risk-Adaptive Autonomy
 *   5. Idempotency & Duplicate Intervention Prevention
 *   6. LLM Schema Validation & Deterministic Fallback
 *   7. Single-Source Revenue Attribution & Double-Counting Prevention
 *   8. Operating Modes (Observe, Review, Autonomous)
 *   9. Deterministic Empirical Benchmark Evaluation
 */

const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const scoring = require('../src/lib/scoring-engine');
const strategyEngine = require('../src/lib/recovery-strategy-engine');
const policy = require('../src/lib/policy-engine');
const llm = require('../src/lib/llm-reasoning');
const db = require('../src/lib/database');
const orchestrator = require('../src/lib/agent-orchestrator');
const evalEngine = require('../src/lib/evaluation-engine');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('REVENUE RECOVERY AGENT — AUTOMATED VERIFICATION SUITE');
  console.log('======================================================\n');

  // ── TEST 1: Financial Scoring & Net Expected Recovery ──────────
  console.log('[1/9] Testing Financial Scoring & Net Expected Recovery Math');
  {
    const revenueAtRisk = 10000;
    const probability = 0.8;
    const effectiveness = 0.85;
    const cost = 2;
    const riskCost = 10;

    const expected = scoring.calculateExpectedRecovery(revenueAtRisk, probability, effectiveness, cost, riskCost);
    // Expected Gross = 10000 * 0.8 * 0.85 = 6800. Net = 6800 - 2 - 10 = 6788
    assert(expected === 6788, `Expected recovery calculated accurately: ${expected} === 6788`);
  }

  // ── TEST 2: Multi-Factor Recovery Confidence ───────────────────
  console.log('\n[2/9] Testing Multi-Factor Recovery Confidence Weighted Floor');
  {
    const confidence = scoring.calculateRecoveryConfidence({
      detectorConfidence: 0.90,
      historicalEvidenceConfidence: 0.80,
      strategyEvidenceConfidence: 0.85,
      llmConfidence: 0.70,
      dataCompleteness: 0.95,
    });
    // 0.30*0.90 + 0.25*0.80 + 0.20*0.85 + 0.15*0.70 + 0.10*0.95 = 0.27 + 0.20 + 0.17 + 0.105 + 0.095 = 0.84
    assert(confidence >= 0.80 && confidence <= 0.90, `Recovery confidence weighted correctly: ${confidence}`);
  }

  // ── TEST 3: Strategy Engine Candidate Generation & Ranking ─────
  console.log('\n[3/9] Testing Strategy Engine Candidate Generation & Ranking');
  {
    const sampleOpp = {
      revenue_at_risk: 15000,
      recovery_probability: 0.75,
      type: 'payment_failure',
    };
    const sampleCustomer = { lifetime_value: 40000, successful_payments: 5 };

    const strategies = strategyEngine.evaluateStrategies(sampleOpp, sampleCustomer, { isMethodDegraded: true });
    assert(strategies.length >= 4, `Generated ${strategies.length} candidate recovery strategies`);
    assert(strategies[0].selected === true, `Top-ranked strategy marked selected`);
    assert(strategies[0].netExpectedRecovery >= strategies[1].netExpectedRecovery, `Strategies deterministically ranked by Net Expected Recovery`);
    assert(strategies[0].action === 'create_payment_link', `Payment link selected for degraded rail scenario`);
  }

  // ── TEST 4: Policy Guardian 14 Safety Checks & Risk Downgrades ──
  console.log('\n[4/9] Testing Policy Guardian 14-Point Safety Checks & Autonomy');
  {
    const mockMerchant = {
      operating_mode: 'autonomous',
      guardrails: JSON.stringify({
        max_auto_transaction: 25000,
        high_value_threshold: 100000,
        minimum_confidence: 0.70,
        kill_switch: false,
      }),
    };

    // Low-risk standard transaction -> Approved
    const standardOpp = { id: 'opp_test_1', revenue_at_risk: 5000, recovery_probability: 0.80, expected_recovery: 4000 };
    const standardDecision = policy.validateAction({ action: 'create_payment_link', confidence: 0.85, expected_recovery: 4000 }, standardOpp, mockMerchant);
    assert(standardDecision.decision === 'APPROVED', `Standard low-risk transaction auto-approved`);

    // High-value transaction (> ₹1,00,000) -> Review Required
    const highValOpp = { id: 'opp_test_2', revenue_at_risk: 120000, recovery_probability: 0.85, expected_recovery: 90000 };
    const highValDecision = policy.validateAction({ action: 'create_payment_link', confidence: 0.85, expected_recovery: 90000 }, highValOpp, mockMerchant);
    assert(highValDecision.decision === 'REVIEW_REQUIRED', `High-value transaction downgraded to human review`);

    // Kill switch active -> Blocked
    const killedMerchant = { ...mockMerchant, guardrails: JSON.stringify({ kill_switch: true }) };
    const killedDecision = policy.validateAction({ action: 'create_payment_link', confidence: 0.85, expected_recovery: 4000 }, standardOpp, killedMerchant);
    assert(killedDecision.decision === 'BLOCKED', `Kill switch immediately blocks operations`);
  }

  // ── TEST 5: Idempotency & Duplicate Prevention ──────────────────
  console.log('\n[5/9] Testing Deterministic Idempotency Key & Duplicate Prevention');
  {
    const existingInterventions = [
      { opportunity_id: 'opp_dup_1', action_type: 'create_payment_link', execution_status: 'executed' }
    ];
    const isDup = policy.isDuplicateIntervention('opp_dup_1', 'cust_1', 'create_payment_link', existingInterventions);
    assert(isDup === true, `Duplicate payment link intervention prevented`);

    const isDifferentAction = policy.isDuplicateIntervention('opp_dup_1', 'cust_1', 'escalate_to_merchant', existingInterventions);
    assert(isDifferentAction === false, `Different action type permitted`);
  }

  // ── TEST 6: LLM Schema Validation & Deterministic Fallback ──────
  console.log('\n[6/9] Testing LLM Schema Validation & Fallback Safety');
  {
    const fallbackDiagnosis = await llm.analyzeRootCause({
      revenue_at_risk: 45000,
      anomalies: [{ type: 'method_degradation', method: 'upi', increase: 0.25 }],
    });
    assert(fallbackDiagnosis.root_cause.includes('UPI') || fallbackDiagnosis.root_cause.includes('payment'), `Fallback diagnoses degradation accurately: "${fallbackDiagnosis.root_cause}"`);
    assert(fallbackDiagnosis.recommended_action === 'create_payment_link', `Fallback suggests valid action: ${fallbackDiagnosis.recommended_action}`);
  }

  // ── TEST 7: Single-Source Revenue Attribution ───────────────────
  console.log('\n[7/9] Testing Single-Source Attribution (No Double Counting)');
  {
    const testIntId = db.generateId('int_test');
    const testOppId = db.generateId('opp_test');
    const testMerchantId = 'merchant_rzp_test';

    // Insert opportunity parent record first
    db.insertRow('opportunities', {
      id: testOppId,
      merchant_id: testMerchantId,
      type: 'payment_failure',
      status: 'action_executed',
      title: 'Attribution Test Opportunity',
      revenue_at_risk: 5000,
      expected_recovery: 4800,
      created_at: new Date().toISOString(),
    });

    db.insertRow('interventions', {
      id: testIntId,
      opportunity_id: testOppId,
      merchant_id: testMerchantId,
      action_type: 'create_payment_link',
      expected_recovery: 4800,
      approval_status: 'approved',
      execution_status: 'executed',
      created_at: new Date().toISOString(),
    });

    const sim1 = orchestrator.simulateRecoveryOutcome(testIntId, true);
    assert(sim1.success === true && sim1.recovered_amount === 4800, `First recovery simulation attributes revenue: ₹${sim1.recovered_amount}`);

    const sim2 = orchestrator.simulateRecoveryOutcome(testIntId, true);
    assert(sim2.message && sim2.message.includes('already attributed'), `Subsequent simulation blocks double-counting: "${sim2.message}"`);
  }

  // ── TEST 8: Operating Modes Compliance ──────────────────────────
  console.log('\n[8/9] Testing Operating Modes (Observe, Review, Autonomous)');
  {
    const observeMerchant = {
      operating_mode: 'observe',
      guardrails: JSON.stringify(policy.DEFAULT_GUARDRAILS),
    };
    const observeDecision = policy.validateAction({ action: 'create_payment_link', confidence: 0.9 }, { revenue_at_risk: 2000 }, observeMerchant);
    assert(observeDecision.decision === 'REVIEW_REQUIRED' && observeDecision.approved === false, `Observe mode does not approve execution`);

    const reviewMerchant = {
      operating_mode: 'review',
      guardrails: JSON.stringify(policy.DEFAULT_GUARDRAILS),
    };
    const reviewDecision = policy.validateAction({ action: 'create_payment_link', confidence: 0.9 }, { revenue_at_risk: 2000 }, reviewMerchant);
    assert(reviewDecision.decision === 'REVIEW_REQUIRED' && reviewDecision.requires_human === true, `Review mode requires human approval`);
  }

  // ── TEST 9: Deterministic Benchmark Evaluation ──────────────────
  console.log('\n[9/9] Testing Empirical Benchmark Matrix Generation');
  {
    const bench = evalEngine.runBenchmarkEvaluation(42);
    assert(bench.dataset_size === 5000, `Benchmark evaluated across 5,000 payments`);
    assert(bench.results.length === 4, `Evaluated exactly 4 systems`);

    const fullAgent = bench.results.find(r => r.system_type === 'full_agent');
    const naiveRetry = bench.results.find(r => r.system_type === 'baseline_naive_retry');
    const doNothing = bench.results.find(r => r.system_type === 'baseline_do_nothing');

    assert(fullAgent.revenue_recovered > naiveRetry.revenue_recovered, `Full Agent recovers more revenue than Naive Retry: ${fullAgent.revenue_recovered} > ${naiveRetry.revenue_recovered}`);
    assert(fullAgent.revenue_recovered > doNothing.revenue_recovered, `Full Agent outperforms Do Nothing baseline`);
    assert(fullAgent.unauthorized_executions === 0, `Full Agent maintains 0 unauthorized executions`);
    assert(fullAgent.policy_violations === 0, `Full Agent maintains 0 policy violations`);
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.log('\n======================================================');
  console.log(`TEST EXECUTION SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('======================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
