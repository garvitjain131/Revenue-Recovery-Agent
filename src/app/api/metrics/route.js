/*
 * Metrics API — GET /api/metrics
 * 
 * Provides metrics in JSON and Prometheus formats.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const metricsLib = require('@/lib/metrics');
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';
  const acceptHeader = request.headers.get('accept') || '';

  if (format === 'prometheus' || acceptHeader.includes('text/plain')) {
    const text = metricsLib.getPrometheusMetrics();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  const data = metricsLib.getSystemMetrics();
  return NextResponse.json(data, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
