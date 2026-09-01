/*
 * Demo Reset API — POST /api/demo/reset
 * 
 * Restores the application state to the pristine, reproducible demo starting state.
 */

import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { execSync } = require('child_process');
    const path = require('path');

    const seedScript = path.join(process.cwd(), 'scripts', 'seed-database.js');
    execSync(`node "${seedScript}"`, { encoding: 'utf-8' });

    return NextResponse.json({
      success: true,
      message: 'Demo dataset restored to initial state successfully.',
    });
  } catch (error) {
    console.error('[API] Demo reset error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
