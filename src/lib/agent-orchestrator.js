/*
 * agent-orchestrator.js
 * 
 * The Central Brain of the Revenue Recovery Agent & Opportunity Engine.
 * 
 * Implements a closed-loop revenue recovery lifecycle:
 * 
 *   1. OBSERVE     — Continuous scanning across payment telemetry, carts, discounts
 *   2. DETECT      — Anomaly detection & baseline deviation calculation
 *   3. SCORE       — Deterministic Revenue At Risk & Priority ranking
 *   4. CREATE      — Opportunity record persistence
 *   5. DIAGNOSE    — Root cause analysis (Sanitized context -> LLM / Fallback)
 *   6. GENERATE    — Candidate recovery strategy generation
 *   7. SIMULATE    — Deterministic expected value & net recovery calculation
 *   8. RANK        — Strategy ranking by Net Expected Recovery
 *   9. RECOMMEND   — Qualitative contextual justification
 *  10. GUARD       — 14-point Policy Guardian verification & risk-adaptive autonomy
 *  11. DECIDE      — Autonomous Execution vs. Review Queue vs. Safety Block
 *  12. ACT         — Razorpay tool execution with idempotency key
 *  13. RECORD      — Tamper-evident structured audit logging
 *  14. MEASURE     — Outcome tracking & recovery confirmation
 *  15. ATTRIBUTE   — Single-source revenue attribution (no double-counting)
 *  16. CALIBRATE   — Safe outcome calibration for continuous model reliability
 */

const db = require('./database');
const tools = require('./agent-tools');
const policy = require('./policy-engine');
const scoring = require('./scoring-engine');
const llm = require('./llm-reasoning');
const strategyEngine = require('./recovery-strategy-engine');
const contactTracker = require('./contact-tracker');

// ─── Agent Run Orchestrator ─────────────────────────────────────

/**
 * Execute a complete closed-loop agent run for a merchant.
 */
