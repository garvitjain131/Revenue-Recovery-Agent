/*
 * recovery-strategy-engine.js
 * 
 * Deterministic Recovery Strategy Generation, Scoring, and Ranking Engine.
 * 
 * Centralizes the calculation of Expected Recovery Value, Intervention Costs,
 * Customer Friction, and Net Expected Recovery.
 * 
 * Formula:
 *   Expected Recovery = Revenue At Risk × Recovery Probability × Intervention Effectiveness
 *   Net Expected Recovery = Expected Recovery - Intervention Cost - Expected Risk Cost
 * 
 * Crucial Rule: The LLM NEVER calculates these financial numbers.
 * The strategy engine calculates all numbers deterministically, ranks options,
 * and maintains evaluated alternatives for full decision explainability.
 */

const scoring = require('./scoring-engine');
const db = require('./database');

// ─── Strategy Definitions & Parameter Configuration ────────────

const STRATEGY_DEFINITIONS = {
  create_payment_link: {
    action: 'create_payment_link',
    name: 'Create Payment Link',
    base_effectiveness: 0.85,
    intervention_cost: 0, // No direct messaging surcharge
    base_friction: 0.15,
    supported_types: ['payment_failure', 'cart_abandonment', 'repeat_failure'],
    description: 'Generate and send a secured Razorpay Payment Link allowing the customer to pay using any active payment method.',
  },
  send_notification: {
    action: 'send_notification',
    name: 'Send Payment Reminder',
    base_effectiveness: 0.60,
    intervention_cost: 2.0, // SMS/WhatsApp carrier cost
    base_friction: 0.20,
    supported_types: ['payment_failure', 'cart_abandonment'],
    description: 'Send an omnichannel reminder notification prompting the customer to re-attempt payment.',
  },
  retry_payment: {
    action: 'retry_payment',
    name: 'Silent Payment Retry',
    base_effectiveness: 0.70,
    intervention_cost: 0,
    base_friction: 0.05,
    supported_types: ['payment_failure'],
    description: 'Silently re-attempt the transaction through the payment gateway for transient/network errors.',
  },
  request_alternate_payment_method: {
    action: 'request_alternate_payment_method',
    name: 'Request Alternate Payment Method',
    base_effectiveness: 0.80,
    intervention_cost: 2.0,
    base_friction: 0.25,
    supported_types: ['payment_failure', 'repeat_failure'],
    description: 'Direct the customer to switch from a degraded payment rail (e.g. failing UPI) to Cards or Netbanking.',
  },
  escalate_to_merchant: {
    action: 'escalate_to_merchant',
    name: 'Manual Account Manager Review',
    base_effectiveness: 0.50,
    intervention_cost: 50.0, // High internal operational handling cost
    base_friction: 0.10,
    supported_types: ['payment_failure', 'high_value_failure', 'discount_leakage'],
    description: 'Escalate to merchant finance/operations team for manual high-touch outreach.',
  },
  flag_discount_review: {
    action: 'flag_discount_review',
    name: 'Flag Margin Leakage Review',
    base_effectiveness: 0.90,
    intervention_cost: 5.0,
    base_friction: 0.0,
    supported_types: ['discount_leakage'],
    description: 'Flag coupon and discount abuse patterns for merchant promotional policy adjustment.',
  },
  do_nothing: {
    action: 'do_nothing',
    name: 'No Action (Passive Monitoring)',
    base_effectiveness: 0.05,
    intervention_cost: 0,
    base_friction: 0.0,
    supported_types: ['payment_failure', 'cart_abandonment', 'discount_leakage'],
    description: 'Take no active intervention. Rely strictly on natural customer return without outbound friction.',
  },
};

/**
 * Generate, score, and rank all viable recovery strategies for an opportunity.
 * 
 * @param {Object} opportunity - The opportunity record
 * @param {Object} customer - Customer revenue profile (if available)
 * @param {Object} context - Anomaly and payment failure context
 * @returns {Array<Object>} Ranked array of evaluated recovery strategies
 */
function evaluateStrategies(opportunity, customer = null, context = {}) {
  const revenueAtRisk = Math.max(0, opportunity.revenue_at_risk || 0);
  const baseProbability = opportunity.recovery_probability || 0.5;
  const oppType = opportunity.type || 'payment_failure';

  const candidateActions = Object.keys(STRATEGY_DEFINITIONS).filter(actionKey => {
    const def = STRATEGY_DEFINITIONS[actionKey];
    return def.supported_types.includes(oppType) || def.supported_types.includes('payment_failure');
  });

  const evaluatedStrategies = candidateActions.map(actionKey => {
    const def = STRATEGY_DEFINITIONS[actionKey];
    return scoreSingleStrategy(def, revenueAtRisk, baseProbability, customer, context);
  });

  // Deterministically rank strategies by netExpectedRecovery descending
  evaluatedStrategies.sort((a, b) => {
    if (b.netExpectedRecovery !== a.netExpectedRecovery) {
      return b.netExpectedRecovery - a.netExpectedRecovery;
    }
    return b.recoveryProbability - a.recoveryProbability;
  });

  // Assign ranks and selection flag
  evaluatedStrategies.forEach((strat, index) => {
    strat.strategyRank = index + 1;
    strat.selected = index === 0;
  });

  return evaluatedStrategies;
}

