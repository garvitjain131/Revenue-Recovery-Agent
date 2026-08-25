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
function calculateRevenueAtRisk(failedPayments) {
  return failedPayments.reduce((total, p) => total + (p.amount || 0), 0);
}

// ─── Expected Recovery Value ───────────────────────────────────

/**
 * Expected Recovery = Revenue at Risk × Recovery Probability × Intervention Effectiveness - Cost
 */
function calculateExpectedRecovery(revenue_at_risk, recovery_probability, intervention_effectiveness = 0.85, intervention_cost = 0) {
  return Math.max(0, (revenue_at_risk * recovery_probability * intervention_effectiveness) - intervention_cost);
}

// ─── Intervention Effectiveness ────────────────────────────────

const INTERVENTION_EFFECTIVENESS = {
  'create_payment_link': 0.85,
  'send_notification': 0.60,
  'retry_payment': 0.70,
  'offer_discount': 0.75,
  'escalate_to_merchant': 0.50,
  'do_nothing': 0.10,
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
  const expected = revenue_at_risk * recovery_probability * urgency;

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

module.exports = {
  calculateRecoveryProbability,
  calculateRevenueAtRisk,
  calculateExpectedRecovery,
  calculatePriority,
  getInterventionEffectiveness,
  detectAnomalies,
  calculateRevenueMetrics,
  INTERVENTION_EFFECTIVENESS,
};
