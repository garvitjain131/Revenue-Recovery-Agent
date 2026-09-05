import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    let merchant_id = searchParams.get('merchant_id');
    if (!merchant_id || merchant_id === 'null' || merchant_id === 'undefined') {
      merchant_id = 'merchant_rzp_test';
    }

    const results = db.runQuery(
      `SELECT status, COUNT(*) as count FROM opportunities WHERE merchant_id = ? GROUP BY status`,
      [merchant_id]
    );

    const counts = results.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});

    const merchant = db.getRow('merchants', { id: merchant_id });

    const processing = counts['processing'] || 0;
    const detected = counts['detected'] || 0;
    const awaiting_manual_action = counts['awaiting_manual_action'] || 0;
    const action_executed = counts['action_executed'] || 0;
    const awaiting_approval = counts['awaiting_approval'] || 0;
    const blocked = counts['blocked'] || 0;
    const recovered = counts['recovered'] || 0;
    const execution_failed = counts['execution_failed'] || 0;

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const completed = action_executed + awaiting_manual_action + awaiting_approval + blocked + recovered + execution_failed;
    const active = processing + detected;

    const progress_percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 100;

    return NextResponse.json({
      success: true,
      counts,
      summary: {
        total,
        processing,
        detected,
        awaiting_manual_action,
        action_executed,
        awaiting_approval,
        blocked,
        recovered,
        execution_failed,
        completed,
        active,
        is_processing: processing > 0,
        progress_percent,
      },
      last_synced_at: merchant?.last_synced_at || null,
      operating_mode: merchant?.operating_mode || 'autonomous',
    });
  } catch (error) {
    console.error('[API] Status fetch failed:', error);
    return NextResponse.json(
      { error: error.message || 'Status fetch failed' },
      { status: 500 }
    );
  }
}
