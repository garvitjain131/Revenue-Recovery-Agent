/*
 * Opportunity Details API — GET /api/opportunities/[id]
 * 
 * Provides complete decision traceability for the "Why This Action?" modal:
 *   - Root cause diagnosis with confidence
 *   - Ranked strategy comparison (Selected vs Alternatives)
 *   - 14-Point Policy Guardian compliance checklist
 *   - Customer profile telemetry
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const db = require('@/lib/database');
    const strategyEngine = require('@/lib/recovery-strategy-engine');
    const policy = require('@/lib/policy-engine');

    const opportunityId = params.id;
    const { searchParams } = new URL(request.url);
    const merchantId = searchParams.get('merchant_id') || 'merchant_rzp_test';

    const opportunity = db.getRow('opportunities', { id: opportunityId });
    if (!opportunity) {
      return NextResponse.json({ error: 'Opportunity not found' }, { status: 404 });
    }

    const merchant = db.getRow('merchants', { id: merchantId }) || {
      id: merchantId,
      operating_mode: 'autonomous',
      guardrails: JSON.stringify(policy.DEFAULT_GUARDRAILS),
    };

    // 1. Fetch or Evaluate Strategies
    let strategies = strategyEngine.getStrategiesForOpportunity(opportunityId);
    let customerContext = null;

    if (opportunity.customer_id) {
      customerContext = db.getRow('customers', { id: opportunity.customer_id });
    }

    if (strategies.length === 0) {
      strategies = strategyEngine.evaluateStrategies(opportunity, customerContext);
      strategyEngine.persistStrategies(opportunityId, strategies);
    }

    const selectedStrategy = strategies.find(s => s.selected === 1) || strategies[0];

    // 2. Fetch Interventions History
    const interventions = db.getRows('interventions', { opportunity_id: opportunityId }, 'created_at DESC', 10);

    // 3. Run Policy Check for Full Transparency Checklist
    const policyValidation = policy.validateAction(
      {
        action: selectedStrategy.action,
        recommended_action: selectedStrategy.action,
        confidence: opportunity.recovery_probability,
        recovery_confidence: opportunity.recovery_probability,
        expected_recovery: selectedStrategy.expectedRecovery || selectedStrategy.expected_recovery,
        intervention_cost: selectedStrategy.interventionCost || selectedStrategy.intervention_cost || 0,
        risk_level: (selectedStrategy.customerFrictionScore || selectedStrategy.customer_friction_score || 0) > 0.3 ? 'medium' : 'low',
      },
      opportunity,
      merchant,
      interventions,
      customerContext,
      { budgetSpentToday: 0 }
    );

    // 4. Feature #4: Compute fallback diagnosis for AI vs Fallback diff view
    const llmReasoning = require('@/lib/llm-reasoning');

    // Build sanitized data from opportunity for the fallback function
    const sanitizedForFallback = {
      failed_payments_count: opportunity.affected_payments
        ? JSON.parse(opportunity.affected_payments).length
        : 0,
      revenue_at_risk: opportunity.revenue_at_risk || 0,
      anomalies: [],
      current_metrics: {},
      baseline_metrics: {},
      failure_reason_breakdown: {},
    };

    const fallbackDiag = llmReasoning.fallbackRootCauseAnalysis
      ? llmReasoning.fallbackRootCauseAnalysis(sanitizedForFallback)
      : null;

    // The AI diagnosis is stored on the opportunity's root cause
    const aiDiagnosis = {
      root_cause: opportunity.root_cause,
      confidence: opportunity.root_cause_confidence || opportunity.recovery_probability || 0,
      recommended_action: selectedStrategy?.action || 'create_payment_link',
      reason: opportunity.root_cause_reason || opportunity.description || '',
      risk_level: (selectedStrategy?.customer_friction_score || selectedStrategy?.customerFrictionScore || 0) > 0.3 ? 'medium' : 'low',
    };

    // Compare: show diff only when they meaningfully disagree
    const showDiff = fallbackDiag && (
      aiDiagnosis.root_cause !== fallbackDiag.root_cause ||
      aiDiagnosis.recommended_action !== fallbackDiag.recommended_action
    );

    // Hydrate affected transaction records
    const paymentIds = opportunity.affected_payments ? JSON.parse(opportunity.affected_payments) : [];
    let affected_transactions = [];
    if (Array.isArray(paymentIds) && paymentIds.length > 0) {
      const placeholders = paymentIds.map(() => '?').join(', ');
      affected_transactions = db.runQuery(
        `SELECT id, amount, currency, status, method, failure_reason, error_code, created_at 
         FROM payments WHERE id IN (${placeholders}) ORDER BY created_at DESC LIMIT 50`,
        paymentIds
      );
    }

    return NextResponse.json({
      opportunity: {
        ...opportunity,
        affected_payments: paymentIds,
        affected_customers: opportunity.affected_customers ? JSON.parse(opportunity.affected_customers) : [],
      },
      affected_transactions,
      customer: customerContext,
      strategies: strategies.map(s => ({
        id: s.id,
        action: s.action,
        name: strategyEngine.STRATEGY_DEFINITIONS[s.action]?.name || s.action,
        description: strategyEngine.STRATEGY_DEFINITIONS[s.action]?.description || '',
        recovery_probability: s.recovery_probability || s.recoveryProbability,
        expected_recovery: s.expected_recovery || s.expectedRecovery,
        intervention_cost: s.intervention_cost || s.interventionCost || 0,
        expected_risk_cost: s.expected_risk_cost || s.expectedRiskCost || 0,
        net_expected_recovery: s.net_expected_recovery || s.netExpectedRecovery,
        customer_friction_score: s.customer_friction_score || s.customerFrictionScore || 0,
        evidence_strength: s.evidence_strength || s.evidenceStrength || 0.8,
        strategy_rank: s.strategy_rank || s.strategyRank || 1,
        selected: Boolean(s.selected),
      })),
      selected_strategy: selectedStrategy,
      policy_decision: policyValidation,
      interventions,
      // Feature #4: Diagnosis comparison data
      diagnosis: fallbackDiag ? {
        ai: aiDiagnosis,
        fallback: fallbackDiag,
        showDiff: showDiff,
      } : null,
    });

  } catch (error) {
    console.error('[API] Opportunity details error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
