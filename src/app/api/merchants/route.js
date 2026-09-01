const db = require('@/lib/database');

export async function GET() {
  try {
    const merchants = db.runQuery('SELECT id, name, operating_mode, created_at FROM merchants ORDER BY name ASC');
    return Response.json(merchants || []);
  } catch (err) {
    console.error('[API] Failed to fetch merchants:', err);
    return Response.json([], { status: 500 });
  }
}
