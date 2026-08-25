/*
 * policy-engine.js
 * 
 * Deterministic guardrail system for financial safety.
 * This layer sits between LLM recommendations and actual execution.
 * 
 * The LLM PROPOSES → Policy Engine VALIDATES → Tool EXECUTES
 * 
 * All financial constraints are enforced here, never by the LLM.
 */

const DEFAULT_GUARDRAILS = {
  max_auto_transaction: 25000,        // ₹25,000 — auto-execute limit
  max_recovery_attempts: 3,           // per opportunity
  minimum_confidence: 0.70,           // 70% confidence floor
  max_discount_percent: 10,           // 10% max discount
  high_value_threshold: 100000,       // ₹1,00,000 — requires human approval
  contact_cutoff_hour: 22,            // 10 PM — no contact after this
  contact_start_hour: 8,              // 8 AM — no contact before this
  max_daily_contacts_per_customer: 2, // per customer per day
  min_hours_between_contacts: 4,      // minimum gap between contacts
  kill_switch: false,                 // emergency stop all actions
  allowed_actions: [
    'create_payment_link',
    'send_notification',
    'retry_payment',
    'escalate_to_merchant',
    'do_nothing',
  ],
};

/**
 * Validate an LLM-recommended action against merchant guardrails.
 * 
 * Returns: { approved: boolean, reason: string, requires_human: boolean }
 */
function validateAction(recommendation, opportunity, merchant, intervention_history = []) {
  const guardrails = parseGuardrails(merchant.guardrails);
  const checks = [];

  // ── Check 1: Kill switch ──────────────────────────────────────
  if (guardrails.kill_switch) {
    return {
      approved: false,
      reason: 'Kill switch is active. All agent actions are suspended.',
      requires_human: false,
      checks: [{ name: 'kill_switch', passed: false, detail: 'Emergency stop active' }],
    };
  }

  // ── Check 2: Action allowlist ─────────────────────────────────
  const actionAllowed = guardrails.allowed_actions.includes(recommendation.recommended_action);
  checks.push({
    name: 'action_allowlist',
    passed: actionAllowed,
    detail: actionAllowed
      ? `Action "${recommendation.recommended_action}" is in the allowlist`
      : `Action "${recommendation.recommended_action}" is NOT in the allowlist`,
  });
  if (!actionAllowed) {
    return buildResult(false, 'Action is not in the merchant allowlist.', true, checks);
  }

  // ── Check 3: Confidence threshold ────────────────────────────
  const confidenceOk = recommendation.confidence >= guardrails.minimum_confidence;
  checks.push({
    name: 'confidence_threshold',
    passed: confidenceOk,
    detail: `Confidence ${(recommendation.confidence * 100).toFixed(0)}% vs minimum ${(guardrails.minimum_confidence * 100).toFixed(0)}%`,
  });
  if (!confidenceOk) {
    return buildResult(false, `Confidence ${(recommendation.confidence * 100).toFixed(0)}% is below the ${(guardrails.minimum_confidence * 100).toFixed(0)}% threshold.`, true, checks);
  }

  // ── Check 4: Amount limit ────────────────────────────────────
  const amount = opportunity.revenue_at_risk || 0;
  const amountOk = amount <= guardrails.max_auto_transaction;
  checks.push({
    name: 'amount_limit',
    passed: amountOk,
    detail: `Amount ₹${amount.toLocaleString()} vs auto-limit ₹${guardrails.max_auto_transaction.toLocaleString()}`,
  });

  // ── Check 5: High-value threshold ────────────────────────────
  const isHighValue = amount > guardrails.high_value_threshold;
  checks.push({
    name: 'high_value_check',
    passed: !isHighValue,
    detail: isHighValue
      ? `Amount ₹${amount.toLocaleString()} exceeds high-value threshold ₹${guardrails.high_value_threshold.toLocaleString()}`
      : `Amount within normal range`,
  });
  if (isHighValue) {
    return buildResult(false, `High-value transaction (₹${amount.toLocaleString()}) requires merchant approval.`, true, checks);
  }

  // ── Check 6: Retry limit ─────────────────────────────────────
  const attemptCount = intervention_history.length;
  const retriesOk = attemptCount < guardrails.max_recovery_attempts;
  checks.push({
    name: 'retry_limit',
    passed: retriesOk,
    detail: `Attempt ${attemptCount + 1} of ${guardrails.max_recovery_attempts}`,
  });
  if (!retriesOk) {
    return buildResult(false, `Maximum recovery attempts (${guardrails.max_recovery_attempts}) reached.`, false, checks);
  }

  // ── Check 7: Contact hours ───────────────────────────────────
  const currentHour = new Date().getHours();
  const contactHoursOk = currentHour >= guardrails.contact_start_hour && currentHour < guardrails.contact_cutoff_hour;
  const isContactAction = ['create_payment_link', 'send_notification'].includes(recommendation.recommended_action);
  checks.push({
    name: 'contact_hours',
    passed: contactHoursOk || !isContactAction,
    detail: isContactAction
      ? `Current time ${currentHour}:00, allowed ${guardrails.contact_start_hour}:00–${guardrails.contact_cutoff_hour}:00`
      : `Non-contact action, time check skipped`,
  });
  if (isContactAction && !contactHoursOk) {
    return buildResult(false, `Contact actions not allowed outside ${guardrails.contact_start_hour}:00–${guardrails.contact_cutoff_hour}:00.`, false, checks);
  }

  // ── Check 8: Operating mode ──────────────────────────────────
  const mode = merchant.operating_mode || 'review';
  if (mode === 'observe') {
    checks.push({ name: 'operating_mode', passed: false, detail: 'Merchant is in observe-only mode' });
    return buildResult(false, 'Merchant is in observe mode. Actions are recommendation-only.', false, checks);
  }
  if (mode === 'review' && !amountOk) {
    checks.push({ name: 'operating_mode', passed: false, detail: 'Review mode requires approval for this amount' });
    return buildResult(false, 'Review mode: merchant approval required for this transaction amount.', true, checks);
  }
  checks.push({ name: 'operating_mode', passed: true, detail: `Mode: ${mode}` });

  // ── All checks passed ────────────────────────────────────────
  return buildResult(true, 'All guardrail checks passed.', false, checks);
}

function buildResult(approved, reason, requires_human, checks) {
  return { approved, reason, requires_human, checks };
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
 * Same customer + same opportunity + same action type within window = duplicate.
 */
function isDuplicateIntervention(opportunity_id, customer_id, action_type, recent_interventions = []) {
  return recent_interventions.some(
    (i) =>
      i.opportunity_id === opportunity_id &&
      i.customer_id === customer_id &&
      i.action_type === action_type &&
      i.execution_status !== 'failed'
  );
}

/**
 * Check if a customer should not be contacted right now.
 */
function canContactCustomer(customer, guardrails_config) {
  const guardrails = parseGuardrails(guardrails_config);

  if (customer.do_not_contact) {
    return { allowed: false, reason: 'Customer has opted out of contact.' };
  }

  if (customer.last_contacted_at) {
    const lastContact = new Date(customer.last_contacted_at);
    const hoursSince = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60);
    if (hoursSince < guardrails.min_hours_between_contacts) {
      return { allowed: false, reason: `Last contacted ${hoursSince.toFixed(1)}h ago. Minimum gap is ${guardrails.min_hours_between_contacts}h.` };
    }
  }

  return { allowed: true, reason: 'Contact is allowed.' };
}

module.exports = {
  DEFAULT_GUARDRAILS,
  validateAction,
  isDuplicateIntervention,
  canContactCustomer,
  parseGuardrails,
};
