/*
 * database.js
 * 
 * Core database layer using better-sqlite3 for zero-config embedded storage.
 * Handles all schema creation, migrations, and provides query helpers.
 * 
 * Tables:
 *   merchants        — merchant config and guardrail policies
 *   customers        — customer revenue profiles  
 *   payments         — payment transaction records
 *   opportunities    — detected revenue recovery opportunities
 *   interventions    — planned and executed recovery actions
 *   agent_runs       — complete agent execution logs
 *   audit_logs       — immutable audit trail
 */

const path = require('path');

let db = null;

function getDatabase() {
  if (db) return db;

  try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(process.cwd(), 'revenue-agent.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
    return db;
  } catch (error) {
    console.error('Database initialization failed:', error.message);
    throw new Error(`Could not initialize database: ${error.message}`);
  }
}

function initializeSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      razorpay_key_id TEXT,
      operating_mode TEXT NOT NULL DEFAULT 'review',
      guardrails TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      razorpay_customer_id TEXT,
      name TEXT,
      email TEXT,
      phone TEXT,
      total_payments INTEGER NOT NULL DEFAULT 0,
      successful_payments INTEGER NOT NULL DEFAULT 0,
      failed_payments INTEGER NOT NULL DEFAULT 0,
      total_spent REAL NOT NULL DEFAULT 0,
      lifetime_value REAL NOT NULL DEFAULT 0,
      preferred_method TEXT,
      last_payment_at TEXT,
      do_not_contact INTEGER NOT NULL DEFAULT 0,
      last_contacted_at TEXT,
      contact_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      razorpay_payment_id TEXT,
      razorpay_order_id TEXT,
      customer_id TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL,
      method TEXT,
      failure_reason TEXT,
      error_code TEXT,
      captured INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'detected',
      title TEXT NOT NULL,
      description TEXT,
      revenue_at_risk REAL NOT NULL DEFAULT 0,
      recovery_probability REAL NOT NULL DEFAULT 0,
      expected_recovery REAL NOT NULL DEFAULT 0,
      actual_recovery REAL NOT NULL DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      root_cause TEXT,
      root_cause_confidence REAL NOT NULL DEFAULT 0,
      affected_payments TEXT DEFAULT '[]',
      affected_customers TEXT DEFAULT '[]',
      intervention_count INTEGER NOT NULL DEFAULT 0,
      max_interventions INTEGER NOT NULL DEFAULT 3,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS interventions (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      merchant_id TEXT NOT NULL,
      customer_id TEXT,
      action_type TEXT NOT NULL,
      action_params TEXT DEFAULT '{}',
      expected_recovery REAL NOT NULL DEFAULT 0,
      actual_recovery REAL NOT NULL DEFAULT 0,
      confidence REAL NOT NULL DEFAULT 0,
      risk_level TEXT NOT NULL DEFAULT 'low',
      policy_check TEXT NOT NULL DEFAULT 'pending',
      policy_reason TEXT,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      approved_by TEXT,
      execution_status TEXT NOT NULL DEFAULT 'pending',
      execution_result TEXT,
      razorpay_payment_link_id TEXT,
      razorpay_payment_id TEXT,
      attribution TEXT NOT NULL DEFAULT 'pending',
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      executed_at TEXT,
      resolved_at TEXT,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT,
      merchant_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      agent_state TEXT NOT NULL DEFAULT '{}',
      steps TEXT NOT NULL DEFAULT '[]',
      decision TEXT,
      tool_called TEXT,
      tool_input TEXT,
      tool_result TEXT,
      policy_result TEXT,
      approval_status TEXT,
      final_outcome TEXT,
      duration_ms INTEGER,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      opportunity_id TEXT,
      intervention_id TEXT,
      agent_run_id TEXT,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      customer_id TEXT,
      product_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      order_amount REAL NOT NULL,
      order_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS cart_events (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      customer_id TEXT,
      product_name TEXT,
      cart_value REAL NOT NULL DEFAULT 0,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS discounts (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      order_id TEXT,
      customer_id TEXT,
      original_amount REAL NOT NULL,
      discount_amount REAL NOT NULL,
      final_amount REAL NOT NULL,
      discount_code TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS data_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      merchant_id TEXT NOT NULL,
      data_type TEXT NOT NULL,
      record_count INTEGER NOT NULL DEFAULT 0,
      accepted_count INTEGER NOT NULL DEFAULT 0,
      rejected_count INTEGER NOT NULL DEFAULT 0,
      file_name TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS recovery_strategies (
      id TEXT PRIMARY KEY,
      opportunity_id TEXT NOT NULL,
      action TEXT NOT NULL,
      recovery_probability REAL NOT NULL DEFAULT 0,
      expected_recovery REAL NOT NULL DEFAULT 0,
      intervention_cost REAL NOT NULL DEFAULT 0,
      expected_risk_cost REAL NOT NULL DEFAULT 0,
      net_expected_recovery REAL NOT NULL DEFAULT 0,
      customer_friction_score REAL NOT NULL DEFAULT 0,
      evidence_strength REAL NOT NULL DEFAULT 0,
      strategy_rank INTEGER NOT NULL DEFAULT 1,
      selected INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
    );

    CREATE TABLE IF NOT EXISTS recovery_attributions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      intervention_id TEXT NOT NULL,
      original_payment_id TEXT,
      recovered_payment_id TEXT,
      amount_recovered REAL NOT NULL DEFAULT 0,
      attribution_method TEXT NOT NULL DEFAULT 'deterministic_link',
      attribution_confidence REAL NOT NULL DEFAULT 1.0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id),
      FOREIGN KEY (intervention_id) REFERENCES interventions(id)
    );

    CREATE TABLE IF NOT EXISTS strategy_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_action TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'payment_failure',
      total_predictions INTEGER NOT NULL DEFAULT 0,
      total_recovered INTEGER NOT NULL DEFAULT 0,
      predicted_prob_sum REAL NOT NULL DEFAULT 0,
      actual_recovery_rate REAL NOT NULL DEFAULT 0,
      calibration_error REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outcome_calibrations (
      id TEXT PRIMARY KEY,
      strategy_action TEXT NOT NULL,
      opportunity_type TEXT NOT NULL,
      predicted_probability REAL NOT NULL,
      actual_outcome INTEGER NOT NULL,
      context_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      dataset_size INTEGER NOT NULL,
      scenario_name TEXT NOT NULL,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      summary_json TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS evaluation_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_run_id TEXT NOT NULL,
      system_name TEXT NOT NULL,
      system_type TEXT NOT NULL,
      total_processed REAL NOT NULL DEFAULT 0,
      revenue_at_risk REAL NOT NULL DEFAULT 0,
      revenue_recovered REAL NOT NULL DEFAULT 0,
      net_recovery REAL NOT NULL DEFAULT 0,
      recovery_rate REAL NOT NULL DEFAULT 0,
      interventions_count INTEGER NOT NULL DEFAULT 0,
      unnecessary_interventions INTEGER NOT NULL DEFAULT 0,
      policy_violations INTEGER NOT NULL DEFAULT 0,
      unauthorized_executions INTEGER NOT NULL DEFAULT 0,
      customer_contacts_count INTEGER NOT NULL DEFAULT 0,
      avg_recovery_latency_mins REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (evaluation_run_id) REFERENCES evaluation_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_payments_merchant ON payments(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
    CREATE INDEX IF NOT EXISTS idx_opportunities_merchant ON opportunities(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
    CREATE INDEX IF NOT EXISTS idx_interventions_opportunity ON interventions(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_interventions_merchant ON interventions(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_merchant ON agent_runs(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_merchant ON audit_logs(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_opportunity ON audit_logs(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_orders_merchant ON orders(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_cart_events_merchant ON cart_events(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_cart_events_customer ON cart_events(customer_id);
    CREATE INDEX IF NOT EXISTS idx_discounts_merchant ON discounts(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_discounts_customer ON discounts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_data_sources_merchant ON data_sources(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_strategies_opp ON recovery_strategies(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_attributions_merchant ON recovery_attributions(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_attributions_opp ON recovery_attributions(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_evaluation_results_run ON evaluation_results(evaluation_run_id);
  `);
}

// ─── Query Helpers ─────────────────────────────────────────────────

function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

function insertRow(table, data) {
  const database = getDatabase();
  const columns = Object.keys(data);
  const placeholders = columns.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
  return database.prepare(sql).run(...Object.values(data));
}

function getRow(table, where = {}) {
  const database = getDatabase();
  const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
  const sql = conditions
    ? `SELECT * FROM ${table} WHERE ${conditions}`
    : `SELECT * FROM ${table}`;
  return database.prepare(sql).get(...Object.values(where));
}

function getRows(table, where = {}, orderBy = 'created_at DESC', limit = 100) {
  const database = getDatabase();
  const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
  let sql = `SELECT * FROM ${table}`;
  if (conditions) sql += ` WHERE ${conditions}`;
  sql += ` ORDER BY ${orderBy} LIMIT ${limit}`;
  return database.prepare(sql).all(...Object.values(where));
}

function updateRow(table, data, where) {
  const database = getDatabase();
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  const conditions = Object.keys(where).map(k => `${k} = ?`).join(' AND ');
  const sql = `UPDATE ${table} SET ${sets} WHERE ${conditions}`;
  return database.prepare(sql).run(...Object.values(data), ...Object.values(where));
}

function runQuery(sql, params = []) {
  const database = getDatabase();
  return database.prepare(sql).all(...params);
}

function runExec(sql, params = []) {
  const database = getDatabase();
  return database.prepare(sql).run(...params);
}

module.exports = {
  getDatabase,
  generateId,
  insertRow,
  getRow,
  getRows,
  updateRow,
  runQuery,
  runExec,
};
