/*
 * Approve/Reject Intervention — POST /api/agent/approve
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { intervention_id, action = 'approve', reason = '' } = body;

    if (!intervention_id) {
      return NextResponse.json({ error: 'intervention_id is required' }, { status: 400 });
    }

    const orchestrator = require('@/lib/agent-orchestrator');

    if (action === 'approve') {
      const result = await orchestrator.approveIntervention(intervention_id);
      return NextResponse.json(result);
    } else if (action === 'reject') {
      const result = await orchestrator.rejectIntervention(intervention_id, reason);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
