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
    const status = searchParams.get('status') || 'all';
    const method = searchParams.get('method') || 'all';
    const search = searchParams.get('search') || '';
    const rawLimit = searchParams.get('limit');
    let limit;
    if (!rawLimit || rawLimit === 'all' || rawLimit === '0' || rawLimit === '-1') {
      limit = null; // No artificial limit when 'all' is explicitly requested
    } else {
      const parsedLimit = parseInt(rawLimit, 10);
      limit = (!isNaN(parsedLimit) && parsedLimit > 0) ? Math.min(2000, parsedLimit) : 50;
    }
    const rawOffset = searchParams.get('offset');
    const offset = Math.max(0, parseInt(rawOffset || '0', 10) || 0);

    // 1. Overall Aggregation Metrics via high-performance SQL aggregate query
    const metricsRow = db.runQuery(
      `SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(CASE WHEN status IN ('captured', 'authorized') THEN 1 ELSE 0 END), 0) as captured_count,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed_count,
        COALESCE(SUM(CASE WHEN status IN ('captured', 'authorized') THEN amount ELSE 0 END), 0) as captured_volume,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) as failed_volume
      FROM payments WHERE merchant_id = ?`,
      [merchant_id]
    )[0] || {
      total_count: 0,
      captured_count: 0,
      failed_count: 0,
      captured_volume: 0,
      failed_volume: 0,
    };

    const total_count = metricsRow.total_count || 0;
    const captured_count = metricsRow.captured_count || 0;
    const failed_count = metricsRow.failed_count || 0;
    const captured_volume = Math.round(metricsRow.captured_volume * 100) / 100;
    const failed_volume = Math.round(metricsRow.failed_volume * 100) / 100;
    const total_volume = Math.round((captured_volume + failed_volume) * 100) / 100;
    const success_rate = total_count > 0 ? ((captured_count / total_count) * 100).toFixed(1) : '100.0';

    // 2. Query Filtered Transactions
    let whereConditions = ['p.merchant_id = ?'];
    let params = [merchant_id];

    if (status && status !== 'all') {
      if (status === 'captured') {
        whereConditions.push("(p.status = 'captured' OR p.status = 'authorized')");
      } else if (status === 'failed') {
        whereConditions.push("p.status = 'failed'");
      } else {
        whereConditions.push("p.status = ?");
        params.push(status);
      }
    }

    if (method && method !== 'all') {
      whereConditions.push('p.method = ?');
      params.push(method);
    }

    if (search.trim()) {
      whereConditions.push(
        '(p.id LIKE ? OR p.customer_id LIKE ? OR c.name LIKE ? OR p.failure_reason LIKE ?)'
      );
      const q = `%${search.trim()}%`;
      params.push(q, q, q, q);
    }

    const whereClause = whereConditions.join(' AND ');

    // Get count for pagination
    const countSql = `
      SELECT COUNT(*) as filtered_total
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE ${whereClause}
    `;
    const countResult = db.runQuery(countSql, params);
    const filtered_total = countResult[0]?.filtered_total || 0;

    // Fetch transactions
    let fetchSql = `
      SELECT 
        p.id,
        p.merchant_id,
        p.customer_id,
        p.amount,
        p.currency,
        p.status,
        p.method,
        p.failure_reason,
        p.error_code,
        p.captured,
        p.created_at,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone
      FROM payments p
      LEFT JOIN customers c ON p.customer_id = c.id
      WHERE ${whereClause}
      ORDER BY p.created_at DESC
    `;
    const fetchParams = [...params];
    if (limit) {
      fetchSql += ` LIMIT ? OFFSET ?`;
      fetchParams.push(limit, offset);
    }

    const transactions = db.runQuery(fetchSql, fetchParams);

    return NextResponse.json({
      success: true,
      transactions,
      pagination: {
        total: filtered_total,
        limit,
        offset,
        page: limit ? Math.floor(offset / limit) + 1 : 1,
        totalPages: limit ? Math.ceil(filtered_total / limit) : 1,
        hasMore: limit ? (offset + limit < filtered_total) : false,
      },
      metrics: {
        total_count,
        captured_count,
        failed_count,
        captured_volume,
        failed_volume,
        total_volume,
        success_rate: parseFloat(success_rate),
      },
    });
  } catch (error) {
    console.error('[API] GET /api/transactions failed:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
