/*
 * Agent API — POST /api/agent/run
 * 
 * Triggers a complete agent run for a merchant.
 * This is the main entry point for the agentic loop.
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { merchant_id = 'merchant_demo', trigger = 'manual' } = body;

    const orchestrator = require('@/lib/agent-orchestrator');
    const result = await orchestrator.executeAgentRun(merchant_id, trigger);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Agent run failed:', error);
    return NextResponse.json(
      { error: error.message || 'Agent run failed' },
      { status: 500 }
    );
  }
}
