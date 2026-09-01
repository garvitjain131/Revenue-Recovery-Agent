/*
 * Dashboard API — GET /api/dashboard
 * 
 * Returns all real-time financial metrics, recovery funnel, opportunity queue,
 * budget tracking, and audit trace for the Revenue Command Center.
 * 
 * All monetary values originate from stored database & attribution records.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const db = require('@/lib/database');
    const dataIngestion = require('@/lib/data-ingestion');
    const policy = require('@/lib/policy-engine');

    const { searchParams } = new URL(request.url);
    const merchant_id = searchParams.get('merchant_id') || 'merchant_rzp_test';

    // 1. Merchant Profile & Policy Guardrails
    const merchant = db.getRow('merchants', { id: merchant_id }) || {
      id: merchant_id,
      name: 'TechBazaar India',
      operating_mode: 'autonomous',
      guardrails: JSON.stringify(policy.DEFAULT_GUARDRAILS),
    };
    const guardrails = policy.parseGuardrails(merchant.guardrails);

    // 2. Payments & Financial Metrics
    const allPayments = db.runQuery(
      'SELECT amount, status, method, failure_reason, created_at FROM payments WHERE merchant_id = ? ORDER BY created_at DESC',
      [merchant_id]
    );

    const totalProcessed = allPayments.reduce((s, p) => s + p.amount, 0);
    const failedPayments = allPayments.filter(p => p.status === 'failed');
    const successfulPayments = allPayments.filter(p => p.status === 'captured' || p.status === 'authorized');
    
    const revenueAtRisk = failedPayments.reduce((s, p) => s + p.amount, 0);
    const totalSuccessfulRevenue = successfulPayments.reduce((s, p) => s + p.amount, 0);
    const failureRate = allPayments.length > 0 ? (failedPayments.length / allPayments.length) : 0;

    // 3. Opportunities
    const opportunities = db.runQuery(
      'SELECT * FROM opportunities WHERE merchant_id = ? ORDER BY revenue_at_risk DESC LIMIT 30',
      [merchant_id]
    );

    const recoverableRevenue = opportunities
      .filter(o => o.status !== 'blocked')
      .reduce((s, o) => s + (o.expected_recovery || 0), 0);

    // 4. Single-Source Revenue Attribution & Interventions
    const attributions = db.runQuery(
      'SELECT * FROM recovery_attributions WHERE merchant_id = ? ORDER BY created_at DESC',
      [merchant_id]
    );
    const totalRecoveredRevenue = attributions.reduce((s, a) => s + a.amount_recovered, 0);

    const interventions = db.runQuery(
      'SELECT * FROM interventions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 30',
      [merchant_id]
    );
    const executedInterventions = interventions.filter(i => i.execution_status === 'executed');
    const addressedRevenue = executedInterventions.reduce((s, i) => s + (i.expected_recovery || 0), 0);
    const totalInterventionCost = executedInterventions.length * 2.0; // ₹2 average cost per intervention
    const netRecoveredRevenue = Math.max(0, totalRecoveredRevenue - totalInterventionCost);
    const recoveryRate = revenueAtRisk > 0 ? (totalRecoveredRevenue / revenueAtRisk) : 0;

    // 5. Recovery Funnel Data
    const funnel = [
      { stage: 'Processed', label: 'Revenue Processed', value: totalProcessed, count: allPayments.length, isCurrency: true },
      { stage: 'At Risk', label: 'Revenue At Risk', value: revenueAtRisk, count: failedPayments.length, isCurrency: true },
      { stage: 'Recoverable', label: 'Recoverable Revenue', value: Math.round(recoverableRevenue), count: opportunities.length, isCurrency: true },
      { stage: 'Addressed', label: 'Interventions Executed', value: Math.round(addressedRevenue), count: executedInterventions.length, isCurrency: true },
      { stage: 'Recovered', label: 'Revenue Recovered', value: totalRecoveredRevenue, count: attributions.length, isCurrency: true },
    ];

    // 6. Pending Approvals
    const pendingApprovals = interventions.filter(i => i.approval_status === 'awaiting_approval');

    // 7. Recent Agent Runs
    const agentRuns = db.runQuery(
      'SELECT * FROM agent_runs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 10',
      [merchant_id]
    );

    // 8. Immutable Audit Trail
    const auditLogs = db.runQuery(
      'SELECT * FROM audit_logs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 40',
      [merchant_id]
    );

    // 9. Recovered Revenue Timeline Feed
    const recoveryFeed = attributions.map(a => ({
      id: a.id,
      amount: a.amount_recovered,
      opportunity_id: a.opportunity_id,
      intervention_id: a.intervention_id,
      timestamp: a.created_at,
      method: a.attribution_method,
    }));

    // 10. Operational Budget Tracking
    const dailyBudget = guardrails.daily_recovery_budget || 50000;
    const budgetSpent = totalInterventionCost;
    const budgetRemaining = Math.max(0, dailyBudget - budgetSpent);

    // 11. Data Source Telemetry
    const dataStatus = dataIngestion.getDataAvailability(merchant_id);

    return NextResponse.json({
      merchant: {
        id: merchant.id,
        name: merchant.name,
        operating_mode: merchant.operating_mode,
        guardrails,
      },
      metrics: {
        total_processed: totalProcessed,
        revenue_at_risk: revenueAtRisk,
        recoverable_revenue: Math.round(recoverableRevenue),
        total_recovered: totalRecoveredRevenue,
        net_recovered: netRecoveredRevenue,
        recovery_rate: recoveryRate,
        failure_rate: failureRate,
        total_payments: allPayments.length,
        failed_count: failedPayments.length,
        recovered_count: attributions.length,
        active_opportunities_count: opportunities.filter(o => o.status !== 'recovered' && o.status !== 'not_recovered').length,
      },
      budget: {
        daily_budget: dailyBudget,
        budget_spent_today: budgetSpent,
        budget_remaining: budgetRemaining,
        budget_utilization_pct: dailyBudget > 0 ? (budgetSpent / dailyBudget) * 100 : 0,
      },
      funnel,
      opportunities: opportunities.map(o => ({
        ...o,
        affected_payments: o.affected_payments ? JSON.parse(o.affected_payments) : [],
        affected_customers: o.affected_customers ? JSON.parse(o.affected_customers) : [],
      })),
      pending_approvals: pendingApprovals,
      interventions,
      recovery_feed: recoveryFeed,
      agent_runs: agentRuns.map(r => ({
        ...r,
        steps: r.steps ? JSON.parse(r.steps) : [],
      })),
      audit_logs: auditLogs.map(l => ({
        ...l,
        event_data: l.event_data ? JSON.parse(l.event_data) : {},
      })),
      data_status: dataStatus,
    });

  } catch (error) {
    console.error('[API] Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
