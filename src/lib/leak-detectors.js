/*
 * leak-detectors.js
 * 
 * Three independent revenue leak detectors.
 * Each detector checks data availability first, then runs analysis.
 * Each returns standardized Opportunity objects.
 * 
 * Detectors:
 *   1. Payment Failure Recovery — from payments table
 *   2. Cart Abandonment Recovery — from cart_events table
 *   3. Discount Leakage Detection — from discounts table
 * 
 * If a detector's required data is unavailable, it returns:
 *   { available: false, reason: '...', opportunities: [] }
 * 
 * No data is fabricated. No fake opportunities are created.
 */

const db = require('./database');
const scoring = require('./scoring-engine');

// ─── Detector 1: Payment Failure Recovery ──────────────────────

/**
 * Detect payment failure recovery opportunities.
 * Requires: payments table data for this merchant.
 */
function detectPaymentFailures(merchant_id) {
  // Check data availability
  const paymentCount = db.runQuery(
    'SELECT COUNT(*) as count FROM payments WHERE merchant_id = ?',
    [merchant_id]
  )[0]?.count || 0;

  if (paymentCount === 0) {
    return {
      available: false,
      reason: 'No payment/transaction data available for this merchant.',
      opportunities: [],
      metrics: null,
    };
  }

  // Get all payments for analysis
  const allPayments = db.runQuery(
    'SELECT * FROM payments WHERE merchant_id = ? ORDER BY created_at DESC',
    [merchant_id]
  );

  const metrics = scoring.calculateRevenueMetrics(allPayments);

  // Find recent failed payments (configurable window)
  const failedPayments = allPayments.filter(p => p.status === 'failed');

  if (failedPayments.length === 0) {
    return {
      available: true,
      reason: 'No failed payments found.',
      opportunities: [],
      metrics,
    };
  }

  // Baseline comparison — split by time for anomaly detection
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const recentPayments = allPayments.filter(p => p.created_at >= twoHoursAgo);
  const baselinePayments = allPayments.filter(p => p.created_at < twoHoursAgo);

  const currentMetrics = scoring.calculateRevenueMetrics(recentPayments);
  const baselineMetrics = scoring.calculateRevenueMetrics(baselinePayments);
  const anomalies = scoring.detectAnomalies(currentMetrics, baselineMetrics);

  // Score each failed payment for recovery probability
  const scoredPayments = [];
  for (const payment of failedPayments) {
    const customer = payment.customer_id
      ? db.getRow('customers', { id: payment.customer_id })
      : null;
    const probability = scoring.calculateRecoveryProbability(payment, customer);
    scoredPayments.push({
      ...payment,
      recovery_probability: probability,
      customer_name: customer?.name || null,
      customer_ltv: customer?.lifetime_value || 0,
    });
  }

  // Sort by expected recovery value (amount × probability)
  scoredPayments.sort((a, b) =>
    (b.amount * b.recovery_probability) - (a.amount * a.recovery_probability)
  );

  // Group by customer for repeat failure detection
  const customerFailures = {};
  for (const p of scoredPayments) {
    if (p.customer_id) {
      if (!customerFailures[p.customer_id]) customerFailures[p.customer_id] = [];
      customerFailures[p.customer_id].push(p);
    }
  }

  // Build opportunities
  const opportunities = [];

  // Opportunity: High-value individual failures (up to 50 per scan)
  const highValueFailed = scoredPayments.filter(p => p.amount >= 500 && p.recovery_probability >= 0.4);
  for (const payment of highValueFailed.slice(0, 50)) {
    const evidence = [];
    const customer = payment.customer_id ? db.getRow('customers', { id: payment.customer_id }) : null;
    if (customer) {
      if (customer.successful_payments > 0) evidence.push(`${customer.successful_payments} previous successful payments`);
      if (customer.lifetime_value > 0) evidence.push(`Customer lifetime value: ₹${Math.round(customer.lifetime_value).toLocaleString()}`);
    }
    evidence.push(`Failed payment amount: ₹${Math.round(payment.amount).toLocaleString()}`);
    evidence.push(`Payment method: ${payment.method || 'unknown'}`);
    if (payment.failure_reason) evidence.push(`Failure reason: ${payment.failure_reason}`);
    evidence.push(`Recovery probability: ${(payment.recovery_probability * 100).toFixed(0)}%`);

    const expectedRecovery = scoring.calculateExpectedRecovery(
      payment.amount,
      payment.recovery_probability
    );

    opportunities.push({
      type: 'payment_failure',
      customer_id: payment.customer_id,
      source_record_id: payment.id,
      amount_at_risk: payment.amount,
      recovery_probability: payment.recovery_probability,
      expected_recovery: expectedRecovery,
      evidence,
      recommended_actions: ['create_payment_link', 'send_notification', 'retry_payment'],
      priority: scoring.calculatePriority(payment.amount, payment.recovery_probability).priority,
    });
  }

  // Opportunity: Repeat customer failures
  for (const [custId, failures] of Object.entries(customerFailures)) {
    if (failures.length >= 2) {
      const totalAtRisk = failures.reduce((s, f) => s + f.amount, 0);
      const avgProb = failures.reduce((s, f) => s + f.recovery_probability, 0) / failures.length;
      const customer = db.getRow('customers', { id: custId });
      const evidence = [
        `${failures.length} failed payments from same customer`,
        `Total at risk: ₹${Math.round(totalAtRisk).toLocaleString()}`,
      ];
      if (customer) {
        evidence.push(`Customer: ${customer.name || custId}`);
        if (customer.successful_payments > 0) evidence.push(`${customer.successful_payments} previous successful payments`);
      }

      // Avoid duplicating with individual opportunities
      const alreadyCovered = opportunities.some(o => o.customer_id === custId && o.type === 'payment_failure');
      if (!alreadyCovered) {
        opportunities.push({
          type: 'payment_failure',
          customer_id: custId,
          source_record_id: failures[0].id,
          amount_at_risk: totalAtRisk,
          recovery_probability: avgProb,
          expected_recovery: scoring.calculateExpectedRecovery(totalAtRisk, avgProb),
          evidence,
          recommended_actions: ['create_payment_link', 'send_notification'],
          priority: scoring.calculatePriority(totalAtRisk, avgProb).priority,
        });
      }
    }
  }

  return {
    available: true,
    opportunities,
    metrics,
    anomalies,
    current_metrics: currentMetrics,
    baseline_metrics: baselineMetrics,
    total_failed: failedPayments.length,
    total_at_risk: failedPayments.reduce((s, p) => s + p.amount, 0),
    top_payments: scoredPayments.slice(0, 20),
  };
}