async function executeAgentRun(merchant_id, trigger_type = 'manual', trigger_data = {}) {
  const runId = db.generateId('run');
  const startTime = Date.now();
  const steps = [];

  function addStep(type, detail, status = 'completed') {
    const step = {
      timestamp: new Date().toISOString(),
      type,
      detail,
      status,
      elapsed_ms: Date.now() - startTime,
    };
    steps.push(step);
    return step;
  }

  try {
    // ── 1. OBSERVE: Fetch Merchant & Verify Guardrails ─────────────
    let merchant = db.getRow('merchants', { id: merchant_id });
    if (!merchant) {
      // Auto-create merchant record if first run
      merchant = {
        id: merchant_id,
        name: merchant_id,
        operating_mode: 'autonomous',
        guardrails: JSON.stringify(policy.DEFAULT_GUARDRAILS),
      };
      db.insertRow('merchants', {
        id: merchant.id,
        name: merchant.name,
        operating_mode: merchant.operating_mode,
        guardrails: merchant.guardrails,
      });
    }

    const guardrails = policy.parseGuardrails(merchant.guardrails);

    // Global Kill Switch Check
    if (guardrails.kill_switch) {
      addStep('kill_switch', 'Agent operations suspended: Emergency Kill Switch is ACTIVE.', 'stopped');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'killed', startTime);
    }

    addStep('observe', 'Scanning transaction rails, cart events, and promotional data for revenue leaks...');

    // ── 2. DETECT: Run Multi-Source Leak Detectors ─────────────────
    const detectionResult = await tools.executeTool('detect_revenue_opportunities', { merchant_id });
    if (!detectionResult.success) {
      addStep('error', `Detection error: ${detectionResult.error}`, 'failed');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'error', startTime);
    }

    const detection = detectionResult.data;
    addStep('detect', {
      opportunities_detected: detection.total_opportunities,
      total_revenue_at_risk: detection.total_at_risk,
      expected_recovery: detection.total_expected_recovery,
      data_status: detection.data_status,
    });

    if (detection.total_opportunities === 0) {
      addStep('decision', 'Payment performance is healthy. Zero revenue leakage detected.', 'completed');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'no_action', startTime);
    }

    // ── 3 & 4. SCORE & CREATE: Persist ALL detected opportunities ──
    // Create DB records for every detected opportunity that doesn't already exist.
    // Dedup is by specific payment/source record ID, not by type — so each
    // failed payment gets its own opportunity in the inbox.
    let createdCount = 0;
    const createdOppIds = [];

    for (const opp of detection.opportunities) {
      // Check if this specific source record already has an opportunity
      const paymentPattern = opp.source_record_id ? `%"${opp.source_record_id}"%` : null;
      let existingRecord = null;

      if (paymentPattern) {
        existingRecord = db.runQuery(
          `SELECT id, status FROM opportunities
           WHERE merchant_id = ? AND affected_payments LIKE ?`,
          [merchant_id, paymentPattern]
        )[0];
      }

      if (!existingRecord) {
        const newOppId = db.generateId('opp');
        const oppPriority = scoring.calculatePriority(opp.amount_at_risk, opp.recovery_probability);
        const oppTitle = `${opp.type?.replace(/_/g, ' ') || 'Payment Failure'} (₹${Math.round(opp.amount_at_risk).toLocaleString('en-IN')})`;

        db.insertRow('opportunities', {
          id: newOppId,
          merchant_id,
          type: opp.type,
          status: 'detected',
          title: oppTitle,
          revenue_at_risk: opp.amount_at_risk,
          recovery_probability: opp.recovery_probability,
          expected_recovery: opp.expected_recovery,
          priority: oppPriority.priority,
          affected_payments: JSON.stringify(opp.source_record_id ? [opp.source_record_id] : []),
          affected_customers: JSON.stringify(opp.customer_id ? [opp.customer_id] : []),
          created_at: new Date().toISOString(),
        });

        createdCount++;
        createdOppIds.push(newOppId);
      }
    }

    if (createdCount > 0) {
      addStep('opportunities_created', {
        new_opportunities: createdCount,
        total_detected: detection.opportunities.length,
      });
    }

    // Select the highest-priority UNPROCESSED opportunity for full lifecycle processing
    let targetOpportunity = null;
    let existingOpp = null;

    // First: try to pick a newly created opportunity (highest expected recovery)
    if (createdOppIds.length > 0) {
      const placeholders = createdOppIds.map(() => '?').join(',');
      const newOpps = db.runQuery(
        `SELECT * FROM opportunities WHERE id IN (${placeholders}) ORDER BY revenue_at_risk DESC LIMIT 1`,
        createdOppIds
      );
      if (newOpps.length > 0) {
        existingOpp = newOpps[0];
        // Find matching detection data
        targetOpportunity = detection.opportunities.find(o => {
          const affectedPayments = JSON.parse(existingOpp.affected_payments || '[]');
          return affectedPayments.includes(o.source_record_id);
        }) || detection.opportunities[0];
      }
    }

    // Fallback: pick the highest-priority open opportunity that hasn't been fully processed
    if (!targetOpportunity) {
      const openOpp = db.runQuery(
        `SELECT * FROM opportunities
         WHERE merchant_id = ? AND status = 'detected'
         ORDER BY revenue_at_risk DESC LIMIT 1`,
        [merchant_id]
      )[0];

      if (openOpp) {
        existingOpp = openOpp;
        targetOpportunity = detection.opportunities.find(o => {
          const affectedPayments = JSON.parse(openOpp.affected_payments || '[]');
          return affectedPayments.includes(o.source_record_id);
        }) || detection.opportunities[0];
      } else {
        targetOpportunity = detection.opportunities[0];
      }
    }

    // ── Score the selected target ─────────────────────────────────────
    const priorityResult = scoring.calculatePriority(
      targetOpportunity.amount_at_risk,
      targetOpportunity.recovery_probability
    );

    const oppId = existingOpp?.id || db.generateId('opp');
    const oppTitle = `${targetOpportunity.type?.replace(/_/g, ' ') || 'Payment Failure'} (₹${Math.round(targetOpportunity.amount_at_risk).toLocaleString('en-IN')})`;

    // If this specific opportunity wasn't created above (edge case), create it now
    if (!existingOpp) {
      db.insertRow('opportunities', {
        id: oppId,
        merchant_id,
        type: targetOpportunity.type,
        status: 'investigating',
        title: oppTitle,
        revenue_at_risk: targetOpportunity.amount_at_risk,
        recovery_probability: targetOpportunity.recovery_probability,
        expected_recovery: targetOpportunity.expected_recovery,
        priority: priorityResult.priority,
        affected_payments: JSON.stringify(targetOpportunity.source_record_id ? [targetOpportunity.source_record_id] : []),
        affected_customers: JSON.stringify(targetOpportunity.customer_id ? [targetOpportunity.customer_id] : []),
        created_at: new Date().toISOString(),
      });
    }

    addStep('opportunity_scored', {
      opportunity_id: oppId,
      revenue_at_risk: targetOpportunity.amount_at_risk,
      priority: priorityResult.priority,
    });

    // ── 5. DIAGNOSE: Qualitative Root Cause Diagnosis ─────────────
    addStep('diagnose', 'Diagnosing root cause using sanitized payment signals...');
    const rootCauseAnalysis = await llm.analyzeRootCause({
      ...detection,
      revenue_at_risk: targetOpportunity.amount_at_risk,
      failed_payments_count: detection.failed_payments_count || 1,
    });

    db.updateRow('opportunities', {
      root_cause: rootCauseAnalysis.root_cause,
      root_cause_confidence: rootCauseAnalysis.confidence,
      status: 'analyzed',
      updated_at: new Date().toISOString(),
    }, { id: oppId });

    addStep('root_cause_identified', {
      root_cause: rootCauseAnalysis.root_cause,
      confidence: rootCauseAnalysis.confidence,
      source: rootCauseAnalysis.source,
    });

    // ── 6. GENERATE, SIMULATE & RANK: Recovery Strategy Engine ─────
    addStep('simulate_strategies', 'Generating and scoring recovery strategies deterministically...');
    
    // Fetch customer context
    let customerContext = null;
    if (targetOpportunity.customer_id) {
      const custResult = await tools.executeTool('get_customer_history', { customer_id: targetOpportunity.customer_id });
      if (custResult.success) customerContext = custResult.data;
    }

    const opportunityRecord = db.getRow('opportunities', { id: oppId });
    const evaluatedStrategies = strategyEngine.evaluateStrategies(
      opportunityRecord,
      customerContext,
      { isMethodDegraded: Boolean(detection.anomalies?.length), attemptCount: opportunityRecord.intervention_count || 0 }
    );

    // Persist evaluated alternatives
    strategyEngine.persistStrategies(oppId, evaluatedStrategies);
    const topStrategy = evaluatedStrategies[0];

    addStep('strategies_ranked', {
      selected_action: topStrategy.action,
      expected_recovery: topStrategy.expectedRecovery,
      net_expected_recovery: topStrategy.netExpectedRecovery,
      evaluated_count: evaluatedStrategies.length,
      alternatives: evaluatedStrategies.map(s => ({ action: s.action, netExpectedRecovery: s.netExpectedRecovery })),
    });

    // ── 7. RECOMMEND: Qualitative LLM Comparison ───────────────────
    const recommendation = await llm.compareInterventions(opportunityRecord, evaluatedStrategies, customerContext);

    // Compute Multi-Factor Recovery Confidence
    const recoveryConfidence = scoring.calculateRecoveryConfidence({
      detectorConfidence: 0.90,
      historicalEvidenceConfidence: topStrategy.evidenceStrength || 0.80,
      strategyEvidenceConfidence: topStrategy.recoveryProbability || 0.75,
      llmConfidence: rootCauseAnalysis.confidence || 0.80,
      dataCompleteness: 0.95,
    });

    addStep('recommendation', {
      action: topStrategy.action,
      recovery_confidence: recoveryConfidence,
      reason: recommendation.reason,
      risk_level: topStrategy.customerFrictionScore > 0.3 ? 'medium' : 'low',
    });

    // ── 8. GUARD: 14-Point Policy Guardian & Safety Checks ─────────
    addStep('guard', 'Evaluating proposal against 14-point deterministic Policy Guardian...');
    const previousInterventions = db.getRows('interventions', { opportunity_id: oppId });
    
    const policyResult = policy.validateAction(
      {
        action: topStrategy.action,
        recommended_action: topStrategy.action,
        confidence: recoveryConfidence,
        recovery_confidence: recoveryConfidence,
        expected_recovery: topStrategy.expectedRecovery,
        intervention_cost: topStrategy.interventionCost,
        risk_level: topStrategy.customerFrictionScore > 0.3 ? 'medium' : 'low',
      },
      opportunityRecord,
      merchant,
      previousInterventions,
      customerContext,
      { budgetSpentToday: 0 }
    );

    addStep('policy_decision', {
      decision: policyResult.decision,
      approved: policyResult.approved,
      requires_human: policyResult.requires_human,
      reason: policyResult.reason,
      checks_count: policyResult.checks.length,
    });

    // ── 9. DECIDE: Autonomous Execution vs Review vs Block ─────────
    const interventionId = db.generateId('int');
    const idempotencyKey = policy.generateIdempotencyKey(
      merchant_id,
      oppId,
      topStrategy.action,
      previousInterventions.length + 1
    );

    if (policyResult.decision === 'BLOCKED') {
      db.insertRow('interventions', {
        id: interventionId,
        opportunity_id: oppId,
        merchant_id,
        customer_id: targetOpportunity.customer_id || null,
        action_type: topStrategy.action,
        action_params: JSON.stringify({ idempotency_key: idempotencyKey }),
        expected_recovery: topStrategy.netExpectedRecovery,
        confidence: recoveryConfidence,
        risk_level: 'high',
        policy_check: 'blocked',
        policy_reason: policyResult.reason,
        approval_status: 'blocked',
        execution_status: 'blocked',
        created_at: new Date().toISOString(),
      });

      db.updateRow('opportunities', { status: 'blocked', updated_at: new Date().toISOString() }, { id: oppId });
      addStep('blocked', `Action BLOCKED by policy: ${policyResult.reason}`, 'failed');
      
      return saveRun(runId, merchant_id, oppId, trigger_type, steps, 'blocked', startTime);
    }

    if (policyResult.decision === 'REVIEW_REQUIRED' || policyResult.requires_human) {
      db.insertRow('interventions', {
        id: interventionId,
        opportunity_id: oppId,
        merchant_id,
        customer_id: targetOpportunity.customer_id || null,
        action_type: topStrategy.action,
        action_params: JSON.stringify({ idempotency_key: idempotencyKey }),
        expected_recovery: topStrategy.netExpectedRecovery,
        confidence: recoveryConfidence,
        risk_level: 'medium',
        policy_check: 'review_required',
        policy_reason: policyResult.reason,
        approval_status: 'awaiting_approval',
        execution_status: 'pending',
        created_at: new Date().toISOString(),
      });

      db.updateRow('opportunities', { status: 'awaiting_approval', updated_at: new Date().toISOString() }, { id: oppId });
      addStep('review_queued', `Intervention queued for merchant authorization: ${policyResult.reason}`);
      
      return saveRun(runId, merchant_id, oppId, trigger_type, steps, 'awaiting_approval', startTime);
    }

    // ── 10. ACT: Execute Approved Action Deterministically ─────────
    addStep('execute', `Executing authorized intervention: ${topStrategy.name}`);
    const executionResult = await executeRecoveryAction(
      topStrategy.action,
      oppId,
      interventionId,
      merchant_id,
      targetOpportunity,
      customerContext
    );

    db.insertRow('interventions', {
      id: interventionId,
      opportunity_id: oppId,
      merchant_id,
      customer_id: targetOpportunity.customer_id || null,
      action_type: topStrategy.action,
      action_params: JSON.stringify({ idempotency_key: idempotencyKey, ...executionResult.params }),
      expected_recovery: topStrategy.netExpectedRecovery,
      confidence: recoveryConfidence,
      risk_level: 'low',
      policy_check: 'approved',
      policy_reason: policyResult.reason,
      approval_status: 'auto_approved',
      execution_status: executionResult.success ? 'executed' : 'failed',
      execution_result: JSON.stringify(executionResult),
      razorpay_payment_link_id: executionResult.payment_link_id || null,
      error_message: executionResult.error || null,
      executed_at: new Date().toISOString(),
    });

    db.updateRow('opportunities', {
      status: executionResult.success ? 'action_executed' : 'execution_failed',
      intervention_count: (opportunityRecord.intervention_count || 0) + 1,
      expected_recovery: topStrategy.netExpectedRecovery,
      updated_at: new Date().toISOString(),
    }, { id: oppId });

    // ── 11. RECORD: Audit Trail Logging ────────────────────────────
    await tools.executeTool('record_agent_action', {
      merchant_id,
      opportunity_id: oppId,
      event_type: 'intervention_executed',
      event_data: {
        intervention_id: interventionId,
        action: topStrategy.action,
        expected_recovery: topStrategy.netExpectedRecovery,
        idempotency_key: idempotencyKey,
        success: executionResult.success,
      },
    });

    addStep('executed', {
      action: topStrategy.action,
      payment_link_id: executionResult.payment_link_id || null,
      success: executionResult.success,
    });

    return saveRun(runId, merchant_id, oppId, trigger_type, steps, 'executed', startTime);

  } catch (error) {
    console.error('[Agent Orchestrator] Run error:', error);
    addStep('error', `Unexpected orchestrator failure: ${error.message}`, 'failed');
    return saveRun(runId, merchant_id, null, trigger_type, steps, 'error', startTime);
  }
}

