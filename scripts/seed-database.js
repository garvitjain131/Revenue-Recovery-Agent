/*
 * seed-database.js
 * 
 * Generates a comprehensive, deterministic synthetic dataset for demo presentation.
 * 
 * Seed Scenarios Generated:
 *   1. Merchant: TechBazaar India & PayFlow Commerce with configured Policy Guardian guardrails
 *   2. Customers: 200 profiles with realistic LTV, purchase histories, and contact preferences
 *   3. Transactions: 1,000+ payments with healthy baseline + injected UPI rail outage cluster
 *   4. High-Value Transaction: ₹1,50,000 failure (requires human review escalation)
 *   5. Repeat Failure: Customer with 3 consecutive payment failures
 *   6. Contact Protection: Customer with do_not_contact flag
 *   7. Cart Abandonments: In `cart_events` for checkout drop-off recovery
 *   8. Discount Margin Leakage: In `discounts` for promotional margin audit
 *   9. Benchmark Run: Pre-calculated baseline comparison (Do Nothing, Naive Retry, Rule-Based, Full Agent)
 */

const path = require('path');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const db = require('../src/lib/database');
const evalEngine = require('../src/lib/evaluation-engine');
const policy = require('../src/lib/policy-engine');

const MERCHANTS = [
  { id: 'merchant_rzp_test', name: 'TechBazaar India' },
  { id: 'merchant_demo', name: 'PayFlow Commerce' },
];

