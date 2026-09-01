const { loadEnvConfig } = require('@next/env');
const path = require('path');
loadEnvConfig(path.resolve(__dirname, '..'));
const Razorpay = require('razorpay');

async function seedRazorpay() {
  console.log('Seeding Razorpay Test Data...');
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    console.error('Missing Razorpay credentials in .env.local');
    process.exit(1);
  }

  const client = new Razorpay({ key_id, key_secret });

  // 1. Create Customers
  const customerTemplates = [
    { name: 'Garvit Jain', email: 'garvit.jain@example.com', contact: '9876543210' },
    { name: 'John Doe', email: 'john.doe@example.com', contact: '9123456789' },
    { name: 'Alice Smith', email: 'alice.smith@example.com', contact: '9988776655' },
    { name: 'Rahul Sharma', email: 'rahul.s@example.com', contact: '9998887776' },
  ];

  const customers = [];
  for (const tpl of customerTemplates) {
    try {
      const c = await client.customers.create(tpl);
      customers.push(c);
      console.log(`Created customer: ${c.name} (${c.id})`);
    } catch (err) {
      console.error(`Failed to create customer ${tpl.name}:`, err.message);
    }
  }

  if (customers.length === 0) {
    console.log('No customers created. Exiting.');
    process.exit(1);
  }

  // 2. Create Orders (to simulate transactions)
  // We'll create a mix of orders. Since we map Orders with status 'created' to 'failed' in razorpay-sync,
  // leaving them unpaid is perfect for the Revenue Recovery Agent to detect as leakage!
  const orderTemplates = [
    { amount: 50000, customer: customers[0], receipt: 'rcpt_01' }, // 500 INR
    { amount: 120000, customer: customers[1], receipt: 'rcpt_02' }, // 1200 INR
    { amount: 25000, customer: customers[2], receipt: 'rcpt_03' }, // 250 INR
    { amount: 85000, customer: customers[3], receipt: 'rcpt_04' }, // 850 INR
    { amount: 35000, customer: customers[0], receipt: 'rcpt_05' }, // 350 INR
    { amount: 45000, customer: customers[2], receipt: 'rcpt_06' }, // 450 INR
  ];

  for (const tpl of orderTemplates) {
    try {
      const o = await client.orders.create({
        amount: tpl.amount,
        currency: 'INR',
        receipt: tpl.receipt,
        notes: { customer_id: tpl.customer.id },
      });
      console.log(`Created order for ${tpl.customer.name}: ${o.id} - ${tpl.amount / 100} INR`);
    } catch (err) {
      console.error(`Failed to create order for ${tpl.customer.name}:`, err.message);
    }
  }

  console.log('Finished seeding! You can now click "Sync Razorpay" in the dashboard.');
}

seedRazorpay();
