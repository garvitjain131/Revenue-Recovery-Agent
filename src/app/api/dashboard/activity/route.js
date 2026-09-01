import { NextResponse } from 'next/server';
import db from '@/lib/database';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const merchantId = searchParams.get('merchant_id') || 'merchant_rzp_test';

  try {
    const database = db.getDatabase();
    
    // Combine logs from different sources for a unified activity feed
    
    // 1. Audit logs
    const auditLogs = database.prepare(`
      SELECT id, event_type as type, event_data, created_at as timestamp 
      FROM audit_logs 
      WHERE merchant_id = ? 
      ORDER BY created_at DESC LIMIT 30
    `).all(merchantId);

    // 2. Interventions
    const interventions = database.prepare(`
      SELECT id, action_type as type, execution_status, actual_recovery, created_at as timestamp 
      FROM interventions 
      WHERE merchant_id = ? 
      ORDER BY created_at DESC LIMIT 20
    `).all(merchantId);

    // 3. Agent Runs (convert steps into events)
    const runs = database.prepare(`
      SELECT id, final_outcome as status, steps, created_at as timestamp 
      FROM agent_runs 
      WHERE merchant_id = ? 
      ORDER BY created_at DESC LIMIT 10
    `).all(merchantId);

    // Process and merge
    let feed = [];

    auditLogs.forEach(log => {
      feed.push({
        id: `audit_${log.id}`,
        type: log.type,
        message: log.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        timestamp: log.timestamp,
        data: JSON.parse(log.event_data || '{}')
      });
    });

    interventions.forEach(int => {
      let msg = `Action: ${int.type.replace(/_/g, ' ')}`;
      if (int.execution_status === 'success' && int.actual_recovery > 0) {
        msg = `Recovered ₹${int.actual_recovery} via ${int.type.replace(/_/g, ' ')}`;
      }
      
      feed.push({
        id: `int_${int.id}`,
        type: int.execution_status === 'success' ? 'recovered' : (int.execution_status === 'failed' ? 'error' : int.type),
        message: msg,
        timestamp: int.timestamp,
      });
    });

    runs.forEach(run => {
      // Add completion event
      feed.push({
        id: `run_${run.id}`,
        type: run.status === 'error' ? 'error' : 'agent_run_completed',
        message: run.status === 'error' ? 'Agent run failed' : 'Agent run completed',
        timestamp: run.timestamp,
      });

      // Parse steps
      try {
        const steps = JSON.parse(run.steps || '[]');
        steps.forEach((step, idx) => {
          if (step.message) {
            feed.push({
              id: `step_${run.id}_${idx}`,
              type: step.phase === 'error' ? 'error' : (step.phase === 'complete' ? 'success' : 'investigating'),
              message: step.message,
              timestamp: step.timestamp || run.timestamp,
            });
          }
        });
      } catch (e) {}
    });

    // Sort chronologically (newest first)
    feed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    // Deduplicate exact timestamps to avoid spam
    const uniqueFeed = [];
    const seenTimes = new Set();
    
    for (const item of feed) {
      if (!seenTimes.has(item.timestamp + item.message)) {
        seenTimes.add(item.timestamp + item.message);
        uniqueFeed.push(item);
      }
    }

    return NextResponse.json(uniqueFeed.slice(0, 50));
  } catch (error) {
    console.error('Activity Feed Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
