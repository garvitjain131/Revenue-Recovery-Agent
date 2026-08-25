/*
 * Dashboard Data — GET /api/dashboard
 * 
 * Returns all data needed for the Revenue Command Center.
 * Calculates values from actual database records, not hardcoded.
 */

import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const db = require('@/lib/database');
    const scoring = require('@/lib/scoring-engine');
    const merchant_id = 'merchant_demo';

    // Revenue metrics
    const allPayments = db.runQuery(
      'SELECT * FROM payments WHERE merchant_id = ? ORDER BY created_at DESC',
      [merchant_id]
    );
    const metrics = scoring.calculateRevenueMetrics(allPayments);

    // Opportunities
    const opportunities = db.runQuery(
      'SELECT * FROM opportunities WHERE merchant_id = ? ORDER BY revenue_at_risk DESC LIMIT 20',
      [merchant_id]
    );

    // Recent agent runs
    const agentRuns = db.runQuery(
      'SELECT * FROM agent_runs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 10',
      [merchant_id]
    );

    // Interventions
    const interventions = db.runQuery(
      'SELECT * FROM interventions WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 20',
      [merchant_id]
    );

    // Recovery totals
    const recoveryStats = db.runQuery(
      `SELECT 
        COALESCE(SUM(actual_recovery), 0) as total_recovered,
        COUNT(CASE WHEN actual_recovery > 0 THEN 1 END) as recovered_count,
        COUNT(*) as total_interventions
       FROM interventions WHERE merchant_id = ?`,
      [merchant_id]
    )[0] || { total_recovered: 0, recovered_count: 0, total_interventions: 0 };

    // Pending approvals
    const pendingApprovals = db.runQuery(
      "SELECT * FROM interventions WHERE merchant_id = ? AND approval_status = 'awaiting_approval' ORDER BY created_at DESC",
      [merchant_id]
    );

    // Merchant config
    const merchant = db.getRow('merchants', { id: merchant_id });

    // Audit trail
    const auditLogs = db.runQuery(
      'SELECT * FROM audit_logs WHERE merchant_id = ? ORDER BY created_at DESC LIMIT 30',
      [merchant_id]
    );

    return NextResponse.json({
      merchant: {
        id: merchant?.id,
        name: merchant?.name,
        operating_mode: merchant?.operating_mode,
        guardrails: merchant?.guardrails ? JSON.parse(merchant.guardrails) : {},
      },
      metrics: {
        ...metrics,
        total_recovered: recoveryStats.total_recovered,
        recovery_rate: recoveryStats.total_interventions > 0
          ? recoveryStats.recovered_count / recoveryStats.total_interventions
          : 0,
      },
      opportunities: opportunities.map(o => ({
        ...o,
        affected_payments: o.affected_payments ? JSON.parse(o.affected_payments) : [],
        affected_customers: o.affected_customers ? JSON.parse(o.affected_customers) : [],
      })),
      agent_runs: agentRuns.map(r => ({
        ...r,
        steps: r.steps ? JSON.parse(r.steps) : [],
      })),
      interventions,
      pending_approvals: pendingApprovals,
      audit_logs: auditLogs.map(l => ({
        ...l,
        event_data: l.event_data ? JSON.parse(l.event_data) : {},
      })),
    });
  } catch (error) {
    console.error('[API] Dashboard error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
