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
    let merchant_id = searchParams.get('merchant_id');
    if (!merchant_id || merchant_id === 'null' || merchant_id === 'undefined') {
      merchant_id = 'merchant_rzp_test';
    }

    // 1. Merchant Profile & Policy Guardrails
    const merchant = db.getRow('merchants', { id: merchant_id }) || {
      id: merchant_id,
      name: 'TechBazaar India',
      operating_mode: 'autonomous',
      guardrails: JSON.stringify(policy.DEFAULT_GUARDRAILS),
    };
    const guardrails = policy.parseGuardrails(merchant.guardrails);

    // 2. Payments & Financial Metrics via SQL aggregation
    const paymentMetrics = db.runQuery(
      `SELECT 
        COUNT(*) as total_payments,
        COALESCE(SUM(amount), 0) as total_processed,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) as revenue_at_risk,
        COALESCE(SUM(CASE WHEN status IN ('captured', 'authorized') THEN 1 ELSE 0 END), 0) as successful_count,
        COALESCE(SUM(CASE WHEN status IN ('captured', 'authorized') THEN amount ELSE 0 END), 0) as successful_volume
      FROM payments WHERE merchant_id = ?`,
      [merchant_id]
    )[0] || {
      total_payments: 0,
      total_processed: 0,
      failed_count: 0,
      revenue_at_risk: 0,
      successful_count: 0,
      successful_volume: 0,
    };

    const totalProcessed = Math.round(paymentMetrics.total_processed * 100) / 100;
    const revenueAtRisk = Math.round(paymentMetrics.revenue_at_risk * 100) / 100;
    const totalPaymentsCount = paymentMetrics.total_payments || 0;
    const failedPaymentsCount = paymentMetrics.failed_count || 0;
    const failureRate = totalPaymentsCount > 0 ? (failedPaymentsCount / totalPaymentsCount) : 0;

    // 3. Opportunities Metrics via SQL
    const oppMetrics = db.runQuery(
      `SELECT 
        COUNT(*) as total_opps,
        COALESCE(SUM(CASE WHEN status != 'blocked' THEN expected_recovery ELSE 0 END), 0) as recoverable_revenue,
        COALESCE(SUM(CASE WHEN status NOT IN ('recovered', 'not_recovered') THEN 1 ELSE 0 END), 0) as active_opps_count
      FROM opportunities WHERE merchant_id = ?`,
      [merchant_id]
    )[0] || { total_opps: 0, recoverable_revenue: 0, active_opps_count: 0 };

    const recoverableRevenue = Math.round(oppMetrics.recoverable_revenue * 100) / 100;
    const totalOppsCount = oppMetrics.total_opps || 0;
    const activeOppsCount = oppMetrics.active_opps_count || 0;

    const opportunities = db.runQuery(
      'SELECT * FROM opportunities WHERE merchant_id = ? ORDER BY revenue_at_risk DESC LIMIT 50',
      [merchant_id]
    );

    // 4. Single-Source Revenue Attribution & Interventions via SQL
    const attrMetrics = db.runQuery(
      `SELECT 
        COUNT(*) as total_attributions,
        COALESCE(SUM(amount_recovered), 0) as total_recovered_revenue
      FROM recovery_attributions WHERE merchant_id = ?`,
      [merchant_id]
    )[0] || { total_attributions: 0, total_recovered_revenue: 0 };

    const totalRecoveredRevenue = Math.round(attrMetrics.total_recovered_revenue * 100) / 100;
    const totalAttributionsCount = attrMetrics.total_attributions || 0;

    const intervMetrics = db.runQuery(
      `SELECT 
        COUNT(*) as executed_count,
        COALESCE(SUM(expected_recovery), 0) as addressed_revenue
      FROM interventions WHERE merchant_id = ? AND execution_status = 'executed'`,
      [merchant_id]
    )[0] || { executed_count: 0, addressed_revenue: 0 };

    const executedInterventionsCount = intervMetrics.executed_count || 0;
    const addressedRevenue = Math.round(intervMetrics.addressed_revenue * 100) / 100;
    const totalInterventionCost = executedInterventionsCount * 2.0; // ₹2 average cost per intervention
    const netRecoveredRevenue = Math.max(0, totalRecoveredRevenue - totalInterventionCost);
    const recoveryRate = revenueAtRisk > 0 ? (totalRecoveredRevenue / revenueAtRisk) : 0;

    const interventions = db.runQuery(
      'SELECT * FROM interventions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 50',
      [merchant_id]
    );

    const attributions = db.runQuery(
      'SELECT * FROM recovery_attributions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 50',
      [merchant_id]
    );

    // 5. Recovery Funnel Data
    const funnel = [
      { stage: 'Processed', label: 'Revenue Processed', value: totalProcessed, count: totalPaymentsCount, isCurrency: true },
      { stage: 'At Risk', label: 'Revenue At Risk', value: revenueAtRisk, count: failedPaymentsCount, isCurrency: true },
      { stage: 'Recoverable', label: 'Recoverable Revenue', value: Math.round(recoverableRevenue), count: totalOppsCount, isCurrency: true },
      { stage: 'Addressed', label: 'Interventions Executed', value: Math.round(addressedRevenue), count: executedInterventionsCount, isCurrency: true },
      { stage: 'Recovered', label: 'Revenue Recovered', value: totalRecoveredRevenue, count: totalAttributionsCount, isCurrency: true },
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
        revenue_recovered: totalRecoveredRevenue,
        net_recovered: netRecoveredRevenue,
        net_recovery: netRecoveredRevenue,
        recovery_rate: recoveryRate,
        failure_rate: failureRate,
        total_payments: totalPaymentsCount,
        failed_count: failedPaymentsCount,
        recovered_count: totalAttributionsCount,
        recoverable_count: totalOppsCount,
        interventions_count: executedInterventionsCount,
        active_opportunities_count: activeOppsCount,
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
