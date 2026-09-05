import { NextResponse } from 'next/server';
import orchestrator from '@/lib/agent-orchestrator';

export async function POST(request) {
  try {
    const body = await request.json();
    const { opportunity_id, action_type, merchant_id } = body;

    if (!opportunity_id) {
      return NextResponse.json(
        { success: false, error: 'opportunity_id is required' },
        { status: 400 }
      );
    }

    if (!action_type) {
      return NextResponse.json(
        { success: false, error: 'action_type is required' },
        { status: 400 }
      );
    }

    const result = await orchestrator.executeManualOverride(
      opportunity_id,
      action_type,
      merchant_id
    );

    return NextResponse.json({
      success: true,
      message: `Manual override "${action_type}" executed successfully.`,
      result,
    });
  } catch (error) {
    console.error('[API] Manual override failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Manual override failed' },
      { status: 500 }
    );
  }
}
