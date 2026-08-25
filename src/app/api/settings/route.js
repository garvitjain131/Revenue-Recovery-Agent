/*
 * Settings — GET/PUT /api/settings
 * 
 * Read and update merchant guardrails and operating mode.
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const db = require('@/lib/database');
    const merchant = db.getRow('merchants', { id: 'merchant_demo' });
    if (!merchant) {
      return NextResponse.json({ error: 'Merchant not found' }, { status: 404 });
    }
    return NextResponse.json({
      operating_mode: merchant.operating_mode,
      guardrails: JSON.parse(merchant.guardrails || '{}'),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const db = require('@/lib/database');
    const body = await request.json();

    const updates = {};
    if (body.operating_mode) {
      if (!['observe', 'review', 'autonomous'].includes(body.operating_mode)) {
        return NextResponse.json({ error: 'Invalid operating mode' }, { status: 400 });
      }
      updates.operating_mode = body.operating_mode;
    }
    if (body.guardrails) {
      updates.guardrails = JSON.stringify(body.guardrails);
    }
    updates.updated_at = new Date().toISOString();

    db.updateRow('merchants', updates, { id: 'merchant_demo' });

    return NextResponse.json({ success: true, ...updates });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
