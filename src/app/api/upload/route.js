import { NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
const dataIngestion = require('@/lib/data-ingestion');

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const dataType = formData.get('type') || 'transactions'; 
    const merchantId = formData.get('merchant_id') || 'merchant_rzp_test';
    
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    
    // Parse CSV to JSON
    const records = parse(text, { 
      columns: true, 
      skip_empty_lines: true,
      trim: true
    });
    
    // Send through the unified ingestion pipeline
    const result = dataIngestion.ingestJSON(records, dataType, merchantId, file.name);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] CSV Upload error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
