/*
 * seed-database.js
 * 
 * Creates a realistic synthetic dataset for the Revenue Intelligence Agent demo.
 * 
 * Generates:
 *   - 1 demo merchant with guardrails
 *   - 200 customers with varied profiles
 *   - 1000 payments with realistic distribution
 *   - Injected scenarios for demo
 * 
 * Scenarios injected:
 *   A. UPI degradation spike (4% → 19%)
 *   B. High-value failed payments
 *   C. Repeat customer failures
 *   D. Customer who should NOT be contacted
 *   E. Natural payer (attribution test)
 */

const path = require('path');

// Initialize database
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
const db = require('../src/lib/database');

// ─── Configuration ─────────────────────────────────────────────

const MERCHANT_ID = 'merchant_demo';
const NUM_CUSTOMERS = 200;
const NUM_PAYMENTS = 1000;

const PAYMENT_METHODS = ['upi', 'card', 'netbanking', 'wallet'];
const METHOD_WEIGHTS = [0.45, 0.30, 0.15, 0.10]; // UPI dominant in India

const NAMES = [
  'Aarav Sharma', 'Priya Patel', 'Vikram Singh', 'Ananya Gupta', 'Rohit Kumar',
  'Sneha Reddy', 'Arjun Nair', 'Kavya Iyer', 'Rajesh Mehta', 'Divya Joshi',
  'Aditya Verma', 'Pooja Chopra', 'Manish Tiwari', 'Neha Agarwal', 'Suresh Rao',
  'Meera Pillai', 'Karan Malhotra', 'Ritu Saxena', 'Amit Desai', 'Swati Kulkarni',
  'Deepak Mishra', 'Anjali Bhatt', 'Sanjay Pandey', 'Nisha Bose', 'Vivek Thakur',
  'Shruti Menon', 'Harsh Kapoor', 'Simran Kaur', 'Gaurav Srivastava', 'Tanvi Shah',
  'Nikhil Deshpande', 'Pallavi Rajan', 'Ashwin Venkat', 'Kritika Ahuja', 'Manoj Hegde',
  'Revathi Suresh', 'Pranav Goyal', 'Ishita Banerjee', 'Siddharth Lal', 'Aditi Mohan',
];

const FAILURE_REASONS = [
  'insufficient_funds', 'bank_declined', 'authentication_failed',
  'network_error', 'card_expired', 'transaction_limit_exceeded',
  'upi_timeout', 'bank_unavailable',
];

// ─── Helpers ───────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function randomAmount() {
  const ranges = [
    { min: 99, max: 999, weight: 0.25 },
    { min: 1000, max: 4999, weight: 0.30 },
    { min: 5000, max: 14999, weight: 0.25 },
    { min: 15000, max: 49999, weight: 0.12 },
    { min: 50000, max: 199999, weight: 0.06 },
    { min: 200000, max: 500000, weight: 0.02 },
  ];
  const range = weightedPick(ranges, ranges.map(r => r.weight));
  return Math.round(range.min + Math.random() * (range.max - range.min));
}

function randomDate(hoursAgo) {
  return new Date(Date.now() - Math.random() * hoursAgo * 60 * 60 * 1000).toISOString();
}

function generateEmail(name) {
  return name.toLowerCase().replace(/\s+/g, '.') + '@example.com';
}

function generatePhone() {
  return '+91' + (7000000000 + Math.floor(Math.random() * 3000000000)).toString();
}

// ─── Seed ──────────────────────────────────────────────────────

