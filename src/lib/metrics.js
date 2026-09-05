/*
 * metrics.js
 * 
 * Production observability and metrics collection.
 * Tracks application performance, recovery engine KPIs, and error rates.
 */

const counters = new Map();
const histograms = new Map();

function incrementCounter(name, value = 1, tags = {}) {
  const tagKey = Object.entries(tags).sort().map(([k, v]) => `${k}="${v}"`).join(',');
  const fullKey = tagKey ? `${name}{${tagKey}}` : name;
  const current = counters.get(fullKey) || 0;
  counters.set(fullKey, current + value);
}

function recordDuration(name, durationMs, tags = {}) {
  const tagKey = Object.entries(tags).sort().map(([k, v]) => `${k}="${v}"`).join(',');
  const fullKey = tagKey ? `${name}{${tagKey}}` : name;
  if (!histograms.has(fullKey)) {
    histograms.set(fullKey, []);
  }
  const values = histograms.get(fullKey);
  values.push(durationMs);
  if (values.length > 500) {
    values.shift(); // retain last 500 measurements
  }
}

/**
 * Gather aggregated metrics from database and memory.
 */
function getSystemMetrics() {
  const db = require('./database');
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  let dbStats = {
    total_payments: 0,
    total_opportunities: 0,
    total_interventions: 0,
    total_recovered_amount: 0,
    total_revenue_at_risk: 0,
    active_opportunities: 0,
    total_contacts: 0,
  };

  try {
    const payRow = db.runQuery(
      `SELECT 
        COUNT(*) as total_payments,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) as total_at_risk
      FROM payments`
    )[0];
    if (payRow) {
      dbStats.total_payments = payRow.total_payments || 0;
      dbStats.total_revenue_at_risk = Math.round(payRow.total_at_risk * 100) / 100;
    }

    const oppRow = db.runQuery(
      `SELECT 
        COUNT(*) as total_opps,
        COALESCE(SUM(CASE WHEN status NOT IN ('recovered', 'not_recovered') THEN 1 ELSE 0 END), 0) as active_opps
      FROM opportunities`
    )[0];
    if (oppRow) {
      dbStats.total_opportunities = oppRow.total_opps || 0;
      dbStats.active_opportunities = oppRow.active_opps || 0;
    }

    const intervRow = db.runQuery(
      `SELECT COUNT(*) as total_interv FROM interventions WHERE execution_status = 'executed'`
    )[0];
    if (intervRow) {
      dbStats.total_interventions = intervRow.total_interv || 0;
    }

    const attrRow = db.runQuery(
      `SELECT COALESCE(SUM(amount_recovered), 0) as total_recovered FROM recovery_attributions`
    )[0];
    if (attrRow) {
      dbStats.total_recovered_amount = Math.round(attrRow.total_recovered * 100) / 100;
    }

    const contactRow = db.runQuery(
      `SELECT COUNT(*) as total_contacts FROM contact_history`
    )[0];
    if (contactRow) {
      dbStats.total_contacts = contactRow.total_contacts || 0;
    }
  } catch (err) {
    console.warn('[Metrics] Failed to fetch database statistics:', err.message);
  }

  return {
    uptime_seconds: Math.round(uptime),
    memory: {
      heap_used_mb: Math.round(mem.heapUsed / (1024 * 1024)),
      heap_total_mb: Math.round(mem.heapTotal / (1024 * 1024)),
      rss_mb: Math.round(mem.rss / (1024 * 1024)),
    },
    recovery_stats: dbStats,
    counters: Object.fromEntries(counters.entries()),
  };
}

/**
 * Format system metrics in Prometheus format.
 */
function getPrometheusMetrics() {
  const metrics = getSystemMetrics();
  const lines = [];

  lines.push('# HELP process_uptime_seconds Application uptime in seconds');
  lines.push('# TYPE process_uptime_seconds gauge');
  lines.push(`process_uptime_seconds ${metrics.uptime_seconds}`);

  lines.push('# HELP process_heap_used_bytes Heap memory used');
  lines.push('# TYPE process_heap_used_bytes gauge');
  lines.push(`process_heap_used_bytes ${metrics.memory.heap_used_mb * 1024 * 1024}`);

  lines.push('# HELP recovery_payments_total Total number of payments processed');
  lines.push('# TYPE recovery_payments_total counter');
  lines.push(`recovery_payments_total ${metrics.recovery_stats.total_payments}`);

  lines.push('# HELP recovery_revenue_at_risk_inr Total revenue at risk in INR');
  lines.push('# TYPE recovery_revenue_at_risk_inr gauge');
  lines.push(`recovery_revenue_at_risk_inr ${metrics.recovery_stats.total_revenue_at_risk}`);

  lines.push('# HELP recovery_opportunities_total Total opportunities detected');
  lines.push('# TYPE recovery_opportunities_total counter');
  lines.push(`recovery_opportunities_total ${metrics.recovery_stats.total_opportunities}`);

  lines.push('# HELP recovery_interventions_executed_total Total interventions executed');
  lines.push('# TYPE recovery_interventions_executed_total counter');
  lines.push(`recovery_interventions_executed_total ${metrics.recovery_stats.total_interventions}`);

  lines.push('# HELP recovery_revenue_recovered_inr Total revenue recovered in INR');
  lines.push('# TYPE recovery_revenue_recovered_inr counter');
  lines.push(`recovery_revenue_recovered_inr ${metrics.recovery_stats.total_recovered_amount}`);

  lines.push('# HELP recovery_contacts_total Total customer contact attempts made');
  lines.push('# TYPE recovery_contacts_total counter');
  lines.push(`recovery_contacts_total ${metrics.recovery_stats.total_contacts}`);

  for (const [key, val] of Object.entries(metrics.counters)) {
    lines.push(`custom_${key.replace(/[^a-zA-Z0-9_{}="]/g, '_')} ${val}`);
  }

  return lines.join('\n') + '\n';
}

module.exports = {
  incrementCounter,
  recordDuration,
  getSystemMetrics,
  getPrometheusMetrics,
};