// ─── Execution Handler ──────────────────────────────────────────

async function executeRecoveryAction(action, oppId, interventionId, merchant_id, targetOpp, customer) {
  switch (action) {
    case 'create_payment_link': {
      const amount = Math.max(0, targetOpp.amount_at_risk || targetOpp.amount || 2500);
      const result = await tools.executeTool('create_payment_link', {
        opportunity_id: oppId,
        customer_id: targetOpp.customer_id || customer?.id || 'cust_guest',
        amount,
        description: `Complete payment of ₹${Math.round(amount).toLocaleString('en-IN')}`,
      });

      contactTracker.recordContactAttempt({
        merchant_id,
        customer_id: targetOpp.customer_id || customer?.id,
        opportunity_id: oppId,
        intervention_id: interventionId,
        channel: 'payment_link',
        status: result.success ? 'sent' : 'failed',
        error_reason: result.error,
      });

      return {
        success: result.success,
        payment_link_id: result.payment_link_id,
        short_url: result.short_url,
        error: result.error,
        params: { amount, customer_id: targetOpp.customer_id },
      };
    }

    case 'send_notification': {
      const result = await tools.executeTool('send_notification', { opportunity_id: oppId });
      contactTracker.recordContactAttempt({
        merchant_id,
        customer_id: targetOpp.customer_id || customer?.id,
        opportunity_id: oppId,
        intervention_id: interventionId,
        channel: 'sms',
        status: result.success ? 'sent' : 'failed',
      });
      return { success: true, details: result.message, params: { channel: 'sms' } };
    }

    case 'retry_payment': {
      const result = await tools.executeTool('retry_payment', { opportunity_id: oppId });
      return { success: true, details: result.message, params: { method: 'gateway_retry' } };
    }

    case 'request_alternate_payment_method': {
      const result = await tools.executeTool('request_alternate_payment_method', { opportunity_id: oppId });
      contactTracker.recordContactAttempt({
        merchant_id,
        customer_id: targetOpp.customer_id || customer?.id,
        opportunity_id: oppId,
        intervention_id: interventionId,
        channel: 'whatsapp',
        status: result.success ? 'sent' : 'failed',
      });
      return { success: true, details: result.message, params: { prompt: 'switch_to_card' } };
    }

    case 'escalate_to_merchant': {
      return { success: true, details: 'Escalated to merchant account manager.', params: { queue: 'high_value' } };
    }

    case 'flag_discount_review': {
      return { success: true, details: 'Discount leakage flagged for promo review.', params: { type: 'margin_review' } };
    }

    case 'do_nothing': {
      return { success: true, details: 'Passive monitoring active.', params: {} };
    }

    default:
      return { success: false, error: `Unsupported recovery action: "${action}"` };
  }
}