function seed() {
  console.log('🌱 Seeding database...\n');

  // ── Create merchant ────────────────────────────────────────
  try {
    db.insertRow('merchants', {
      id: MERCHANT_ID,
      name: 'TechBazaar India',
      operating_mode: 'autonomous',
      guardrails: JSON.stringify({
        max_auto_transaction: 25000,
        max_recovery_attempts: 3,
        minimum_confidence: 0.70,
        max_discount_percent: 10,
        high_value_threshold: 100000,
        contact_cutoff_hour: 22,
        contact_start_hour: 8,
        kill_switch: false,
      }),
    });
    console.log('✓ Merchant "TechBazaar India" created');
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.log('• Merchant already exists, skipping');
    } else throw e;
  }

  // ── Create customers ───────────────────────────────────────
  const customerIds = [];
  for (let i = 0; i < NUM_CUSTOMERS; i++) {
    const id = `cust_${String(i + 1).padStart(4, '0')}`;
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : '');
    const isDoNotContact = i === 150; // Scenario D: one DNC customer

    try {
      db.insertRow('customers', {
        id,
        merchant_id: MERCHANT_ID,
        name,
        email: generateEmail(name),
        phone: generatePhone(),
        total_payments: 0,
        successful_payments: 0,
        failed_payments: 0,
        total_spent: 0,
        lifetime_value: 0,
        preferred_method: weightedPick(PAYMENT_METHODS, METHOD_WEIGHTS),
        do_not_contact: isDoNotContact ? 1 : 0,
      });
      customerIds.push(id);
    } catch (e) {
      if (!e.message.includes('UNIQUE')) throw e;
      customerIds.push(id);
    }
  }
  console.log(`✓ ${customerIds.length} customers created`);

  // ── Create payments ────────────────────────────────────────
  // Baseline payments (24–2 hours ago): normal 4% failure rate
  const baselineCount = Math.floor(NUM_PAYMENTS * 0.7);
  let paymentIndex = 0;

  for (let i = 0; i < baselineCount; i++) {
    const id = `pay_${String(++paymentIndex).padStart(5, '0')}`;
    const customerId = pick(customerIds);
    const method = weightedPick(PAYMENT_METHODS, METHOD_WEIGHTS);
    const amount = randomAmount();
    const isFailed = Math.random() < 0.04; // 4% baseline failure rate

    try {
      db.insertRow('payments', {
        id,
        merchant_id: MERCHANT_ID,
        customer_id: customerId,
        amount,
        method,
        status: isFailed ? 'failed' : 'captured',
        failure_reason: isFailed ? pick(FAILURE_REASONS) : null,
        captured: isFailed ? 0 : 1,
        created_at: randomDate(24), // within last 24 hours
      });
    } catch (e) {
      if (!e.message.includes('UNIQUE')) throw e;
    }
  }
  console.log(`✓ ${baselineCount} baseline payments created (4% failure rate)`);

  // Recent payments (last 2 hours): injected UPI spike → 19% failure rate overall
  const recentCount = NUM_PAYMENTS - baselineCount;
  const upiFailureRate = 0.35; // UPI failures spike to 35%
  const otherFailureRate = 0.05;

  for (let i = 0; i < recentCount; i++) {
    const id = `pay_${String(++paymentIndex).padStart(5, '0')}`;
    const customerId = pick(customerIds);
    const method = weightedPick(PAYMENT_METHODS, METHOD_WEIGHTS);
    const amount = randomAmount();
    const failureRate = method === 'upi' ? upiFailureRate : otherFailureRate;
    const isFailed = Math.random() < failureRate;

    try {
      db.insertRow('payments', {
        id,
        merchant_id: MERCHANT_ID,
        customer_id: customerId,
        amount,
        method,
        status: isFailed ? 'failed' : 'captured',
        failure_reason: isFailed
          ? (method === 'upi' ? pick(['upi_timeout', 'bank_unavailable', 'network_error']) : pick(FAILURE_REASONS))
          : null,
        captured: isFailed ? 0 : 1,
        created_at: randomDate(2), // within last 2 hours
      });
    } catch (e) {
      if (!e.message.includes('UNIQUE')) throw e;
    }
  }
  console.log(`✓ ${recentCount} recent payments created (UPI spike injected)`);

  // Scenario B: Inject high-value failures
  for (let i = 0; i < 5; i++) {
    const id = `pay_hv_${String(i + 1).padStart(3, '0')}`;
    const customerId = customerIds[i];
    const amount = 100000 + Math.floor(Math.random() * 400000); // ₹1L-5L

    try {
      db.insertRow('payments', {
        id,
        merchant_id: MERCHANT_ID,
        customer_id: customerId,
        amount,
        method: 'card',
        status: 'failed',
        failure_reason: 'transaction_limit_exceeded',
        captured: 0,
        created_at: randomDate(1),
      });
    } catch (e) {
      if (!e.message.includes('UNIQUE')) throw e;
    }
  }
  console.log('✓ 5 high-value failures injected (₹1L-5L)');

  // Scenario C: Repeat customer failures
  const repeatCustomer = customerIds[10];
  for (let i = 0; i < 4; i++) {
    const id = `pay_rpt_${String(i + 1).padStart(3, '0')}`;
    try {
      db.insertRow('payments', {
        id,
        merchant_id: MERCHANT_ID,
        customer_id: repeatCustomer,
        amount: 8500,
        method: 'upi',
        status: 'failed',
        failure_reason: 'upi_timeout',
        captured: 0,
        created_at: randomDate(3),
      });
    } catch (e) {
      if (!e.message.includes('UNIQUE')) throw e;
    }
  }
  console.log('✓ Repeat customer failure scenario injected');

  // ── Update customer aggregates ─────────────────────────────
  const database = db.getDatabase();
  database.exec(`
    UPDATE customers SET
      total_payments = (SELECT COUNT(*) FROM payments WHERE payments.customer_id = customers.id),
      successful_payments = (SELECT COUNT(*) FROM payments WHERE payments.customer_id = customers.id AND payments.status = 'captured'),
      failed_payments = (SELECT COUNT(*) FROM payments WHERE payments.customer_id = customers.id AND payments.status = 'failed'),
      total_spent = COALESCE((SELECT SUM(amount) FROM payments WHERE payments.customer_id = customers.id AND payments.status = 'captured'), 0),
      lifetime_value = COALESCE((SELECT SUM(amount) FROM payments WHERE payments.customer_id = customers.id AND payments.status = 'captured'), 0),
      last_payment_at = (SELECT MAX(created_at) FROM payments WHERE payments.customer_id = customers.id)
  `);
  console.log('✓ Customer aggregates updated');

  // ── Summary ────────────────────────────────────────────────
  const totalPayments = database.prepare('SELECT COUNT(*) as count FROM payments').get();
  const failedPayments = database.prepare("SELECT COUNT(*) as count FROM payments WHERE status = 'failed'").get();
  const failedAmount = database.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'failed'").get();
  const totalCustomers = database.prepare('SELECT COUNT(*) as count FROM customers').get();

  console.log('\n── Database Summary ───────────────────────────');
  console.log(`  Merchant:     TechBazaar India`);
  console.log(`  Customers:    ${totalCustomers.count}`);
  console.log(`  Payments:     ${totalPayments.count}`);
  console.log(`  Failed:       ${failedPayments.count} (${(failedPayments.count / totalPayments.count * 100).toFixed(1)}%)`);
  console.log(`  Revenue risk: ₹${Math.round(failedAmount.total).toLocaleString()}`);
  console.log('───────────────────────────────────────────────');
  console.log('\n✅ Seeding complete. Run: npm run dev\n');
}

// Run
seed();
