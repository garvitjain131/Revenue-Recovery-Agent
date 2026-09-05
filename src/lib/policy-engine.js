/*
 * policy-engine.js
 * 
 * Deterministic Financial Policy Guardian and Safety Engine.
 * Sits strictly between AI strategy recommendations and actual financial execution.
 * 
 * Architectural Invariant:
 *   The LLM PROPOSES -> Policy Guardian VALIDATES -> Deterministic Tool EXECUTES
 * 
 * Enforces 14 Comprehensive Safety Checks with Risk-Adaptive Autonomy:
 *   1. Global Kill Switch
 *   2. Merchant Operating Mode
 *   3. Action Allowlist
 *   4. Recovery Confidence Floor (Deterministic multi-factor score >= 70%)
 *   5. Maximum Autonomous Transaction Amount (<= ₹25,000)
 *   6. High-Value Manual Review Threshold (> ₹1,00,000)
 *   7. Maximum Retry Count (<= 3 attempts)
 *   8. Customer Contact Frequency & Minimum Gap (>= 4 hours)
 *   9. Contact Hours Window (08:00 - 22:00)
 *  10. Idempotency & Duplicate Prevention
 *  11. Daily Recovery Budget
 *  12. Minimum Expected Recovery Floor (>= ₹500)
 *  13. Action Risk-Level Assessment (Low -> Execute, Medium -> Review, High -> Block)
 *  14. Data Completeness & Availability
 */

const crypto = require('crypto');
const timezone = require('./timezone');

const DEFAULT_GUARDRAILS = {
  max_auto_transaction: 25000,        // ₹25,000 auto-execution limit
  high_value_threshold: 100000,       // ₹1,00,000 requires human approval
  minimum_confidence: 0.70,           // 70% confidence floor
  min_expected_recovery: 500,         // ₹500 minimum expected recovery to justify intervention
  daily_recovery_budget: 50000,       // ₹50,000 daily budget for recovery interventions
  max_recovery_attempts: 3,           // Max recovery attempts per opportunity
  max_daily_contacts_per_customer: 2, // Max contacts per customer per 24 hours
  min_hours_between_contacts: 4,      // Minimum gap between contacts
  contact_start_hour: 8,              // 08:00
  contact_cutoff_hour: 22,            // 22:00 (10 PM)
  kill_switch: false,                 // Emergency stop
  allowed_actions: [
    'create_payment_link',
    'send_notification',
    'retry_payment',
    'request_alternate_payment_method',
    'escalate_to_merchant',
    'flag_discount_review',
    'do_nothing',
  ],
};

/**
 * Generate a deterministic idempotency key for an intervention.
 */
function generateIdempotencyKey(merchant_id, opportunity_id, action_type, attempt_number = 1) {
  const payload = `${merchant_id}:${opportunity_id}:${action_type}:${attempt_number}`;
  return crypto.createHash('sha256').update(payload).digest('hex').substring(0, 32);
}

/**
 * Validate a proposed recovery action against the 14 merchant guardrail checks.
 * 
 * @param {Object} recommendation - Strategy / LLM proposed action & confidence
 * @param {Object} opportunity - The opportunity record
 * @param {Object} merchant - Merchant configuration and operating mode
 * @param {Array<Object>} intervention_history - Previous interventions for this opportunity/customer
 * @param {Object} customer - Customer profile
 * @param {Object} options - Additional operational options (budgetSpentToday, dataStatus, etc.)
 * @returns {Object} Structured policy result { decision: 'APPROVED'|'REVIEW_REQUIRED'|'BLOCKED', approved: boolean, requires_human: boolean, reason: string, checks: Array }
 */
