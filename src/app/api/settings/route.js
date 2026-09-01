/*
 * Settings — GET/PUT /api/settings
 * 
 * Read and update merchant guardrails and operating mode.
 */

import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const db = require('@/lib/database');
    const { searchParams } = new URL(request.url);
    const merchant_id = searchParams.get('merchant_id') || 'merchant_rzp_test';
    const merchant = db.getRow('merchants', { id: merchant_id });
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
    const body = await request.json();
    const db = require('@/lib/database');
    const merchant_id = body.merchant_id || 'merchant_rzp_test';
    
    // Whitelist allowed update fields
    const allowedFields = ['operating_mode', 'guardrails'];
    const updates = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = typeof body[field] === 'object' 
          ? JSON.stringify(body[field]) 
          : body[field];
      }
    }
    
    if (Object.keys(updates).length > 0) {
      db.updateRow('merchants', updates, { id: merchant_id });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
