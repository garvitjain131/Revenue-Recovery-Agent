/*
 * Simulate Recovery — POST /api/agent/simulate-recovery
 * 
 * Demo endpoint to simulate a payment being received after agent intervention.
 * In production, this would come from Razorpay webhooks.
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { intervention_id, recovered = true } = body;

    if (!intervention_id) {
      return NextResponse.json({ error: 'intervention_id is required' }, { status: 400 });
    }

    const orchestrator = require('@/lib/agent-orchestrator');
    const result = orchestrator.simulateRecoveryOutcome(intervention_id, recovered);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
