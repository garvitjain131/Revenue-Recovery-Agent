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

    return NextResponse.json({
      opportunity: {
        ...opportunity,
        affected_payments: opportunity.affected_payments ? JSON.parse(opportunity.affected_payments) : [],
        affected_customers: opportunity.affected_customers ? JSON.parse(opportunity.affected_customers) : [],
      },
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
    });

  } catch (error) {
    console.error('[API] Opportunity details error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