function validateAction(recommendation, opportunity, merchant, intervention_history = [], customer = null, options = {}) {
  // Support flexible argument passing: validateAction(rec, opp, merchant, options)
  if (intervention_history && !Array.isArray(intervention_history) && typeof intervention_history === 'object') {
    options = intervention_history;
    intervention_history = [];
    customer = null;
  } else if (customer && typeof customer === 'object' && !customer.id && (customer.currentHour !== undefined || customer.bypassContactHours !== undefined)) {
    options = customer;
    customer = null;
  }
  options = options || {};

  const guardrails = parseGuardrails(merchant.guardrails);
  const checks = [];
  const actionName = recommendation.recommended_action || recommendation.action;
  const confidence = recommendation.recovery_confidence || recommendation.confidence || 0.5;
  const amountAtRisk = opportunity.revenue_at_risk || 0;
  const expectedRecovery = recommendation.expected_recovery || opportunity.expected_recovery || 0;
  const riskLevel = (recommendation.risk_level || 'low').toLowerCase();
  const operatingMode = merchant.operating_mode || 'review';

  // ── 1. Global Kill Switch ──────────────────────────────────────
  const killSwitchActive = Boolean(guardrails.kill_switch);
  checks.push({
    rule: 'KILL_SWITCH',
    name: 'Emergency Kill Switch',
    passed: !killSwitchActive,
    detail: killSwitchActive ? 'Emergency kill switch is ACTIVE. All agent actions halted.' : 'Kill switch is OFF',
  });
  if (killSwitchActive) {
    return buildResult('BLOCKED', false, false, 'Global kill switch is active. Autonomous operations suspended.', checks);
  }

  // ── 2. Action Allowlist ─────────────────────────────────────────
  const isAllowedAction = guardrails.allowed_actions.includes(actionName);
  checks.push({
    rule: 'ACTION_ALLOWLIST',
    name: 'Action Allowlist Verification',
    passed: isAllowedAction,
    detail: isAllowedAction ? `Action "${actionName}" is authorized in allowlist` : `Action "${actionName}" is not in allowlist`,
  });
  if (!isAllowedAction) {
    return buildResult('BLOCKED', false, true, `Action "${actionName}" is not permitted by merchant allowlist.`, checks);
  }

  // Passive actions bypass active messaging and amount friction checks
  if (actionName === 'do_nothing') {
    return buildResult('APPROVED', true, false, 'Passive monitoring action approved.', checks);
  }

  // ── 3. Recovery Confidence Threshold ────────────────────────────
  const confidencePassed = confidence >= guardrails.minimum_confidence;
  checks.push({
    rule: 'RECOVERY_CONFIDENCE',
    name: 'Multi-Factor Recovery Confidence Floor',
    passed: confidencePassed,
    actual: `${(confidence * 100).toFixed(1)}%`,
    required: `>= ${(guardrails.minimum_confidence * 100).toFixed(0)}%`,
    detail: confidencePassed
      ? `Confidence ${(confidence * 100).toFixed(1)}% meets minimum ${(guardrails.minimum_confidence * 100).toFixed(0)}% floor`
      : `Confidence ${(confidence * 100).toFixed(1)}% is below ${(guardrails.minimum_confidence * 100).toFixed(0)}% threshold`,
  });

  // ── 4. Minimum Expected Recovery Floor ──────────────────────────
  const minExpectedPassed = expectedRecovery >= (guardrails.min_expected_recovery || 0);
  checks.push({
    rule: 'MINIMUM_EXPECTED_RECOVERY',
    name: 'Minimum Expected Recovery Floor',
    passed: minExpectedPassed,
    actual: `₹${Math.round(expectedRecovery).toLocaleString('en-IN')}`,
    required: `>= ₹${(guardrails.min_expected_recovery || 500).toLocaleString('en-IN')}`,
    detail: minExpectedPassed
      ? `Expected recovery ₹${Math.round(expectedRecovery).toLocaleString('en-IN')} justifies intervention`
      : `Expected recovery ₹${Math.round(expectedRecovery).toLocaleString('en-IN')} is below threshold ₹${guardrails.min_expected_recovery}`,
  });

  // ── 5. Maximum Autonomous Transaction Amount ────────────────────
  const amountWithinAutoLimit = amountAtRisk <= guardrails.max_auto_transaction;
  checks.push({
    rule: 'MAX_AUTO_TRANSACTION',
    name: 'Maximum Autonomous Transaction Limit',
    passed: amountWithinAutoLimit,
    actual: `₹${Math.round(amountAtRisk).toLocaleString('en-IN')}`,
    required: `<= ₹${guardrails.max_auto_transaction.toLocaleString('en-IN')}`,
    detail: amountWithinAutoLimit
      ? `Amount ₹${Math.round(amountAtRisk).toLocaleString('en-IN')} within auto-limit ₹${guardrails.max_auto_transaction.toLocaleString('en-IN')}`
      : `Amount ₹${Math.round(amountAtRisk).toLocaleString('en-IN')} exceeds auto-limit ₹${guardrails.max_auto_transaction.toLocaleString('en-IN')}`,
  });

  // ── 6. High-Value Threshold Check ──────────────────────────────
  const isHighValue = amountAtRisk > guardrails.high_value_threshold;
  checks.push({
    rule: 'HIGH_VALUE_THRESHOLD',
    name: 'High-Value Escalation Threshold',
    passed: !isHighValue,
    actual: `₹${Math.round(amountAtRisk).toLocaleString('en-IN')}`,
    required: `<= ₹${guardrails.high_value_threshold.toLocaleString('en-IN')}`,
    detail: isHighValue
      ? `High-value exposure (₹${Math.round(amountAtRisk).toLocaleString('en-IN')}) requires mandatory human review`
      : `Within standard transaction boundaries`,
  });

  // ── 7. Maximum Retry Count Limit ───────────────────────────────
  const attemptCount = intervention_history.length;
  const retriesWithinLimit = attemptCount < guardrails.max_recovery_attempts;
  checks.push({
    rule: 'MAX_RETRY_LIMIT',
    name: 'Recovery Attempt Limit',
    passed: retriesWithinLimit,
    actual: `Attempt ${attemptCount + 1}`,
    required: `<= ${guardrails.max_recovery_attempts}`,
    detail: retriesWithinLimit
      ? `Attempt ${attemptCount + 1} of maximum ${guardrails.max_recovery_attempts}`
      : `Exceeded maximum allowed attempts (${guardrails.max_recovery_attempts})`,
  });

  // ── 8. Customer Contact Frequency & Gap ──────────────────────────
  const isContactAction = ['create_payment_link', 'send_notification', 'request_alternate_payment_method'].includes(actionName);
  let contactAllowed = true;
  let contactDetail = 'Non-outbound action, contact rules satisfied';

  if (customer && isContactAction) {
    if (customer.do_not_contact) {
      contactAllowed = false;
      contactDetail = 'Customer has opted out of direct outbound communication (Do-Not-Contact flag)';
    } else if (customer.last_contacted_at) {
      const hoursSince = (Date.now() - new Date(customer.last_contacted_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < guardrails.min_hours_between_contacts) {
        contactAllowed = false;
        contactDetail = `Customer contacted ${hoursSince.toFixed(1)}h ago (minimum gap is ${guardrails.min_hours_between_contacts}h)`;
      }
    }

    // Check daily contact limit in IST
    if (contactAllowed && Array.isArray(intervention_history) && guardrails.max_daily_contacts_per_customer) {
      const todayIST = timezone.getISTDayKey(options.date || new Date());
      const contactsToday = intervention_history.filter(i => {
        const isContact = ['create_payment_link', 'send_notification', 'request_alternate_payment_method'].includes(i.action_type);
        if (!isContact || !i.created_at) return false;
        return timezone.getISTDayKey(i.created_at) === todayIST;
      }).length;

      if (contactsToday >= guardrails.max_daily_contacts_per_customer) {
        contactAllowed = false;
        contactDetail = `Customer reached maximum daily contacts limit (${contactsToday}/${guardrails.max_daily_contacts_per_customer} contacts today IST)`;
      }
    }
  }

  checks.push({
    rule: 'CUSTOMER_CONTACT_LIMIT',
    name: 'Customer Contact Frequency & Fatigue Protection',
    passed: contactAllowed,
    detail: contactDetail,
  });

  // ── 9. Contact-Hour Restrictions (08:00 - 22:00 in Asia/Kolkata IST) ────────────────
  const currentISTHour = options.currentHour !== undefined 
    ? options.currentHour 
    : timezone.getISTHour(options.date || new Date());
  const withinContactHours = options.bypassContactHours 
    ? true 
    : (currentISTHour >= guardrails.contact_start_hour && currentISTHour < guardrails.contact_cutoff_hour);
  const contactHoursPassed = !isContactAction || withinContactHours;
  checks.push({
    rule: 'CONTACT_HOURS',
    name: 'Contact Hour Boundaries (IST)',
    passed: contactHoursPassed,
    actual: `${currentISTHour.toString().padStart(2, '0')}:00 IST`,
    required: `${guardrails.contact_start_hour.toString().padStart(2, '0')}:00 - ${guardrails.contact_cutoff_hour.toString().padStart(2, '0')}:00 IST`,
    detail: isContactAction
      ? (contactHoursPassed ? `Current hour (${currentISTHour}:00 IST) is within allowed window` : `Outbound contact prohibited at ${currentISTHour}:00 IST`)
      : 'Non-contact action, time check bypassed',
  });

  // ── 10. Idempotency & Duplicate Prevention ──────────────────────
  const isDuplicate = isDuplicateIntervention(opportunity.id, opportunity.customer_id || customer?.id, actionName, intervention_history);
  checks.push({
    rule: 'IDEMPOTENCY_CHECK',
    name: 'Idempotency & Duplicate Intervention Check',
    passed: !isDuplicate,
    detail: isDuplicate ? `Duplicate intervention of type "${actionName}" already recorded` : 'No duplicate intervention detected',
  });

  // ── 11. Daily Recovery Budget ───────────────────────────────────
  const budgetSpent = options.budgetSpentToday || 0;
  const withinBudget = (budgetSpent + (recommendation.intervention_cost || 0)) <= (guardrails.daily_recovery_budget || 50000);
  checks.push({
    rule: 'RECOVERY_BUDGET',
    name: 'Daily Operational Recovery Budget',
    passed: withinBudget,
    actual: `₹${Math.round(budgetSpent).toLocaleString('en-IN')} spent`,
    required: `<= ₹${(guardrails.daily_recovery_budget || 50000).toLocaleString('en-IN')}`,
    detail: withinBudget ? 'Within daily operational recovery budget' : 'Daily recovery budget exhausted',
  });

  // ── 12. Risk-Adaptive Autonomy Check ────────────────────────────
  // High risk actions are blocked from auto-execution. Medium risk actions are downgraded to Review.
  const isRiskAllowed = riskLevel !== 'high';
  checks.push({
    rule: 'ACTION_RISK_LEVEL',
    name: 'Action Risk Classification',
    passed: isRiskAllowed,
    actual: riskLevel.toUpperCase(),
    detail: riskLevel === 'high'
      ? 'High risk action cannot be executed automatically'
      : (riskLevel === 'medium' ? 'Medium risk action requires human review' : 'Low risk action suitable for autonomous execution'),
  });

  // ── 13. Data Completeness Validation ────────────────────────────
  const dataAvailable = options.dataAvailable !== false;
  checks.push({
    rule: 'DATA_AVAILABILITY',
    name: 'Data Completeness & Source Verification',
    passed: dataAvailable,
    detail: dataAvailable ? 'Verified data source signals available' : 'Incomplete transaction or customer telemetry',
  });

  // ── 14. Merchant Operating Mode Evaluation ───────────────────────
  checks.push({
    rule: 'OPERATING_MODE',
    name: 'Merchant Operating Mode Policy',
    passed: true,
    actual: operatingMode.toUpperCase(),
    detail: `Merchant operating mode is configured as ${operatingMode.toUpperCase()}`,
  });

  // ── Final Decision Synthesis ────────────────────────────────────

  // Fatal Blockers (Must fail closed)
  if (!contactAllowed || isDuplicate || !retriesWithinLimit || !contactHoursPassed || !withinBudget || !dataAvailable || riskLevel === 'high') {
    const blockerReason = [
      !contactAllowed && contactDetail,
      isDuplicate && 'Duplicate intervention prevented.',
      !retriesWithinLimit && `Exceeded retry limit of ${guardrails.max_recovery_attempts}.`,
      !contactHoursPassed && 'Outside permissible contact hours.',
      !withinBudget && 'Daily recovery budget exhausted.',
      !dataAvailable && 'Incomplete telemetry data.',
      riskLevel === 'high' && 'High-risk action blocked.',
    ].filter(Boolean).join(' ');

    return buildResult('BLOCKED', false, false, blockerReason, checks);
  }

  // Downgrade to Human Review if:
  // - Merchant mode is Review
  // - Transaction is High-Value (> ₹1,00,000)
  // - Amount exceeds Auto Transaction Limit (> ₹25,000)
  // - Confidence is below threshold
  // - Risk level is Medium
  if (
    operatingMode === 'review' ||
    isHighValue ||
    !amountWithinAutoLimit ||
    !confidencePassed ||
    !minExpectedPassed ||
    riskLevel === 'medium'
  ) {
    const reviewReason = [
      operatingMode === 'review' && 'Merchant is in Review Mode (human oversight enabled).',
      isHighValue && `High-value transaction (₹${Math.round(amountAtRisk).toLocaleString('en-IN')}) requires explicit merchant approval.`,
      !amountWithinAutoLimit && `Transaction amount (₹${Math.round(amountAtRisk).toLocaleString('en-IN')}) exceeds autonomous limit of ₹${guardrails.max_auto_transaction.toLocaleString('en-IN')}.`,
      !confidencePassed && `Confidence ${(confidence * 100).toFixed(0)}% requires human review.`,
      riskLevel === 'medium' && 'Medium-risk intervention automatically downgraded to Review.',
    ].filter(Boolean).join(' ');

    return buildResult('REVIEW_REQUIRED', false, true, reviewReason, checks);
  }

  // Observe Mode: Record recommendation but do not execute
  if (operatingMode === 'observe') {
    return buildResult('REVIEW_REQUIRED', false, false, 'Merchant is in Observe Mode. Recommendation logged without execution.', checks);
  }

  // All 14 policies satisfied for Autonomous Execution
  return buildResult('APPROVED', true, false, 'All 14 financial safety policies satisfied for autonomous execution.', checks);
}

function buildResult(decision, approved, requires_human, reason, checks) {
  return {
    decision,
    approved,
    requires_human,
    reason,
    checks,
  };
}

function parseGuardrails(guardrailsJson) {
  try {
    const parsed = typeof guardrailsJson === 'string' ? JSON.parse(guardrailsJson) : guardrailsJson;
    return { ...DEFAULT_GUARDRAILS, ...parsed };
  } catch {
    return { ...DEFAULT_GUARDRAILS };
  }
}

/**
 * Check for duplicate interventions (idempotency).
 */
function isDuplicateIntervention(opportunity_id, customer_id, action_type, recent_interventions = []) {
  if (!Array.isArray(recent_interventions)) return false;
  return recent_interventions.some(
    (i) =>
      i.opportunity_id === opportunity_id &&
      i.action_type === action_type &&
      i.execution_status !== 'failed'
  );
}

module.exports = {
  DEFAULT_GUARDRAILS,
  validateAction,
  generateIdempotencyKey,
  isDuplicateIntervention,
  parseGuardrails,
  timezone,
};
