import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let merchantId = searchParams.get('merchant_id');
  if (!merchantId || merchantId === 'null' || merchantId === 'undefined') {
    merchantId = 'merchant_rzp_test';
  }

  try {
    const database = db.getDatabase();

    // 1. Recovery Funnel
    // Count opportunities in various states
    const oppStats = database.prepare(`
      SELECT status, COUNT(*) as count 
      FROM opportunities 
      WHERE merchant_id = ? 
      GROUP BY status
    `).all(merchantId);

    const funnelData = { detected: 0, analyzed: 0, action_executed: 0, recovered: 0 };
    oppStats.forEach(stat => {
      if (['detected', 'investigating'].includes(stat.status)) funnelData.detected += stat.count;
      if (['analyzed'].includes(stat.status)) funnelData.analyzed += stat.count;
      if (['action_executed', 'pending'].includes(stat.status)) funnelData.action_executed += stat.count;
      if (['recovered'].includes(stat.status)) funnelData.recovered += stat.count;
    });

    // Make funnel cumulative
    funnelData.analyzed += funnelData.action_executed + funnelData.recovered;
    funnelData.detected += funnelData.analyzed;

    const funnel = [
      { stage: 'Detected', count: funnelData.detected },
      { stage: 'Analyzed', count: funnelData.analyzed },
      { stage: 'Attempted', count: funnelData.action_executed + funnelData.recovered },
      { stage: 'Recovered', count: funnelData.recovered },
    ];

    // 2. Failure Breakdown (Donut Chart)
    const failureStats = database.prepare(`
      SELECT failure_reason, COUNT(*) as count
      FROM payments
      WHERE merchant_id = ? AND status = 'failed' AND failure_reason IS NOT NULL
      GROUP BY failure_reason
      ORDER BY count DESC
      LIMIT 6
    `).all(merchantId);

    const failureReasons = failureStats.map(f => ({
      name: f.failure_reason.replace(/_/g, ' '),
      value: f.count,
    }));

    // 3. Recovery Timeline (Area Chart) - Last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recoveryAttributions = database.prepare(`
      SELECT DATE(created_at) as date, SUM(amount_recovered) as recovered
      FROM recovery_attributions
      WHERE merchant_id = ? AND created_at >= ?
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `).all(merchantId, thirtyDaysAgo);

    // Fill in missing days
    const timelineMap = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      timelineMap[d] = 0;
    }
    recoveryAttributions.forEach(i => {
      if (timelineMap[i.date] !== undefined) timelineMap[i.date] = Math.round(i.recovered);
    });

    const timeline = Object.keys(timelineMap).sort().map(date => ({
      date: date.substring(5), // MM-DD
      recovered: timelineMap[date],
    }));

    // 4. Payment Method Performance (Bar Chart)
    const methodStats = database.prepare(`
      SELECT 
        method, 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
      FROM payments
      WHERE merchant_id = ? AND created_at > ?
      GROUP BY method
    `).all(merchantId, thirtyDaysAgo);

    const methodPerformance = methodStats.map(m => ({
      method: m.method.toUpperCase(),
      failureRate: m.total > 0 ? parseFloat(((m.failed / m.total) * 100).toFixed(1)) : 0,
      total: m.total,
    })).sort((a, b) => b.failureRate - a.failureRate);

    return NextResponse.json({
      funnel,
      failureReasons,
      timeline,
      methodPerformance,
    });
  } catch (error) {
    console.error('Analytics Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
