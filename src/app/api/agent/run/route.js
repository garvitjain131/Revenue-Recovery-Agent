/*
 * Agent API — POST /api/agent/run
 * 
 * Triggers an agent run for a merchant in Observe or Autonomous mode.
 * Immediately returns 202 Accepted to prevent HTTP timeouts and processes in background.
 */

import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      merchant_id = 'merchant_rzp_test',
      mode = 'autonomous',
      trigger = 'manual',
    } = body || {};

    const { checkRateLimit } = require('@/lib/rate-limiter');
    const rl = checkRateLimit(`agent_run:${merchant_id}`, { limit: 10, windowMs: 60000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many agent run requests. Please retry in ${rl.retryAfterSec} seconds.` },
        {
          status: 429,
          headers: {
            'Retry-After': String(rl.retryAfterSec),
            'X-RateLimit-Limit': String(rl.limit),
            'X-RateLimit-Remaining': String(rl.remaining),
            'X-RateLimit-Reset': String(Math.ceil(rl.resetTimeMs / 1000)),
          },
        }
      );
    }

    // Normalize operating mode (observe vs autonomous)
    const normalizedMode = (mode || '').toLowerCase() === 'observe' ? 'observe' : 'autonomous';

    const orchestrator = require('@/lib/agent-orchestrator');
    
    // Launch background batch asynchronously
    orchestrator.startBackgroundBatch(merchant_id, normalizedMode).catch((err) => {
      console.error(`[Agent Run] Background processing failed in ${normalizedMode} mode:`, err);
    });

    return NextResponse.json(
      {
        message: `Agent batch processing initiated in ${normalizedMode} mode`,
        mode: normalizedMode,
        merchant_id,
        status: 'accepted',
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('[API] Agent run failed:', error);
    return NextResponse.json(
      { error: error.message || 'Agent run failed' },
      { status: 500 }
    );
  }
}
