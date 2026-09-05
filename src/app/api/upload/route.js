import { NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
const dataIngestion = require('@/lib/data-ingestion');

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const dataType = formData.get('type') || 'transactions'; 
    const merchantId = formData.get('merchant_id') || 'merchant_rzp_test';
    const { checkRateLimit } = require('@/lib/rate-limiter');
    const rl = checkRateLimit(`upload:${merchantId}`, { limit: 10, windowMs: 60000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: `Too many upload requests. Please retry in ${rl.retryAfterSec} seconds.` },
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
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'File size exceeds maximum allowed limit of 10MB.' }, { status: 400 });
    }

    const fileName = file.name || 'upload.csv';
    if (!fileName.toLowerCase().endsWith('.csv')) {
      return NextResponse.json({ success: false, error: 'Only .csv files are supported for upload.' }, { status: 400 });
    }

    const text = await file.text();
    
    // Ingest directly via hardened ingestCSV pipeline
    const result = dataIngestion.ingestCSV(text, dataType, merchantId, fileName);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] CSV Upload error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
