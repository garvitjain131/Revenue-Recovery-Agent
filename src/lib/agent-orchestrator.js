/*
 * agent-orchestrator.js
 * 
 * The core agent loop. This is the brain of the Revenue Intelligence Agent.
 * 
 * A genuine agentic loop — NOT a single LLM call:
 * 
 *   1. Event arrives
 *   2. Agent updates state
 *   3. Agent detects opportunity  (tool: detect_revenue_opportunities)
 *   4. Agent gathers context      (tool: get_customer_history, get_payment_failures)
 *   5. Agent asks LLM to reason   (llm: analyzeRootCause)
 *   6. LLM returns structured decision
 *   7. Agent validates decision    (schema validation)
 *   8. Agent checks policy         (policy-engine)
 *   9. Agent executes tool if allowed (tool: create_payment_link, etc.)
 *  10. Agent observes result
 *  11. Agent updates state
 *  12. Agent decides: stop / retry / escalate
 * 
 * Each step is logged to agent_runs for full observability.
 */

const db = require('./database');
const tools = require('./agent-tools');
const policy = require('./policy-engine');
const scoring = require('./scoring-engine');
const llm = require('./llm-reasoning');

// ─── Agent Run ─────────────────────────────────────────────────

/**
 * Execute a complete agent run for a merchant.
 * This is the main entry point — called by API routes or webhooks.
 * 
 * Returns the complete run with all steps, decisions, and outcomes.
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
    // Get merchant
    const merchant = db.getRow('merchants', { id: merchant_id });
    if (!merchant) {
      addStep('error', 'Merchant not found', 'failed');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'error', startTime);
    }

    // Check kill switch
    const guardrails = policy.parseGuardrails(merchant.guardrails);
    if (guardrails.kill_switch) {
      addStep('kill_switch', 'Agent is disabled by kill switch', 'stopped');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'killed', startTime);
    }

    // ── Step 1: Observe — Detect opportunities ──────────────────
    addStep('observe', 'Scanning payment data for revenue opportunities...');
    const detectionResult = await tools.executeTool('detect_revenue_opportunities', { merchant_id });

    if (!detectionResult.success) {
      addStep('error', `Detection failed: ${detectionResult.error}`, 'failed');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'error', startTime);
    }

    const detection = detectionResult.data;
    addStep('detect', {
      anomalies_found: detection.anomalies.length,
      failed_payments: detection.failed_payments_count,
      revenue_at_risk: detection.revenue_at_risk,
      failure_rate: detection.current_metrics.failure_rate,
    });

    // If no significant issues, stop
    if (detection.anomalies.length === 0 && detection.failed_payments_count === 0) {
      addStep('decision', 'No revenue opportunities detected. Agent stopping.', 'completed');
      return saveRun(runId, merchant_id, null, trigger_type, steps, 'no_action', startTime);
    }

    // ── Step 2: Create or update opportunity ────────────────────
    const oppId = db.generateId('opp');
    const priorityResult = scoring.calculatePriority(
      detection.revenue_at_risk,
      detection.average_recovery_probability
    );

    db.insertRow('opportunities', {
      id: oppId,
      merchant_id,
      type: detection.anomalies.length > 0 ? detection.anomalies[0].type : 'payment_failures',
      status: 'investigating',
      title: detection.anomalies.length > 0
        ? detection.anomalies[0].description
        : `${detection.failed_payments_count} failed payments detected`,
      revenue_at_risk: detection.revenue_at_risk,
      recovery_probability: detection.average_recovery_probability,
      expected_recovery: detection.expected_recovery,
      priority: priorityResult.priority,
      affected_payments: JSON.stringify(detection.top_affected_payments.map(p => p.id).slice(0, 50)),
      affected_customers: JSON.stringify([...new Set(detection.top_affected_payments.map(p => p.customer_id).filter(Boolean))]),
    });

    addStep('opportunity_created', {
      opportunity_id: oppId,
      type: detection.anomalies.length > 0 ? detection.anomalies[0].type : 'payment_failures',
      revenue_at_risk: detection.revenue_at_risk,
      priority: priorityResult.priority,
    });

    // Log to audit trail
    await tools.executeTool('record_agent_action', {
      merchant_id,
      opportunity_id: oppId,
      event_type: 'opportunity_detected',
      event_data: {
        revenue_at_risk: detection.revenue_at_risk,
        failed_count: detection.failed_payments_count,
        anomalies: detection.anomalies.length,
      },
    });

    // ── Step 3: Investigate — LLM root cause analysis ───────────
    addStep('investigate', 'Analyzing root cause with AI...');
    const rootCauseAnalysis = await llm.analyzeRootCause(detection);

    db.updateRow('opportunities',
      {
        root_cause: rootCauseAnalysis.root_cause,
        root_cause_confidence: rootCauseAnalysis.confidence,
        status: 'analyzed',
        updated_at: new Date().toISOString(),
      },
      { id: oppId }
    );

    addStep('root_cause', {
      cause: rootCauseAnalysis.root_cause,
      detail: rootCauseAnalysis.root_cause_detail,
      confidence: rootCauseAnalysis.confidence,
      source: rootCauseAnalysis.source,
    });

    // ── Step 4: Evaluate — Compare recovery options ─────────────
    addStep('evaluate', 'Calculating recovery options...');
    const optionsResult = await tools.executeTool('calculate_recovery_options', { opportunity_id: oppId });
    const recoveryOptions = optionsResult.success ? optionsResult.data.options : [];

    addStep('options_calculated', {
      options: recoveryOptions.map(o => ({
        action: o.action,
        expected_recovery: o.expected_recovery,
      })),
    });

    // ── Step 5: Reason — LLM compares interventions ─────────────
    // Get customer context for the highest-value affected customer
    let customerContext = null;
    const topPayment = detection.top_affected_payments[0];
    if (topPayment?.customer_id) {
      const custResult = await tools.executeTool('get_customer_history', {
        customer_id: topPayment.customer_id,
      });
      if (custResult.success) {
        customerContext = custResult.data;
      }
    }

    const opportunity = db.getRow('opportunities', { id: oppId });
    const recommendation = await llm.compareInterventions(opportunity, recoveryOptions, customerContext);

    addStep('recommendation', {
      action: recommendation.recommended_action,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      risk_level: recommendation.risk_level,
    });

    // ── Step 6: Guard — Policy validation ───────────────────────
    addStep('policy_check', 'Validating against merchant guardrails...');

    const existingInterventions = db.getRows('interventions', { opportunity_id: oppId });
    const policyResult = policy.validateAction(
      recommendation,
      opportunity,
      merchant,
      existingInterventions
    );

    addStep('policy_result', {
      approved: policyResult.approved,
      reason: policyResult.reason,
      requires_human: policyResult.requires_human,
      checks: policyResult.checks,
    });

    // ── Step 7: Decide & Act ────────────────────────────────────
    const interventionId = db.generateId('int');

    if (!policyResult.approved) {
      // Policy rejected — create pending intervention
      db.insertRow('interventions', {
        id: interventionId,
        opportunity_id: oppId,
        merchant_id,
        customer_id: topPayment?.customer_id || null,
        action_type: recommendation.recommended_action,
        expected_recovery: detection.expected_recovery,
        confidence: recommendation.confidence,
        risk_level: recommendation.risk_level,
        policy_check: 'rejected',
        policy_reason: policyResult.reason,
        approval_status: policyResult.requires_human ? 'awaiting_approval' : 'rejected',
        execution_status: 'pending',
      });

      db.updateRow('opportunities',
        { status: policyResult.requires_human ? 'awaiting_approval' : 'policy_rejected', updated_at: new Date().toISOString() },
        { id: oppId }
      );

      addStep('action_blocked', {
        reason: policyResult.reason,
        requires_human: policyResult.requires_human,
      });

      await tools.executeTool('record_agent_action', {
        merchant_id,
        opportunity_id: oppId,
        event_type: 'policy_rejected',
        event_data: { reason: policyResult.reason, action: recommendation.recommended_action },
      });

      return saveRun(runId, merchant_id, oppId, trigger_type, steps,
        policyResult.requires_human ? 'awaiting_approval' : 'policy_rejected', startTime);
    }

    // Policy approved — check operating mode
    if (merchant.operating_mode === 'observe') {
      db.insertRow('interventions', {
        id: interventionId,
        opportunity_id: oppId,
        merchant_id,
        customer_id: topPayment?.customer_id || null,
        action_type: recommendation.recommended_action,
        expected_recovery: detection.expected_recovery,
        confidence: recommendation.confidence,
        risk_level: recommendation.risk_level,
        policy_check: 'approved',
        approval_status: 'recommendation_only',
        execution_status: 'not_executed',
      });

      addStep('observe_mode', 'Merchant is in observe mode. Recommendation recorded but not executed.');
      db.updateRow('opportunities', { status: 'recommended', updated_at: new Date().toISOString() }, { id: oppId });
      return saveRun(runId, merchant_id, oppId, trigger_type, steps, 'recommended', startTime);
    }

    if (merchant.operating_mode === 'review') {
      db.insertRow('interventions', {
        id: interventionId,
        opportunity_id: oppId,
        merchant_id,
        customer_id: topPayment?.customer_id || null,
        action_type: recommendation.recommended_action,
        expected_recovery: detection.expected_recovery,
        confidence: recommendation.confidence,
        risk_level: recommendation.risk_level,
        policy_check: 'approved',
        approval_status: 'awaiting_approval',
        execution_status: 'pending',
      });

      addStep('review_mode', 'Merchant is in review mode. Action prepared and awaiting approval.');
      db.updateRow('opportunities', { status: 'awaiting_approval', updated_at: new Date().toISOString() }, { id: oppId });
      return saveRun(runId, merchant_id, oppId, trigger_type, steps, 'awaiting_approval', startTime);
    }

    // Autonomous mode — execute the action
    addStep('execute', `Executing tool: ${recommendation.recommended_action}`);
    const executionResult = await executeRecoveryAction(
      recommendation.recommended_action,
      oppId,
      interventionId,
      merchant_id,
      topPayment,
      detection
    );

    db.insertRow('interventions', {
      id: interventionId,
      opportunity_id: oppId,
      merchant_id,
      customer_id: topPayment?.customer_id || null,
      action_type: recommendation.recommended_action,
      action_params: JSON.stringify(executionResult.params || {}),
      expected_recovery: detection.expected_recovery,
      confidence: recommendation.confidence,
      risk_level: recommendation.risk_level,
      policy_check: 'approved',
      policy_reason: policyResult.reason,
      approval_status: 'auto_approved',
      execution_status: executionResult.success ? 'executed' : 'failed',
      execution_result: JSON.stringify(executionResult),
      razorpay_payment_link_id: executionResult.payment_link_id || null,
      error_message: executionResult.error || null,
      executed_at: new Date().toISOString(),
    });

    if (executionResult.success) {
      addStep('tool_result', {
        success: true,
        action: recommendation.recommended_action,
        payment_link_id: executionResult.payment_link_id,
        details: executionResult.details,
      });
      db.updateRow('opportunities',
        {
          status: 'action_executed',
          intervention_count: (opportunity.intervention_count || 0) + 1,
          updated_at: new Date().toISOString(),
        },
        { id: oppId }
      );
    } else {
      addStep('tool_failed', {
        success: false,
        error: executionResult.error,
        will_retry: executionResult.retry,
      });

      // Failure handling: retry once
      if (executionResult.retry) {
        addStep('retry', 'Retrying tool execution...');
        const retryResult = await executeRecoveryAction(
          recommendation.recommended_action, oppId, interventionId, merchant_id, topPayment, detection
        );

        if (retryResult.success) {
          addStep('retry_success', { action: recommendation.recommended_action });
          db.updateRow('interventions',
            { execution_status: 'executed', execution_result: JSON.stringify(retryResult), retry_count: 1, executed_at: new Date().toISOString() },
            { id: interventionId }
          );
          db.updateRow('opportunities', { status: 'action_executed', updated_at: new Date().toISOString() }, { id: oppId });
        } else {
          addStep('retry_failed', 'Retry failed. Escalating to merchant.', 'failed');
          db.updateRow('interventions',
            { execution_status: 'failed', error_message: retryResult.error, retry_count: 1 },
            { id: interventionId }
          );
          db.updateRow('opportunities', { status: 'execution_failed', updated_at: new Date().toISOString() }, { id: oppId });
        }
      } else {
        db.updateRow('opportunities', { status: 'execution_failed', updated_at: new Date().toISOString() }, { id: oppId });
      }
    }

    // ── Step 8: Record audit ────────────────────────────────────
    await tools.executeTool('record_agent_action', {
      merchant_id,
      opportunity_id: oppId,
      event_type: 'intervention_executed',
      event_data: {
        action: recommendation.recommended_action,
        success: executionResult.success,
        intervention_id: interventionId,
      },
    });

    addStep('complete', 'Agent run completed.');
    return saveRun(runId, merchant_id, oppId, trigger_type, steps,
      executionResult.success ? 'executed' : 'failed', startTime);

  } catch (error) {
    addStep('error', `Unexpected error: ${error.message}`, 'failed');
    return saveRun(runId, merchant_id, null, trigger_type, steps, 'error', startTime);
  }
}

// ─── Recovery Action Execution ─────────────────────────────────

async function executeRecoveryAction(action, oppId, interventionId, merchant_id, topPayment, detection) {
  switch (action) {
    case 'create_payment_link': {
      if (!topPayment?.customer_id) {
        return { success: false, error: 'No customer ID for payment link', retry: false };
      }
      const result = await tools.executeTool('create_payment_link', {
        opportunity_id: oppId,
        customer_id: topPayment.customer_id,
        amount: topPayment.amount,
        description: `Complete your payment of ₹${topPayment.amount.toLocaleString()}`,
      });
      return {
        success: result.success,
        payment_link_id: result.payment_link_id,
        details: result.short_url ? `Payment link: ${result.short_url}` : null,
        error: result.error,
        retry: !result.success,
        params: { amount: topPayment.amount, customer_id: topPayment.customer_id },
      };
    }

    case 'send_notification': {
      // In a real system this would call an SMS/email API
      return {
        success: true,
        details: 'Payment reminder notification queued',
        retry: false,
        params: { type: 'reminder', customer_id: topPayment?.customer_id },
      };
    }

    case 'retry_payment': {
      return {
        success: true,
        details: 'Payment retry initiated',
        retry: false,
        params: { payment_id: topPayment?.razorpay_payment_id },
      };
    }

    case 'escalate_to_merchant': {
      return {
        success: true,
        details: 'Escalated to merchant for manual review',
        retry: false,
        params: { reason: 'Agent escalation' },
      };
    }

    case 'do_nothing': {
      return {
        success: true,
        details: 'No action taken — monitoring continues',
        retry: false,
      };
    }

    default:
      return { success: false, error: `Unknown action: ${action}`, retry: false };
  }
}

// ─── Save Agent Run ────────────────────────────────────────────

function saveRun(runId, merchant_id, opportunity_id, trigger_type, steps, outcome, startTime) {
  const runData = {
    id: runId,
    merchant_id,
    opportunity_id: opportunity_id || null,
    trigger_type,
    steps: JSON.stringify(steps),
    final_outcome: outcome,
    duration_ms: Date.now() - startTime,
    completed_at: new Date().toISOString(),
  };

  try {
    db.insertRow('agent_runs', runData);
  } catch (err) {
    console.error('[Agent] Failed to save run:', err.message);
  }

  return {
    run_id: runId,
    opportunity_id,
    outcome,
    steps,
    duration_ms: runData.duration_ms,
  };
}

// ─── Approve Intervention ──────────────────────────────────────

async function approveIntervention(intervention_id, approved_by = 'merchant') {
  const intervention = db.getRow('interventions', { id: intervention_id });
  if (!intervention) {
    return { success: false, error: 'Intervention not found' };
  }

  if (intervention.approval_status !== 'awaiting_approval') {
    return { success: false, error: `Intervention is not awaiting approval (status: ${intervention.approval_status})` };
  }

  const opportunity = db.getRow('opportunities', { id: intervention.opportunity_id });
  const merchant = db.getRow('merchants', { id: intervention.merchant_id });

  // Execute the action
  const topPaymentIds = JSON.parse(opportunity.affected_payments || '[]');
  let topPayment = null;
  if (topPaymentIds.length > 0) {
    topPayment = db.getRow('payments', { id: topPaymentIds[0] });
  }

  const executionResult = await executeRecoveryAction(
    intervention.action_type,
    intervention.opportunity_id,
    intervention_id,
    intervention.merchant_id,
    topPayment || { customer_id: intervention.customer_id, amount: intervention.expected_recovery },
    {}
  );

  db.updateRow('interventions', {
    approval_status: 'approved',
    approved_by,
    execution_status: executionResult.success ? 'executed' : 'failed',
    execution_result: JSON.stringify(executionResult),
    razorpay_payment_link_id: executionResult.payment_link_id || null,
    error_message: executionResult.error || null,
    executed_at: new Date().toISOString(),
  }, { id: intervention_id });

  db.updateRow('opportunities', {
    status: executionResult.success ? 'action_executed' : 'execution_failed',
    intervention_count: (opportunity.intervention_count || 0) + 1,
    updated_at: new Date().toISOString(),
  }, { id: intervention.opportunity_id });

  await tools.executeTool('record_agent_action', {
    merchant_id: intervention.merchant_id,
    opportunity_id: intervention.opportunity_id,
    event_type: 'intervention_approved',
    event_data: { intervention_id, approved_by, action: intervention.action_type },
  });

  return { success: true, execution: executionResult };
}

async function rejectIntervention(intervention_id, reason = '') {
  db.updateRow('interventions', {
    approval_status: 'rejected',
    execution_status: 'not_executed',
    policy_reason: reason,
  }, { id: intervention_id });

  const intervention = db.getRow('interventions', { id: intervention_id });
  if (intervention) {
    db.updateRow('opportunities', {
      status: 'merchant_rejected',
      updated_at: new Date().toISOString(),
    }, { id: intervention.opportunity_id });
  }

  return { success: true };
}

// ─── Simulate Recovery Outcome ─────────────────────────────────

/**
 * Simulate a payment being received for a recovery intervention.
 * Used for demo mode — in production, this would come from webhooks.
 */
function simulateRecoveryOutcome(intervention_id, recovered = true) {
  const intervention = db.getRow('interventions', { id: intervention_id });
  if (!intervention) return { success: false, error: 'Intervention not found' };

  const amount = recovered ? intervention.expected_recovery : 0;

  db.updateRow('interventions', {
    actual_recovery: amount,
    attribution: recovered ? 'agent_attributed' : 'not_recovered',
    resolved_at: new Date().toISOString(),
  }, { id: intervention_id });

  db.updateRow('opportunities', {
    actual_recovery: amount,
    status: recovered ? 'recovered' : 'not_recovered',
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { id: intervention.opportunity_id });

  // Audit log
  db.insertRow('audit_logs', {
    merchant_id: intervention.merchant_id,
    opportunity_id: intervention.opportunity_id,
    intervention_id: intervention_id,
    event_type: recovered ? 'revenue_recovered' : 'recovery_failed',
    event_data: JSON.stringify({ amount, attribution: recovered ? 'agent_attributed' : 'not_recovered' }),
  });

  return { success: true, recovered_amount: amount };
}

module.exports = {
  executeAgentRun,
  approveIntervention,
  rejectIntervention,
  simulateRecoveryOutcome,
};