// ─── Detector 2: Cart Abandonment Recovery ─────────────────────

/**
 * Detect cart abandonment recovery opportunities.
 * Requires: cart_events table data for this merchant.
 */
function detectCartAbandonment(merchant_id) {
  // Check data availability
  const cartDataSource = db.runQuery(
    'SELECT SUM(accepted_count) as count FROM data_sources WHERE merchant_id = ? AND data_type = ?',
    [merchant_id, 'cart_events']
  )[0];

  const cartCount = cartDataSource?.count || 0;
  if (cartCount === 0) {
    // Also check raw table
    const rawCount = db.runQuery(
      'SELECT COUNT(*) as count FROM cart_events WHERE merchant_id = ?',
      [merchant_id]
    )[0]?.count || 0;

    if (rawCount === 0) {
      return {
        available: false,
        reason: 'Cart/checkout data not provided. Upload cart_events data to enable cart abandonment analysis.',
        opportunities: [],
        metrics: null,
      };
    }
  }

  // Get checkout events that didn't convert to purchase
  const checkoutEvents = db.runQuery(
    `SELECT ce.* FROM cart_events ce
     WHERE ce.merchant_id = ? AND ce.event_type = 'checkout_started'
     AND NOT EXISTS (
       SELECT 1 FROM cart_events ce2
       WHERE ce2.merchant_id = ce.merchant_id
         AND ce2.customer_id = ce.customer_id
         AND ce2.event_type = 'purchased'
         AND ce2.created_at >= ce.created_at
     )
     ORDER BY ce.cart_value DESC`,
    [merchant_id]
  );

  const totalCheckouts = db.runQuery(
    `SELECT COUNT(*) as count FROM cart_events WHERE merchant_id = ? AND event_type = 'checkout_started'`,
    [merchant_id]
  )[0]?.count || 0;

  const totalPurchased = db.runQuery(
    `SELECT COUNT(*) as count FROM cart_events WHERE merchant_id = ? AND event_type = 'purchased'`,
    [merchant_id]
  )[0]?.count || 0;

  const abandonmentRate = totalCheckouts > 0 ? (checkoutEvents.length / totalCheckouts) : 0;
  const totalAbandonedValue = checkoutEvents.reduce((s, e) => s + (e.cart_value || 0), 0);

  if (checkoutEvents.length === 0) {
    return {
      available: true,
      reason: 'No abandoned checkouts found.',
      opportunities: [],
      metrics: {
        total_checkouts: totalCheckouts,
        total_purchased: totalPurchased,
        abandonment_rate: 0,
        abandoned_value: 0,
      },
    };
  }

  // Score each abandonment
  const opportunities = [];
  for (const event of checkoutEvents.slice(0, 20)) {
    const customer = event.customer_id
      ? db.getRow('customers', { id: event.customer_id })
      : null;

    // Calculate recovery probability based on customer signals
    const probability = scoring.calculateCartRecoveryProbability
      ? scoring.calculateCartRecoveryProbability(event, customer)
      : estimateCartRecovery(event, customer);

    if (probability < 0.2 || event.cart_value < 500) continue; // Skip low-intent

    const evidence = [];
    evidence.push(`Abandoned cart value: ₹${Math.round(event.cart_value).toLocaleString()}`);
    if (event.product_name) evidence.push(`Product: ${event.product_name}`);
    if (customer) {
      if (customer.successful_payments > 0) evidence.push(`${customer.successful_payments} previous purchases`);
      if (customer.lifetime_value > 0) evidence.push(`Customer LTV: ₹${Math.round(customer.lifetime_value).toLocaleString()}`);
      evidence.push(`Customer: ${customer.name || event.customer_id}`);
    }
    evidence.push(`Recovery probability: ${(probability * 100).toFixed(0)}%`);

    const expectedRecovery = scoring.calculateExpectedRecovery(
      event.cart_value,
      probability,
      0.65 // cart reminder effectiveness
    );

    opportunities.push({
      type: 'cart_abandonment',
      customer_id: event.customer_id,
      source_record_id: event.id,
      amount_at_risk: event.cart_value,
      recovery_probability: probability,
      expected_recovery: expectedRecovery,
      evidence,
      recommended_actions: ['send_cart_reminder', 'send_notification'],
      priority: scoring.calculatePriority(event.cart_value, probability).priority,
    });
  }

  return {
    available: true,
    opportunities,
    metrics: {
      total_checkouts: totalCheckouts,
      total_purchased: totalPurchased,
      abandoned_count: checkoutEvents.length,
      abandonment_rate: abandonmentRate,
      abandoned_value: totalAbandonedValue,
    },
  };
}

