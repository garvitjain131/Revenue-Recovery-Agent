import { NextResponse } from 'next/server';
import { syncFromRazorpay } from '@/lib/razorpay-sync';

export async function POST(request) {
  try {
    const { merchant_id } = await request.json();

    if (!merchant_id) {
      return NextResponse.json(
        { success: false, error: 'merchant_id is required' },
        { status: 400 }
      );
    }

    const result = await syncFromRazorpay(merchant_id);

    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[API] Merchant sync error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