/**
 * Deterministically score an individual strategy.
 */
function scoreSingleStrategy(strategyDef, revenueAtRisk, baseProbability, customer, context) {
  let adjustedEffectiveness = strategyDef.base_effectiveness;
  let adjustedProbability = baseProbability;
  let frictionScore = strategyDef.base_friction;

  // Contextual adjustments based on payment failure characteristics
  if (context.isMethodDegraded) {
    if (strategyDef.action === 'retry_payment') {
      // Retrying the same degraded method has severely lower effectiveness
      adjustedEffectiveness *= 0.35;
      frictionScore += 0.20;
    } else if (strategyDef.action === 'create_payment_link' || strategyDef.action === 'request_alternate_payment_method') {
      // Payment links provide alternative payment rails, increasing effectiveness
      adjustedEffectiveness = Math.min(0.95, adjustedEffectiveness * 1.15);
    }
  }

  // Adjust for repeat attempts
  const attemptCount = context.attemptCount || 0;
  if (attemptCount > 1) {
    if (strategyDef.action === 'retry_payment') {
      adjustedEffectiveness *= Math.pow(0.65, attemptCount - 1);
    }
    frictionScore = Math.min(1.0, frictionScore + (attemptCount * 0.15));
  }

  // Customer signals
  let evidenceStrength = 0.60;
  if (customer) {
    evidenceStrength += 0.25;
    if (customer.do_not_contact && (strategyDef.action === 'send_notification' || strategyDef.action === 'request_alternate_payment_method')) {
      // Strict penalty for contacting opted-out customers
      frictionScore = 1.0;
      adjustedEffectiveness = 0.0;
    }
    if (customer.lifetime_value > 50000 && strategyDef.action === 'escalate_to_merchant') {
      // High LTV justifies manual review
      adjustedEffectiveness = 0.85;
    }
  }

  // Calculate Expected Recovery
  const expectedRecovery = Math.round(revenueAtRisk * adjustedProbability * adjustedEffectiveness);

  // Intervention Cost (direct INR cost)
  const interventionCost = strategyDef.intervention_cost;

  // Expected Risk Cost: monetary valuation of customer annoyance / brand friction
  // Higher friction on high-value customers carries a higher implicit risk cost
  const riskMultiplier = customer && customer.lifetime_value > 25000 ? 0.02 : 0.005;
  const expectedRiskCost = Math.round(revenueAtRisk * frictionScore * riskMultiplier);

  // Net Expected Recovery
  const netExpectedRecovery = Math.max(0, expectedRecovery - interventionCost - expectedRiskCost);

  return {
    action: strategyDef.action,
    name: strategyDef.name,
    description: strategyDef.description,
    recoveryProbability: parseFloat(adjustedProbability.toFixed(4)),
    effectiveness: parseFloat(adjustedEffectiveness.toFixed(4)),
    expectedRecovery: expectedRecovery,
    interventionCost: interventionCost,
    expectedRiskCost: expectedRiskCost,
    netExpectedRecovery: netExpectedRecovery,
    customerFrictionScore: parseFloat(frictionScore.toFixed(4)),
    evidenceStrength: parseFloat(Math.min(1.0, evidenceStrength).toFixed(4)),
  };
}

/**
 * Persist evaluated strategies to database for an opportunity.
 */
function persistStrategies(opportunityId, evaluatedStrategies) {
  if (!opportunityId || !Array.isArray(evaluatedStrategies)) return;

  try {
    // Delete existing strategies for this opportunity to maintain single active evaluation
    db.runExec('DELETE FROM recovery_strategies WHERE opportunity_id = ?', [opportunityId]);

    for (const strat of evaluatedStrategies) {
      const id = db.generateId('strat');
      db.insertRow('recovery_strategies', {
        id,
        opportunity_id: opportunityId,
        action: strat.action,
        recovery_probability: strat.recoveryProbability,
        expected_recovery: strat.expectedRecovery,
        intervention_cost: strat.interventionCost,
        expected_risk_cost: strat.expectedRiskCost,
        net_expected_recovery: strat.netExpectedRecovery,
        customer_friction_score: strat.customerFrictionScore,
        evidence_strength: strat.evidenceStrength,
        strategy_rank: strat.strategyRank,
        selected: strat.selected ? 1 : 0,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error('[RecoveryStrategyEngine] Failed to persist strategies:', err.message);
  }
}

/**
 * Retrieve saved strategies for an opportunity.
 */
function getStrategiesForOpportunity(opportunityId) {
  return db.getRows('recovery_strategies', { opportunity_id: opportunityId }, 'strategy_rank ASC', 20);
}

module.exports = {
  STRATEGY_DEFINITIONS,
  evaluateStrategies,
  scoreSingleStrategy,
  persistStrategies,
  getStrategiesForOpportunity,
};