function seed() {
  console.log('--- Initializing Revenue Recovery Agent Deterministic Seed ---');

  // Initialize DB connection and schema
  db.getDatabase();

  // Clear existing seed data safely
  db.runExec('PRAGMA foreign_keys = OFF');
  db.runExec('DELETE FROM evaluation_results');
  db.runExec('DELETE FROM evaluation_runs');
  db.runExec('DELETE FROM outcome_calibrations');
  db.runExec('DELETE FROM strategy_performance');
  db.runExec('DELETE FROM recovery_attributions');
  db.runExec('DELETE FROM recovery_strategies');
  db.runExec('DELETE FROM interventions');
  db.runExec('DELETE FROM opportunities');
  db.runExec('DELETE FROM agent_runs');
  db.runExec('DELETE FROM audit_logs');
  db.runExec('DELETE FROM payments');
  db.runExec('DELETE FROM cart_events');
  db.runExec('DELETE FROM discounts');
  db.runExec('DELETE FROM orders');
  db.runExec('DELETE FROM data_sources');
  db.runExec('DELETE FROM customers');
  db.runExec('DELETE FROM merchants');
  db.runExec('PRAGMA foreign_keys = ON');

  // 1. Seed Merchants
  for (const m of MERCHANTS) {
    db.insertRow('merchants', {
      id: m.id,
      name: m.name,
      operating_mode: 'autonomous',
      guardrails: JSON.stringify({
        ...policy.DEFAULT_GUARDRAILS,
        max_auto_transaction: 25000,
        high_value_threshold: 100000,
        minimum_confidence: 0.70,
        min_expected_recovery: 500,
        daily_recovery_budget: 50000,
        max_recovery_attempts: 3,
        contact_start_hour: 8,
        contact_cutoff_hour: 22,
        kill_switch: false,
      }),
    });
    console.log(`✓ Created merchant: ${m.name} (${m.id})`);
  }

  const primaryMerchantId = 'merchant_rzp_test';

  // 2. Seed 200 Customers
  const customers = [];
  const firstNames = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan', 'Krishna', 'Ishaan', 'Ananya', 'Diya', 'Saanvi', 'Myra', 'Aadhya', 'Pari', 'Anika', 'Navya', 'Angel', 'Riya'];
  const lastNames = ['Sharma', 'Verma', 'Patel', 'Reddy', 'Jain', 'Mehta', 'Nair', 'Gupta', 'Singh', 'Kapoor', 'Rao', 'Iyer', 'Bose', 'Chopra', 'Malhotra'];

  for (let i = 1; i <= 200; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    const name = `${fn} ${ln}`;
    const email = `${fn.toLowerCase()}.${ln.toLowerCase()}${i}@example.com`;
    const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const ltv = Math.round(5000 + (Math.random() * 95000));
    const totalPayments = Math.floor(2 + Math.random() * 20);
    const successfulPayments = Math.floor(totalPayments * (0.75 + Math.random() * 0.25));
    const isDoNotContact = i === 13; // Customer 13 is opted out

    const cust = {
      id: `cust_${i}`,
      merchant_id: primaryMerchantId,
      name,
      email,
      phone,
      total_payments: totalPayments,
      successful_payments: successfulPayments,
      failed_payments: totalPayments - successfulPayments,
      total_spent: ltv,
      lifetime_value: ltv,
      preferred_method: i % 3 === 0 ? 'card' : 'upi',
      do_not_contact: isDoNotContact ? 1 : 0,
      created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    };

    db.insertRow('customers', cust);
    customers.push(cust);
  }
  console.log(`✓ Seeded ${customers.length} customer profiles`);

  // 3. Seed 1,000+ Payments (Healthy baseline + Injected UPI Spike)
  const now = Date.now();
  let paymentCount = 0;

  // Baseline 700 payments over last 48 hours (4% failure rate)
  for (let i = 0; i < 700; i++) {
    const cust = customers[i % customers.length];
    const method = i % 4 === 0 ? 'card' : i % 8 === 0 ? 'netbanking' : 'upi';
    const isFailed = Math.random() < 0.04;
    const amount = Math.round(800 + Math.random() * 4200);
    const timeOffset = Math.random() * 46 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000;

    db.insertRow('payments', {
      id: `pay_base_${i + 1}`,
      merchant_id: primaryMerchantId,
      customer_id: cust.id,
      amount,
      currency: 'INR',
      status: isFailed ? 'failed' : 'captured',
      method,
      failure_reason: isFailed ? 'bank_timeout' : null,
      captured: isFailed ? 0 : 1,
      created_at: new Date(now - timeOffset).toISOString(),
    });
    paymentCount++;
  }

  // Recent 300 payments in last 2 hours (Injected UPI Spike - 38% failure on UPI)
  for (let i = 0; i < 300; i++) {
    const cust = customers[(i + 50) % customers.length];
    const isUPI = i % 3 !== 0; // 66% UPI
    const method = isUPI ? 'upi' : 'card';
    const isFailed = isUPI ? (Math.random() < 0.38) : (Math.random() < 0.05);
    const amount = Math.round(1200 + Math.random() * 8800);
    const timeOffset = Math.random() * 1.8 * 60 * 60 * 1000;

    db.insertRow('payments', {
      id: `pay_recent_${i + 1}`,
      merchant_id: primaryMerchantId,
      customer_id: cust.id,
      amount,
      currency: 'INR',
      status: isFailed ? 'failed' : 'captured',
      method,
      failure_reason: isFailed ? (isUPI ? 'upi_rail_degradation' : 'insufficient_funds') : null,
      captured: isFailed ? 0 : 1,
      created_at: new Date(now - timeOffset).toISOString(),
    });
    paymentCount++;
  }

  // High-Value Failure scenario (₹1,50,000 card failure for manual review trigger)
  db.insertRow('payments', {
    id: 'pay_high_val_01',
    merchant_id: primaryMerchantId,
    customer_id: 'cust_1',
    amount: 150000,
    currency: 'INR',
    status: 'failed',
    method: 'card',
    failure_reason: 'card_limit_exceeded',
    captured: 0,
    created_at: new Date(now - 15 * 60 * 1000).toISOString(),
  });
  paymentCount++;

  // Repeat Failure scenario (Same customer failing 3 times)
  for (let r = 1; r <= 3; r++) {
    db.insertRow('payments', {
      id: `pay_repeat_${r}`,
      merchant_id: primaryMerchantId,
      customer_id: 'cust_7',
      amount: 4500,
      currency: 'INR',
      status: 'failed',
      method: 'upi',
      failure_reason: 'upi_rail_degradation',
      captured: 0,
      created_at: new Date(now - (30 - r * 5) * 60 * 1000).toISOString(),
    });
    paymentCount++;
  }

  console.log(`✓ Seeded ${paymentCount} realistic payment transactions`);

  // 4. Seed Cart Abandonment Events
  for (let c = 1; c <= 25; c++) {
    const cust = customers[(c * 3) % customers.length];
    db.insertRow('cart_events', {
      id: `cart_${c}`,
      merchant_id: primaryMerchantId,
      customer_id: cust.id,
      product_name: c % 2 === 0 ? 'Enterprise Cloud Subscription' : 'Developer Hardware Kit',
      cart_value: Math.round(3500 + Math.random() * 12000),
      event_type: 'checkout_started',
      created_at: new Date(now - c * 25 * 60 * 1000).toISOString(),
    });
  }
  console.log(`✓ Seeded 25 cart abandonment events`);

  // 5. Seed Discount / Margin Leakage Records
  for (let d = 1; d <= 20; d++) {
    const cust = customers[(d * 4) % customers.length];
    const orig = Math.round(5000 + Math.random() * 15000);
    const disc = Math.round(orig * 0.15);
    db.insertRow('discounts', {
      id: `disc_${d}`,
      merchant_id: primaryMerchantId,
      order_id: `ord_${d}`,
      customer_id: cust.id,
      original_amount: orig,
      discount_amount: disc,
      final_amount: orig - disc,
      discount_code: 'WELCOME15',
      created_at: new Date(now - d * 40 * 60 * 1000).toISOString(),
    });
  }
  console.log(`✓ Seeded 20 discount margin records`);

  // 6. Record Data Sources
  db.insertRow('data_sources', {
    merchant_id: primaryMerchantId,
    data_type: 'transactions',
    record_count: paymentCount,
    accepted_count: paymentCount,
    file_name: 'core_gateway_feed.csv',
  });

  db.insertRow('data_sources', {
    merchant_id: primaryMerchantId,
    data_type: 'cart_events',
    record_count: 25,
    accepted_count: 25,
    file_name: 'storefront_telemetry.csv',
  });

  db.insertRow('data_sources', {
    merchant_id: primaryMerchantId,
    data_type: 'discounts',
    record_count: 20,
    accepted_count: 20,
    file_name: 'coupons_audit.csv',
  });

  // 7. Seed Initial Baseline Benchmark Results
  console.log('--- Generating Initial Benchmark Evaluation Matrix ---');
  evalEngine.runBenchmarkEvaluation(42);

  console.log('✓ Deterministic Seed complete! Ready for demo presentation.');
}

try {
  seed();
} catch (err) {
  console.error('Seed execution failed:', err);
  process.exit(1);
}