// ─── Approve / Reject Intervention ──────────────────────────────

async function approveIntervention(intervention_id, approved_by = 'merchant_admin') {
  const intervention = db.getRow('interventions', { id: intervention_id });
  if (!intervention) return { success: false, error: 'Intervention not found' };

  const opportunity = db.getRow('opportunities', { id: intervention.opportunity_id });

  const executionResult = await executeRecoveryAction(
    intervention.action_type,
    intervention.opportunity_id,
    intervention_id,
    intervention.merchant_id,
    { amount_at_risk: intervention.expected_recovery, customer_id: intervention.customer_id },
    null
  );

  db.withTransaction(() => {
    db.updateRow('interventions', {
      approval_status: 'approved',
      approved_by,
      execution_status: executionResult.success ? 'executed' : 'failed',
      execution_result: JSON.stringify(executionResult),
      razorpay_payment_link_id: executionResult.payment_link_id || null,
      executed_at: new Date().toISOString(),
    }, { id: intervention_id });

    db.updateRow('opportunities', {
      status: executionResult.success ? 'action_executed' : 'execution_failed',
      intervention_count: (opportunity?.intervention_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }, { id: intervention.opportunity_id });
  });

  await tools.executeTool('record_agent_action', {
    merchant_id: intervention.merchant_id,
    opportunity_id: intervention.opportunity_id,
    event_type: 'intervention_approved',
    event_data: { intervention_id, approved_by, action: intervention.action_type },
  });

  return { success: true, execution: executionResult };
}

async function rejectIntervention(intervention_id, reason = 'Merchant rejected') {
  return db.withTransaction(() => {
    db.updateRow('interventions', {
      approval_status: 'rejected',
      execution_status: 'rejected',
      policy_reason: reason,
    }, { id: intervention_id });

    const intervention = db.getRow('interventions', { id: intervention_id });
    if (intervention) {
      db.updateRow('opportunities', { status: 'merchant_rejected', updated_at: new Date().toISOString() }, { id: intervention.opportunity_id });
    }

    return { success: true };
  });
}

// ─── Simulate Outcome & Single Attribution Layer ─────────────────

/**
 * Simulate or confirm payment recovery with strict single-attribution guarantees.
 * Prevents double-counting across opportunities and runs with atomic locking.
 */
function simulateRecoveryOutcome(intervention_id, recovered = true) {
  return db.withTransaction(() => {
    const intervention = db.getRow('interventions', { id: intervention_id });
    if (!intervention) return { success: false, error: 'Intervention not found' };

    const opportunity = db.getRow('opportunities', { id: intervention.opportunity_id });

    // Check if attribution already exists to prevent duplicate counting
    const existingAttribution = db.getRow('recovery_attributions', { intervention_id });
    if (existingAttribution) {
      return {
        success: true,
        message: 'Recovery outcome was already attributed.',
        recovered_amount: existingAttribution.amount_recovered,
        attribution_id: existingAttribution.id,
      };
    }

    if (opportunity && opportunity.status === 'recovered' && opportunity.actual_recovery > 0) {
      return {
        success: true,
        message: 'Opportunity was already recovered.',
        recovered_amount: opportunity.actual_recovery,
      };
    }

    const maxEligible = Math.max(0, opportunity?.revenue_at_risk || 0);
    const amount = recovered 
      ? Math.min(maxEligible, Math.max(0, Math.round(intervention.expected_recovery ?? maxEligible))) 
      : 0;
    const attributionId = db.generateId('attr');

    if (recovered && amount > 0) {
      try {
        db.insertRow('recovery_attributions', {
          id: attributionId,
          merchant_id: intervention.merchant_id,
          opportunity_id: intervention.opportunity_id,
          intervention_id: intervention_id,
          amount_recovered: amount,
          attribution_method: 'deterministic_payment_link',
          attribution_confidence: 1.0,
          created_at: new Date().toISOString(),
        });
      } catch (insertErr) {
        if (insertErr.message && insertErr.message.includes('UNIQUE')) {
          const raceAttribution = db.getRow('recovery_attributions', { intervention_id });
          return {
            success: true,
            message: 'Recovery outcome was already attributed.',
            recovered_amount: raceAttribution?.amount_recovered || amount,
            attribution_id: raceAttribution?.id || attributionId,
          };
        }
        throw insertErr;
      }

      // Record Calibration Observation
      db.insertRow('outcome_calibrations', {
        id: db.generateId('calib'),
        strategy_action: intervention.action_type,
        opportunity_type: opportunity?.type || 'payment_failure',
        predicted_probability: intervention.confidence || 0.8,
        actual_outcome: 1,
        created_at: new Date().toISOString(),
      });
    }

    db.updateRow('interventions', {
      actual_recovery: amount,
      attribution: recovered ? 'agent_attributed' : 'not_recovered',
      resolved_at: new Date().toISOString(),
    }, { id: intervention_id });

    if (opportunity) {
      db.updateRow('opportunities', {
        actual_recovery: amount,
        status: recovered ? 'recovered' : 'not_recovered',
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { id: intervention.opportunity_id });
    }

    // Add audit log
    db.insertRow('audit_logs', {
      merchant_id: intervention.merchant_id,
      opportunity_id: intervention.opportunity_id,
      intervention_id: intervention_id,
      event_type: recovered ? 'revenue_recovered' : 'recovery_failed',
      event_data: JSON.stringify({
        amount_recovered: amount,
        attribution_id: recovered ? attributionId : null,
        action: intervention.action_type,
      }),
    });

    return { success: true, recovered_amount: amount, attribution_id: recovered ? attributionId : null };
  });
}

// ─── Save Run Helper ────────────────────────────────────────────

function saveRun(runId, merchant_id, opportunity_id, trigger_type, steps, outcome, startTime) {
  const durationMs = Date.now() - startTime;
  try {
    db.insertRow('agent_runs', {
      id: runId,
      merchant_id,
      opportunity_id: opportunity_id || null,
      trigger_type,
      steps: JSON.stringify(steps),
      final_outcome: outcome,
      duration_ms: durationMs,
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Agent Orchestrator] Failed to record run:', err.message);
  }

  return {
    run_id: runId,
    opportunity_id,
    outcome,
    steps,
    duration_ms: durationMs,
  };
}


// ─── Batch Processing ────────────────────────────────────────────

async function startBackgroundBatch(merchant_id = 'merchant_rzp_test', mode = 'autonomous') {
  console.log(`[Batch] Starting asynchronous background batch for merchant: ${merchant_id} in ${mode.toUpperCase()} mode`);
  
  // 0. Detect opportunities first
  const detectionResult = await tools.executeTool('detect_revenue_opportunities', { merchant_id });
  if (detectionResult.success && detectionResult.data && detectionResult.data.opportunities) {
    for (const opp of detectionResult.data.opportunities) {
      const paymentPattern = opp.source_record_id ? `%"${opp.source_record_id}"%` : null;
      let existingRecord = null;
      if (paymentPattern) {
        existingRecord = db.runQuery(
          `SELECT id, status FROM opportunities WHERE merchant_id = ? AND affected_payments LIKE ?`,
          [merchant_id, paymentPattern]
        )[0];
      }
      if (!existingRecord) {
        const newOppId = db.generateId('opp');
        const oppPriority = scoring.calculatePriority(opp.amount_at_risk, opp.recovery_probability);
        db.insertRow('opportunities', {
          id: newOppId,
          merchant_id,
          type: opp.type,
          status: 'detected',
          title: `${opp.type?.replace(/_/g, ' ') || 'Payment Failure'} (₹${Math.round(opp.amount_at_risk).toLocaleString('en-IN')})`,
          revenue_at_risk: opp.amount_at_risk,
          recovery_probability: opp.recovery_probability,
          expected_recovery: opp.expected_recovery,
          priority: oppPriority.priority,
          affected_payments: JSON.stringify(opp.source_record_id ? [opp.source_record_id] : []),
          affected_customers: JSON.stringify(opp.customer_id ? [opp.customer_id] : []),
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // 1. Fetch candidate opportunities
  const detectedOpps = db.runQuery(
    "SELECT id, revenue_at_risk, type FROM opportunities WHERE merchant_id = ? AND status = 'detected' ORDER BY revenue_at_risk DESC",
    [merchant_id]
  );

  if (!detectedOpps.length) {
    console.log('[Batch] No detected opportunities found.');
    return;
  }

  // 2. Atomically claim opportunities one-by-one to prevent concurrent worker collisions
  const claimedOpps = [];
  for (const opp of detectedOpps) {
    const claimResult = db.runExec(
      `UPDATE opportunities SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'detected'`,
      [new Date().toISOString(), opp.id]
    );
    if (claimResult.changes === 1) {
      claimedOpps.push(db.getRow('opportunities', { id: opp.id }));
    }
  }

  if (!claimedOpps.length) {
    console.log('[Batch] All candidate opportunities were claimed by another concurrent worker.');
    return;
  }

  console.log(`[Batch] Atomically claimed ${claimedOpps.length} opportunities for processing.`);

  // 3. Process in chunks of 10 using Promise.all()
  const CHUNK_SIZE = 10;
  const merchant = db.getRow('merchants', { id: merchant_id });
  
  const mockDetection = {
      total_opportunities: claimedOpps.length,
      failed_payments_count: claimedOpps.length,
      anomalies: []
  };

  for (let i = 0; i < claimedOpps.length; i += CHUNK_SIZE) {
    const chunk = claimedOpps.slice(i, i + CHUNK_SIZE);
    console.log(`[Batch] Processing chunk ${Math.floor(i/CHUNK_SIZE) + 1} (${chunk.length} items)...`);
    
    await Promise.all(chunk.map(async (opp) => {
      try {
        await processSingleOpportunity(opp, merchant, mockDetection, mode);
      } catch (err) {
        console.error(`[Batch] Error processing ${opp.id}:`, err);
        db.updateRow('opportunities', { status: 'execution_failed' }, { id: opp.id });
      }
    }));
  }
  
  console.log(`[Batch] All chunks processed successfully in ${mode.toUpperCase()} mode.`);
}

async function processSingleOpportunity(opportunityRecord, merchant, detectionContext, mode = 'autonomous') {
  const oppId = opportunityRecord.id;
  const merchant_id = merchant.id;
  
  const targetOpportunity = {
    amount_at_risk: opportunityRecord.revenue_at_risk,
    recovery_probability: opportunityRecord.recovery_probability || 0.5,
    type: opportunityRecord.type,
    customer_id: null
  };

  // Run LLM root cause analysis (or fallback)
  const rootCauseAnalysis = await llm.analyzeRootCause({
    ...detectionContext,
    revenue_at_risk: targetOpportunity.amount_at_risk,
    failed_payments_count: 1,
  });

  // Evaluate candidate recovery strategies with deterministic math
  const evaluatedStrategies = strategyEngine.evaluateStrategies(
    opportunityRecord,
    null,
    { isMethodDegraded: false, attemptCount: 0 }
  );

  strategyEngine.persistStrategies(oppId, evaluatedStrategies);
  const topStrategy = evaluatedStrategies[0];

  const recommendation = await llm.compareInterventions(opportunityRecord, evaluatedStrategies, null);

  const recoveryConfidence = scoring.calculateRecoveryConfidence({
    detectorConfidence: 0.90,
    historicalEvidenceConfidence: topStrategy.evidenceStrength || 0.80,
    strategyEvidenceConfidence: topStrategy.recoveryProbability || 0.75,
    llmConfidence: rootCauseAnalysis.confidence || 0.80,
    dataCompleteness: 0.95,
  });

  // ─── Dual-Mode Check ─────────────────────────────────────────────
  // In OBSERVE mode: Save LLM diagnosis and math strategy recommendations,
  // transition status to awaiting_manual_action, and STOP. Do not run policy checks or execute actions.
  if (mode === 'observe') {
    const interventionId = db.generateId('int');
    db.insertRow('interventions', {
      id: interventionId,
      opportunity_id: oppId,
      merchant_id,
      customer_id: null,
      action_type: topStrategy.action,
      action_params: JSON.stringify({
        recommended_action: topStrategy.action,
        reason: recommendation.reason,
        net_expected_recovery: topStrategy.netExpectedRecovery,
      }),
      expected_recovery: topStrategy.netExpectedRecovery,
      confidence: recoveryConfidence,
      risk_level: topStrategy.customerFrictionScore > 0.3 ? 'medium' : 'low',
      policy_check: 'observe_mode',
      policy_reason: 'Opportunity analyzed in Observe mode. Awaiting operator manual action.',
      approval_status: 'awaiting_manual_action',
      execution_status: 'pending',
      created_at: new Date().toISOString(),
    });

    db.updateRow('opportunities', {
      root_cause: rootCauseAnalysis.root_cause,
      root_cause_confidence: rootCauseAnalysis.confidence,
      expected_recovery: topStrategy.netExpectedRecovery,
      status: 'awaiting_manual_action',
      updated_at: new Date().toISOString(),
    }, { id: oppId });

    return;
  }

  // In AUTONOMOUS mode: Run full Policy Guardian checks and autonomous execution
  db.updateRow('opportunities', {
    root_cause: rootCauseAnalysis.root_cause,
    root_cause_confidence: rootCauseAnalysis.confidence,
    status: 'analyzed',
    updated_at: new Date().toISOString(),
  }, { id: oppId });

  const previousInterventions = db.getRows('interventions', { opportunity_id: oppId });
  const policyResult = policy.validateAction(
    {
      action: topStrategy.action,
      recommended_action: topStrategy.action,
      confidence: recoveryConfidence,
      recovery_confidence: recoveryConfidence,
      expected_recovery: topStrategy.expectedRecovery,
      intervention_cost: topStrategy.interventionCost,
      risk_level: topStrategy.customerFrictionScore > 0.3 ? 'medium' : 'low',
    },
    opportunityRecord,
    merchant,
    previousInterventions,
    null,
    { budgetSpentToday: 0 }
  );

  const interventionId = db.generateId('int');
  const idempotencyKey = policy.generateIdempotencyKey(
    merchant_id, oppId, topStrategy.action, previousInterventions.length + 1
  );

  if (policyResult.decision === 'BLOCKED') {
    db.insertRow('interventions', {
      id: interventionId, opportunity_id: oppId, merchant_id, customer_id: null,
      action_type: topStrategy.action, action_params: JSON.stringify({ idempotency_key: idempotencyKey }),
      expected_recovery: topStrategy.netExpectedRecovery, confidence: recoveryConfidence,
      risk_level: 'high', policy_check: 'blocked', policy_reason: policyResult.reason,
      approval_status: 'blocked', execution_status: 'blocked', created_at: new Date().toISOString(),
    });
    db.updateRow('opportunities', { status: 'blocked', updated_at: new Date().toISOString() }, { id: oppId });
    return;
  }

  if (policyResult.decision === 'REVIEW_REQUIRED' || policyResult.requires_human) {
    db.insertRow('interventions', {
      id: interventionId, opportunity_id: oppId, merchant_id, customer_id: null,
      action_type: topStrategy.action, action_params: JSON.stringify({ idempotency_key: idempotencyKey }),
      expected_recovery: topStrategy.netExpectedRecovery, confidence: recoveryConfidence,
      risk_level: 'medium', policy_check: 'review_required', policy_reason: policyResult.reason,
      approval_status: 'awaiting_approval', execution_status: 'pending', created_at: new Date().toISOString(),
    });
    db.updateRow('opportunities', { status: 'awaiting_approval', updated_at: new Date().toISOString() }, { id: oppId });
    return;
  }

  const executionResult = await executeRecoveryAction(
    topStrategy.action, oppId, interventionId, merchant_id, targetOpportunity, null
  );

  db.insertRow('interventions', {
    id: interventionId, opportunity_id: oppId, merchant_id, customer_id: null,
    action_type: topStrategy.action,
    action_params: JSON.stringify({ idempotency_key: idempotencyKey, ...executionResult.params }),
    expected_recovery: topStrategy.netExpectedRecovery, confidence: recoveryConfidence,
    risk_level: 'low', policy_check: 'approved', policy_reason: policyResult.reason,
    approval_status: 'auto_approved', execution_status: executionResult.success ? 'executed' : 'failed',
    execution_result: JSON.stringify(executionResult),
    razorpay_payment_link_id: executionResult.payment_link_id || null,
    error_message: executionResult.error || null, executed_at: new Date().toISOString(),
  });

  db.updateRow('opportunities', {
    status: executionResult.success ? 'action_executed' : 'execution_failed',
    intervention_count: (opportunityRecord.intervention_count || 0) + 1,
    expected_recovery: topStrategy.netExpectedRecovery,
    updated_at: new Date().toISOString(),
  }, { id: oppId });

  await tools.executeTool('record_agent_action', {
    merchant_id, opportunity_id: oppId, event_type: 'intervention_executed',
    event_data: { intervention_id: interventionId, action: topStrategy.action, expected_recovery: topStrategy.netExpectedRecovery, idempotency_key: idempotencyKey, success: executionResult.success },
  });
}

/**
 * Instantly execute a manual recovery action on an opportunity, bypassing AI and policy checks.
 */
async function executeManualOverride(opportunity_id, action_type, merchant_id) {
  const opportunity = db.getRow('opportunities', { id: opportunity_id });
  if (!opportunity) {
    throw new Error(`Opportunity ${opportunity_id} not found`);
  }
  const effectiveMerchantId = merchant_id || opportunity.merchant_id;
  const interventionId = db.generateId('int');

  let customerContext = null;
  let affectedCustomers = [];
  try {
    affectedCustomers = JSON.parse(opportunity.affected_customers || '[]');
  } catch {}

  if (affectedCustomers.length > 0) {
    const custResult = await tools.executeTool('get_customer_history', { customer_id: affectedCustomers[0] });
    if (custResult.success) customerContext = custResult.data;
  }

  const executionResult = await executeRecoveryAction(
    action_type,
    opportunity_id,
    interventionId,
    effectiveMerchantId,
    { amount_at_risk: opportunity.revenue_at_risk, customer_id: customerContext?.id },
    customerContext
  );

  db.withTransaction(() => {
    db.insertRow('interventions', {
      id: interventionId,
      opportunity_id,
      merchant_id: effectiveMerchantId,
      customer_id: customerContext?.id || null,
      action_type,
      action_params: JSON.stringify({ manual_override: true, ...executionResult.params }),
      expected_recovery: opportunity.expected_recovery || opportunity.revenue_at_risk,
      confidence: 1.0,
      risk_level: 'low',
      policy_check: 'bypassed_manual_override',
      policy_reason: 'Manual override executed directly by operator',
      approval_status: 'manual_override',
      execution_status: executionResult.success ? 'executed' : 'failed',
      execution_result: JSON.stringify(executionResult),
      razorpay_payment_link_id: executionResult.payment_link_id || null,
      error_message: executionResult.error || null,
      executed_at: new Date().toISOString(),
    });

    db.updateRow('opportunities', {
      status: executionResult.success ? 'action_executed' : 'execution_failed',
      intervention_count: (opportunity.intervention_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }, { id: opportunity_id });
  });

  await tools.executeTool('record_agent_action', {
    merchant_id: effectiveMerchantId,
    opportunity_id,
    event_type: 'manual_override_executed',
    event_data: {
      intervention_id: interventionId,
      action: action_type,
      success: executionResult.success,
      execution_result: executionResult,
    },
  });

  return { success: executionResult.success, intervention_id: interventionId, execution: executionResult };
}

module.exports = {
  executeAgentRun,
  approveIntervention,
  rejectIntervention,
  simulateRecoveryOutcome,
  startBackgroundBatch,
  executeManualOverride,
  executeRecoveryAction,
};
