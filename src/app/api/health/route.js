/*
 * Health Check API — GET /api/health
 * 
 * Provides liveness and readiness checks for container orchestrators and monitoring.
 * Zero secret or credential exposure.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'all'; // 'liveness' | 'readiness' | 'all'

  const startTime = Date.now();
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  // Basic Liveness Check
  if (type === 'liveness') {
    return NextResponse.json(
      {
        status: 'ok',
        check: 'liveness',
        uptime_seconds: Math.round(uptime),
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      }
    );
  }

  // Database Connectivity (Readiness)
  let dbHealthy = false;
  let dbLatencyMs = 0;
  let dbError = null;

  try {
    const db = require('@/lib/database');
    const t0 = Date.now();
    const result = db.runQuery('SELECT 1 as alive');
    dbLatencyMs = Date.now() - t0;
    dbHealthy = Array.isArray(result) && result[0]?.alive === 1;
  } catch (err) {
    dbError = err.message;
    console.error('[Health] Database probe error:', err.message);
  }

  const isHealthy = dbHealthy;
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.round(uptime),
      response_time_ms: Date.now() - startTime,
      checks: {
        database: {
          status: dbHealthy ? 'connected' : 'disconnected',
          latency_ms: dbLatencyMs,
          ...(dbError ? { error: 'Database query failed' } : {}),
        },
        memory: {
          heap_used_mb: Math.round(mem.heapUsed / (1024 * 1024)),
          heap_total_mb: Math.round(mem.heapTotal / (1024 * 1024)),
          rss_mb: Math.round(mem.rss / (1024 * 1024)),
        },
      },
    },
    {
      status: statusCode,
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    }
  );
}
