import { NextResponse } from 'next/server';
import db from '@/lib/database';
import { calculateChurnRisk } from '@/lib/scoring-engine';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  let merchantId = searchParams.get('merchant_id');
  if (!merchantId || merchantId === 'null' || merchantId === 'undefined') {
    merchantId = 'merchant_rzp_test';
  }

  try {
    const database = db.getDatabase();

    // Find customers with recent failures
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get customers who have had at least one failed payment in the last 30 days
    const recentFailures = database.prepare(`
      SELECT 
        c.id, c.name, c.email, c.lifetime_value, c.total_payments, 
        c.successful_payments, c.failed_payments, c.last_payment_at,
        COUNT(p.id) as recent_failure_count
      FROM customers c
      JOIN payments p ON c.id = p.customer_id
      WHERE c.merchant_id = ? AND p.status = 'failed' AND p.created_at >= ?
      GROUP BY c.id
    `).all(merchantId, thirtyDaysAgo);

    // Score them using the scoring engine
    const scoredCustomers = recentFailures.map(cust => {
      const churnRisk = calculateChurnRisk(cust);
      return {
        id: cust.id,
        name: cust.name,
        email: cust.email,
        ltv: cust.lifetime_value,
        failure_count: cust.failed_payments,
        recent_failures: cust.recent_failure_count,
        last_payment: cust.last_payment_at,
        churn_risk: churnRisk
      };
    });

    // Sort by risk (highest first) and take top 10
    scoredCustomers.sort((a, b) => b.churn_risk - a.churn_risk);

    return NextResponse.json(scoredCustomers.slice(0, 10));
  } catch (error) {
    console.error('At-Risk Customers Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
