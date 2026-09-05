/*
 * scoring-engine.js
 * 
 * Deterministic revenue scoring calculations.
 * ALL financial math happens here — never in the LLM.
 * 
 * Provides:
 *   - Revenue-at-risk calculation
 *   - Recovery probability estimation
 *   - Expected recovery value
 *   - Opportunity priority ranking
 *   - Intervention effectiveness scoring
 */

// ─── Recovery Probability ──────────────────────────────────────

/**
 * Calculate recovery probability for a failed payment.
 * Uses customer history, payment method, amount, and time since failure.
 * 
 * Returns: 0.0 to 1.0
 */
function calculateRecoveryProbability(payment, customer = null) {
  let score = 0.50; // base probability

  // Customer history factor
  if (customer) {
    const successRate = customer.total_payments > 0
      ? customer.successful_payments / customer.total_payments
      : 0.5;
    
    // Customers with good history are more likely to pay again
    score += (successRate - 0.5) * 0.3;

    // Lifetime value indicates commitment
    if (customer.lifetime_value > 50000) score += 0.08;
    else if (customer.lifetime_value > 10000) score += 0.04;

    // Recent customers are more likely to recover
    if (customer.last_payment_at) {
      const daysSince = (Date.now() - new Date(customer.last_payment_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 0.10;
      else if (daysSince < 30) score += 0.05;
      else if (daysSince > 90) score -= 0.10;
    }
  }

  // Payment method factor
  const methodScores = {
    'upi': 0.05,      // UPI failures often temporary
    'card': 0.03,     // card failures may be funds issue
    'netbanking': 0.02,
    'wallet': 0.04,
    'emi': -0.05,     // EMI failures often eligibility issues
  };
  score += methodScores[payment.method] || 0;

  // Amount factor — smaller amounts easier to recover
  if (payment.amount < 1000) score += 0.05;
  else if (payment.amount < 5000) score += 0.02;
  else if (payment.amount > 50000) score -= 0.05;
  else if (payment.amount > 100000) score -= 0.10;

  // Time since failure — sooner is better
  if (payment.created_at) {
    const hoursSince = (Date.now() - new Date(payment.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) score += 0.10;
    else if (hoursSince < 6) score += 0.05;
    else if (hoursSince > 48) score -= 0.10;
    else if (hoursSince > 168) score -= 0.20; // > 1 week
  }

  return Math.max(0.05, Math.min(0.95, score));
}

// ─── Revenue at Risk ───────────────────────────────────────────

/**
 * Calculate total revenue at risk for a set of failed payments.
 */
function calculateRevenueAtRisk(failedPayments = []) {
  if (!Array.isArray(failedPayments)) return 0;
  return failedPayments.reduce((total, p) => {
    const amt = parseFloat(p?.amount);
    return total + (isNaN(amt) || amt < 0 ? 0 : amt);
  }, 0);
}

// ─── Expected Recovery Value ───────────────────────────────────

/**
 * Expected Recovery = Revenue at Risk × Recovery Probability × Intervention Effectiveness
 * Net Expected Recovery = Expected Recovery - Intervention Cost - Expected Risk Cost
 * 
 * Invariants:
 * - Expected Recovery can NEVER exceed Revenue at Risk.
 * - Negative inputs or NaN fail closed to 0.
 */
function calculateExpectedRecovery(revenue_at_risk, recovery_probability, intervention_effectiveness = 0.85, intervention_cost = 0, risk_cost = 0) {
  const cleanRisk = Math.max(0, isNaN(revenue_at_risk) ? 0 : Number(revenue_at_risk));
  if (cleanRisk <= 0) return 0;

  const cleanProb = Math.max(0, Math.min(1, isNaN(recovery_probability) ? 0.5 : Number(recovery_probability)));
  const cleanEff = Math.max(0, Math.min(1, isNaN(intervention_effectiveness) ? 0.85 : Number(intervention_effectiveness)));
  const cleanCost = Math.max(0, isNaN(intervention_cost) ? 0 : Number(intervention_cost));
  const cleanRiskCost = Math.max(0, isNaN(risk_cost) ? 0 : Number(risk_cost));

  // Gross recovery bounded by revenue_at_risk
  const gross = Math.min(cleanRisk, Math.round(cleanRisk * cleanProb * cleanEff));
  
  // Net expected recovery bounded by cleanRisk and non-negative
  const net = Math.max(0, gross - cleanCost - cleanRiskCost);
  return Math.min(cleanRisk, net);
}

/**
 * Calculate multi-factor Recovery Confidence score (0.0 to 1.0).
 * 
 * Combines:
 *   - Detector confidence (0.30)
 *   - Historical evidence confidence (0.25)
 *   - Strategy model confidence (0.20)
 *   - LLM diagnostic confidence (0.15)
 *   - Data completeness (0.10)
 */
function calculateRecoveryConfidence({
  detectorConfidence = 0.85,
  historicalEvidenceConfidence = 0.75,
  strategyEvidenceConfidence = 0.80,
  llmConfidence = 0.75,
  dataCompleteness = 0.90,
} = {}) {
  const weightedScore = (
    0.30 * Math.max(0, Math.min(1, detectorConfidence)) +
    0.25 * Math.max(0, Math.min(1, historicalEvidenceConfidence)) +
    0.20 * Math.max(0, Math.min(1, strategyEvidenceConfidence)) +
    0.15 * Math.max(0, Math.min(1, llmConfidence)) +
    0.10 * Math.max(0, Math.min(1, dataCompleteness))
  );

  return parseFloat(Math.min(0.98, Math.max(0.10, weightedScore)).toFixed(4));
}

// ─── Intervention Effectiveness ────────────────────────────────

const INTERVENTION_EFFECTIVENESS = {
  'create_payment_link': 0.85,
  'send_notification': 0.60,
  'retry_payment': 0.70,
  'request_alternate_payment_method': 0.80,
  'offer_discount': 0.75,
  'escalate_to_merchant': 0.50,
  'flag_discount_review': 0.90,
  'do_nothing': 0.05,
};

function getInterventionEffectiveness(action_type) {
  return INTERVENTION_EFFECTIVENESS[action_type] || 0.50;
}

// ─── Opportunity Priority ──────────────────────────────────────

/**
 * Calculate priority for a revenue opportunity.
 * Returns: { priority: 'critical'|'high'|'medium'|'low', score: number }
 */
function calculatePriority(revenue_at_risk, recovery_probability, urgency = 1.0) {
  const cleanRisk = Math.max(0, isNaN(revenue_at_risk) ? 0 : Number(revenue_at_risk));
  const cleanProb = Math.max(0, Math.min(1, isNaN(recovery_probability) ? 0.5 : Number(recovery_probability)));
  const cleanUrg = Math.max(0.1, isNaN(urgency) ? 1.0 : Number(urgency));
  const expected = Math.round(cleanRisk * cleanProb * cleanUrg);

  if (expected >= 500000) return { priority: 'critical', score: expected };  // ₹5L+
  if (expected >= 100000) return { priority: 'high', score: expected };      // ₹1L+
  if (expected >= 25000) return { priority: 'medium', score: expected };     // ₹25K+
  return { priority: 'low', score: expected };
}

// ─── Anomaly Detection ─────────────────────────────────────────

/**
 * Detect payment anomalies by comparing current metrics to baseline.
 * Returns anomalies array with type, severity, and affected data.
 */
function detectAnomalies(currentMetrics, baselineMetrics) {
  const anomalies = [];

  // Failure rate spike detection
  if (currentMetrics.failure_rate && baselineMetrics.failure_rate) {
    const increase = currentMetrics.failure_rate - baselineMetrics.failure_rate;
    if (increase > 0.05) { // > 5% increase
      anomalies.push({
        type: 'failure_rate_spike',
        severity: increase > 0.15 ? 'critical' : increase > 0.10 ? 'high' : 'medium',
        current: currentMetrics.failure_rate,
        baseline: baselineMetrics.failure_rate,
        increase: increase,
        description: `Payment failure rate increased by ${(increase * 100).toFixed(1)}% (baseline: ${(baselineMetrics.failure_rate * 100).toFixed(1)}%, current: ${(currentMetrics.failure_rate * 100).toFixed(1)}%)`,
      });
    }
  }

  // Payment method degradation
  if (currentMetrics.method_rates && baselineMetrics.method_rates) {
    for (const method of Object.keys(currentMetrics.method_rates)) {
      const current = currentMetrics.method_rates[method] || 0;
      const baseline = baselineMetrics.method_rates[method] || 0;
      const increase = current - baseline;
      if (increase > 0.08) {
        anomalies.push({
          type: 'method_degradation',
          severity: increase > 0.15 ? 'critical' : 'high',
          method: method,
          current: current,
          baseline: baseline,
          increase: increase,
          description: `${method.toUpperCase()} failure rate spiked by ${(increase * 100).toFixed(1)}%`,
        });
      }
    }
  }

  // High-value failure concentration
  if (currentMetrics.high_value_failures > 3 && currentMetrics.high_value_amount > 100000) {
    anomalies.push({
      type: 'high_value_concentration',
      severity: currentMetrics.high_value_amount > 500000 ? 'critical' : 'high',
      count: currentMetrics.high_value_failures,
      amount: currentMetrics.high_value_amount,
      description: `${currentMetrics.high_value_failures} high-value payments failed totaling ₹${(currentMetrics.high_value_amount / 100000).toFixed(1)}L`,
    });
  }

  return anomalies;
}

// ─── Revenue Metrics Calculator ────────────────────────────────

/**
 * Calculate comprehensive revenue metrics from payment data.
 */
function calculateRevenueMetrics(payments) {
  const total = payments.length;
  const failed = payments.filter(p => p.status === 'failed');
  const successful = payments.filter(p => p.status === 'captured' || p.status === 'authorized');

  const failedAmount = failed.reduce((s, p) => s + p.amount, 0);
  const successAmount = successful.reduce((s, p) => s + p.amount, 0);

  // Method breakdown
  const methodCounts = {};
  const methodFailures = {};
  for (const p of payments) {
    const m = p.method || 'unknown';
    methodCounts[m] = (methodCounts[m] || 0) + 1;
    if (p.status === 'failed') {
      methodFailures[m] = (methodFailures[m] || 0) + 1;
    }
  }

  const methodRates = {};
  for (const m of Object.keys(methodCounts)) {
    methodRates[m] = methodCounts[m] > 0 ? (methodFailures[m] || 0) / methodCounts[m] : 0;
  }

  // High-value failures (> ₹10,000)
  const highValueFailed = failed.filter(p => p.amount > 10000);

  return {
    total_payments: total,
    successful_payments: successful.length,
    failed_payments: failed.length,
    failure_rate: total > 0 ? failed.length / total : 0,
    success_rate: total > 0 ? successful.length / total : 0,
    total_revenue: successAmount,
    failed_amount: failedAmount,
    revenue_at_risk: failedAmount,
    method_rates: methodRates,
    method_counts: methodCounts,
    high_value_failures: highValueFailed.length,
    high_value_amount: highValueFailed.reduce((s, p) => s + p.amount, 0),
  };
}

// ─── Cart Recovery Probability ─────────────────────────────────

/**
 * Calculate recovery probability for an abandoned cart.
 * Uses customer history, cart value, and recency.
 * 
 * Returns: 0.0 to 1.0
 */
function calculateCartRecoveryProbability(cartEvent, customer = null) {
  let score = 0.30; // base probability for cart recovery

  if (customer) {
    // Repeat buyer is much more likely to convert
    if (customer.successful_payments > 5) score += 0.20;
    else if (customer.successful_payments > 2) score += 0.10;
    else if (customer.successful_payments > 0) score += 0.05;

    // LTV indicates commitment
    if (customer.lifetime_value > 50000) score += 0.10;
    else if (customer.lifetime_value > 10000) score += 0.05;

    // Recent activity
    if (customer.last_payment_at) {
      const daysSince = (Date.now() - new Date(customer.last_payment_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 0.10;
      else if (daysSince < 30) score += 0.05;
      else if (daysSince > 90) score -= 0.10;
    }
  }

  // Cart value factor
  if (cartEvent.cart_value > 10000) score += 0.05;
  else if (cartEvent.cart_value < 500) score -= 0.10;

  // Recency of abandonment
  if (cartEvent.created_at) {
    const hoursSince = (Date.now() - new Date(cartEvent.created_at).getTime()) / (1000 * 60 * 60);
    if (hoursSince < 1) score += 0.15;
    else if (hoursSince < 6) score += 0.10;
    else if (hoursSince < 24) score += 0.05;
    else if (hoursSince > 72) score -= 0.10;
    else if (hoursSince > 168) score -= 0.20;
  }

  return Math.max(0.05, Math.min(0.90, score));
}

// ─── Discount Leakage Scoring ──────────────────────────────────

/**
 * Score whether a discount was potentially unnecessary.
 * Returns: 0.0 to 1.0 (higher = more likely unnecessary)
 * 
 * Based on: repeat purchases, LTV, recency, discount proportion.
 */
function calculateDiscountLeakageScore(discount, customer = null) {
  let score = 0.20;

  if (customer) {
    // Repeat buyer signal
    const purchases = customer.successful_payments || 0;
    if (purchases > 10) score += 0.30;
    else if (purchases > 5) score += 0.20;
    else if (purchases > 2) score += 0.10;

    // LTV signal
    const ltv = customer.lifetime_value || 0;
    if (ltv > 50000) score += 0.15;
    else if (ltv > 20000) score += 0.10;
    else if (ltv > 5000) score += 0.05;

    // Recent activity
    if (customer.last_payment_at) {
      const daysSince = (Date.now() - new Date(customer.last_payment_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) score += 0.10;
      else if (daysSince < 30) score += 0.05;
    }
  }

  // Discount proportion
  if (discount.original_amount > 0) {
    const pct = discount.discount_amount / discount.original_amount;
    if (pct < 0.05) score -= 0.10; // tiny discount, probably fine
    if (pct > 0.30) score -= 0.10; // large discount, probably intentional
  }

  return Math.max(0.0, Math.min(0.95, score));
}

// ─── Unified Leak Summary ──────────────────────────────────────

/**
 * Calculate unified metrics across all leak types.
 */
function calculateLeakSummary(paymentMetrics, cartMetrics, discountMetrics) {
  const summary = {
    total_revenue_at_risk: 0,
    total_expected_recovery: 0,
    leak_types_detected: [],
  };

  if (paymentMetrics && paymentMetrics.revenue_at_risk > 0) {
    summary.total_revenue_at_risk += paymentMetrics.revenue_at_risk;
    summary.leak_types_detected.push('payment_failures');
  }

  if (cartMetrics && cartMetrics.abandoned_value > 0) {
    summary.total_revenue_at_risk += cartMetrics.abandoned_value;
    summary.leak_types_detected.push('cart_abandonment');
  }

  if (discountMetrics && discountMetrics.potential_leakage > 0) {
    summary.total_revenue_at_risk += discountMetrics.potential_leakage;
    summary.leak_types_detected.push('discount_leakage');
  }

  return summary;
}

// ─── Classification & Risk ─────────────────────────────────────

/**
 * Classify a payment failure reason into severity buckets.
 * Returns { category: 'HIGH'|'MEDIUM'|'LOW', baseProbability: number, suggestedRetryDelay: string }
 */
function classifyFailure(payment) {
  const reason = (payment.failure_reason || '').toLowerCase();
  
  if (['insufficient_funds', 'card_declined', 'card_expired', 'cvv_mismatch'].includes(reason)) {
    return { category: 'HIGH', baseProbability: 0.85, suggestedRetryDelay: '2 days' };
  }
  
  if (['issuer_declined', 'network_timeout', 'rate_limit_exceeded', 'duplicate_request', 'upi_timeout', 'bank_unavailable'].includes(reason)) {
    return { category: 'MEDIUM', baseProbability: 0.55, suggestedRetryDelay: '4 hours' };
  }
  
  return { category: 'LOW', baseProbability: 0.25, suggestedRetryDelay: '7 days' };
}

/**
 * Calculate customer churn risk score (0.0 to 1.0).
 */
function calculateChurnRisk(customer) {
  let risk = 0.5; // Base risk

  // Recent failure volume is the strongest signal
  const recentFailures = customer.recent_failure_count || 0;
  if (recentFailures > 3) risk += 0.3;
  else if (recentFailures > 1) risk += 0.15;

  // LTV (Inverse correlation — higher LTV means they are stickier, lower risk of abandoning completely)
  const ltv = customer.lifetime_value || customer.ltv || 0;
  if (ltv > 50000) risk -= 0.2;
  else if (ltv > 10000) risk -= 0.1;

  // Total failure rate
  const total = customer.total_payments || 1;
  const failed = customer.failed_payments || 0;
  const failureRate = failed / total;
  
  if (failureRate > 0.5) risk += 0.2;
  else if (failureRate < 0.1) risk -= 0.1;

  return Math.max(0, Math.min(1, risk));
}

/**
 * Calculate expected ROI for a recovery opportunity.
 */
function calculateROI(recoveryAmount, expectedProbability, retryCost = 5, emailCost = 2) {
  const expectedRevenue = recoveryAmount * expectedProbability;
  const totalCost = retryCost + emailCost;
  
  if (totalCost === 0) return 0;
  
  return ((expectedRevenue - totalCost) / totalCost) * 100;
}

module.exports = {
  calculateRevenueMetrics,
  calculateRecoveryProbability,
  calculateExpectedRecovery,
  calculateRecoveryConfidence,
  calculatePriority,
  getInterventionEffectiveness,
  detectAnomalies,
  calculateCartRecoveryProbability,
  calculateDiscountLeakageScore,
  calculateLeakSummary,
  classifyFailure,
  calculateChurnRisk,
  calculateROI,
  INTERVENTION_EFFECTIVENESS,
};