/**
 * Fallback cart recovery probability estimation.
 */
function estimateCartRecovery(event, customer) {
  let score = 0.30;

  if (customer) {
    if (customer.successful_payments > 5) score += 0.20;
    else if (customer.successful_payments > 2) score += 0.10;
    else if (customer.successful_payments > 0) score += 0.05;

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
  if (event.cart_value > 10000) score += 0.05;
  else if (event.cart_value < 500) score -= 0.10;

  return Math.max(0.05, Math.min(0.90, score));
}

// ─── Detector 3: Discount Leakage ──────────────────────────────

/**
 * Detect potential unnecessary discounts (margin leakage).
 * Requires: discounts table data for this merchant.
 */
function detectDiscountLeakage(merchant_id) {
  // Check data availability
  const discountDataSource = db.runQuery(
    'SELECT SUM(accepted_count) as count FROM data_sources WHERE merchant_id = ? AND data_type = ?',
    [merchant_id, 'discounts']
  )[0];

  const discountCount = discountDataSource?.count || 0;
  if (discountCount === 0) {
    const rawCount = db.runQuery(
      'SELECT COUNT(*) as count FROM discounts WHERE merchant_id = ?',
      [merchant_id]
    )[0]?.count || 0;

    if (rawCount === 0) {
      return {
        available: false,
        reason: 'Discount/coupon data not provided. Upload discount data to enable discount leakage analysis.',
        opportunities: [],
        metrics: null,
      };
    }
  }

  // Get all discounts with customer context
  const discountsWithCustomers = db.runQuery(
    `SELECT d.*, c.total_payments, c.successful_payments, c.lifetime_value, c.name as customer_name,
            c.last_payment_at
     FROM discounts d
     LEFT JOIN customers c ON d.customer_id = c.id AND c.merchant_id = d.merchant_id
     WHERE d.merchant_id = ?
     ORDER BY d.discount_amount DESC`,
    [merchant_id]
  );

  if (discountsWithCustomers.length === 0) {
    return {
      available: true,
      reason: 'No discount records found.',
      opportunities: [],
      metrics: { total_discounts: 0, total_leakage: 0 },
    };
  }

  const totalDiscountValue = discountsWithCustomers.reduce((s, d) => s + d.discount_amount, 0);

  // Identify potentially unnecessary discounts
  const opportunities = [];
  let potentialLeakage = 0;

  for (const discount of discountsWithCustomers) {
    // Score: is this discount likely unnecessary?
    const leakageScore = calculateDiscountLeakageScore(discount);

    if (leakageScore < 0.5) continue; // Not suspicious enough

    potentialLeakage += discount.discount_amount;

    const evidence = [];
    evidence.push(`Discount amount: ₹${Math.round(discount.discount_amount).toLocaleString()}`);
    evidence.push(`Original amount: ₹${Math.round(discount.original_amount).toLocaleString()}`);
    if (discount.discount_code) evidence.push(`Coupon code: ${discount.discount_code}`);
    if (discount.customer_name) evidence.push(`Customer: ${discount.customer_name}`);
    if (discount.successful_payments > 5) {
      evidence.push(`${discount.successful_payments} previous purchases — high repeat buyer`);
    }
    if (discount.lifetime_value > 10000) {
      evidence.push(`Customer LTV: ₹${Math.round(discount.lifetime_value).toLocaleString()}`);
    }
    evidence.push(`Leakage confidence: ${(leakageScore * 100).toFixed(0)}%`);
    evidence.push('Note: This is a potential unnecessary discount, not a definitive finding.');

    opportunities.push({
      type: 'discount_leakage',
      customer_id: discount.customer_id,
      source_record_id: discount.id,
      amount_at_risk: discount.discount_amount,
      recovery_probability: leakageScore,
      expected_recovery: discount.discount_amount * leakageScore * 0.5, // conservative
      evidence,
      recommended_actions: ['flag_discount_review'],
      priority: scoring.calculatePriority(discount.discount_amount, leakageScore).priority,
    });
  }

  // Sort by amount at risk
  opportunities.sort((a, b) => b.amount_at_risk - a.amount_at_risk);

  return {
    available: true,
    opportunities: opportunities.slice(0, 15),
    metrics: {
      total_discounts: discountsWithCustomers.length,
      total_discount_value: totalDiscountValue,
      potential_leakage: potentialLeakage,
      flagged_count: opportunities.length,
    },
  };
}

/**
 * Score whether a discount was potentially unnecessary.
 * Returns 0.0–1.0.
 * 
 * Higher score = more likely the customer would have purchased anyway.
 * 
 * Based on:
 *   - Repeat purchase frequency
 *   - Customer lifetime value
 *   - Recent activity (active customers buy regardless)
 *   - Discount as % of order (small discounts on big orders are normal)
 */
function calculateDiscountLeakageScore(discount) {
  let score = 0.20; // base

  // Repeat buyer signal
  const purchases = discount.successful_payments || 0;
  if (purchases > 10) score += 0.30;
  else if (purchases > 5) score += 0.20;
  else if (purchases > 2) score += 0.10;

  // LTV signal
  const ltv = discount.lifetime_value || 0;
  if (ltv > 50000) score += 0.15;
  else if (ltv > 20000) score += 0.10;
  else if (ltv > 5000) score += 0.05;

  // Recent activity signal
  if (discount.last_payment_at) {
    const daysSince = (Date.now() - new Date(discount.last_payment_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince < 7) score += 0.10;
    else if (daysSince < 30) score += 0.05;
  }

  // Discount proportion signal (large discounts are more intentional)
  if (discount.original_amount > 0) {
    const discountPercent = discount.discount_amount / discount.original_amount;
    if (discountPercent < 0.05) score -= 0.10; // tiny discount, probably fine
    if (discountPercent > 0.30) score -= 0.10; // large discount, probably intentional strategy
  }

  return Math.max(0.0, Math.min(0.95, score));
}

// ─── Unified Detection ─────────────────────────────────────────

/**
 * Run all available detectors for a merchant.
 * Returns results from each detector with availability status.
 */
function detectAllLeaks(merchant_id) {
  const paymentResult = detectPaymentFailures(merchant_id);
  const cartResult = detectCartAbandonment(merchant_id);
  const discountResult = detectDiscountLeakage(merchant_id);

  // Combine all opportunities across types
  const allOpportunities = [
    ...paymentResult.opportunities,
    ...cartResult.opportunities,
    ...discountResult.opportunities,
  ];

  // Sort by expected recovery value
  allOpportunities.sort((a, b) => b.expected_recovery - a.expected_recovery);

  // Data availability summary
  const dataStatus = {
    transactions: { available: paymentResult.available, reason: paymentResult.reason || null },
    cart_events: { available: cartResult.available, reason: cartResult.reason || null },
    discounts: { available: discountResult.available, reason: discountResult.reason || null },
  };

  // Build failure_reason_breakdown and top_affected_payments from payment result
  const failedPayments = paymentResult.top_payments || [];
  const failure_reason_breakdown = {};
  for (const p of failedPayments) {
    const reason = p.failure_reason || 'unknown';
    failure_reason_breakdown[reason] = (failure_reason_breakdown[reason] || 0) + 1;
  }

  return {
    opportunities: allOpportunities,
    payment_result: paymentResult,
    cart_result: cartResult,
    discount_result: discountResult,
    data_status: dataStatus,
    total_opportunities: allOpportunities.length,
    total_at_risk: allOpportunities.reduce((s, o) => s + o.amount_at_risk, 0),
    total_expected_recovery: allOpportunities.reduce((s, o) => s + o.expected_recovery, 0),
    // Fields expected by orchestrator and LLM reasoning
    top_affected_payments: failedPayments.slice(0, 20),
    failed_payments_count: paymentResult.total_failed || 0,
    revenue_at_risk: paymentResult.total_at_risk || 0,
    failure_reason_breakdown,
    // Pass through metrics for LLM root cause analysis
    current_metrics: paymentResult.current_metrics || null,
    baseline_metrics: paymentResult.baseline_metrics || null,
    anomalies: paymentResult.anomalies || [],
  };
}

module.exports = {
  detectPaymentFailures,
  detectCartAbandonment,
  detectDiscountLeakage,
  detectAllLeaks,
};
