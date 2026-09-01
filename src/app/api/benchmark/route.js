/*
 * Benchmark API — GET & POST /api/benchmark
 * 
 * Provides comparative benchmark evaluation metrics across:
 *   - Baseline A: Do Nothing
 *   - Baseline B: Naive Retry
 *   - Baseline C: Rule-Based Engine
 *   - System D: Full Recovery Agent
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const evalEngine = require('@/lib/evaluation-engine');
    const data = evalEngine.getLatestBenchmarkResults();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[API] Benchmark fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const seed = body.seed || Math.floor(Math.random() * 10000);

    const evalEngine = require('@/lib/evaluation-engine');
    const result = evalEngine.runBenchmarkEvaluation(seed);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Benchmark run error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
