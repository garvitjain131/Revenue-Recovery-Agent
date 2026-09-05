import { NextResponse } from 'next/server';
import db from '@/lib/database';

const FIRST_NAMES = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
  'Krishna', 'Ishaan', 'Shaurya', 'Rohan', 'Kabir', 'Rudra', 'Aryan', 'Dhruv',
  'Dev', 'Kunal', 'Manish', 'Harsh', 'Vikram', 'Sameer', 'Rahul', 'Nikhil',
  'Diya', 'Ananya', 'Aadhya', 'Pari', 'Navya', 'Saanvi', 'Myra', 'Sara',
  'Anika', 'Isha', 'Meera', 'Riya', 'Kavya', 'Sneha', 'Tanvi', 'Pooja',
  'Neha', 'Priyanka', 'Shreya', 'Simran', 'Nandini', 'Tara', 'Ritu', 'Pallavi'
];

const LAST_NAMES = [
  'Sharma', 'Patel', 'Iyer', 'Rao', 'Nair', 'Gupta', 'Sen', 'Joshi',
  'Kulkarni', 'Bhat', 'Reddy', 'Deshmukh', 'Banerjee', 'Agarwal', 'Pillai', 'Choudhury',
  'Kapoor', 'Bhattacharya', 'Chatterjee', 'Menon', 'Verma', 'Mehta', 'Singhania', 'Malhotra',
  'Saxena', 'Mishra', 'Pandey', 'Trivedi', 'Bose', 'Dutta', 'Ghosh', 'Mukherjee',
  'Shetty', 'Hegde', 'Gowda', 'Chauhan', 'Yadav', 'Dubey', 'Soni', 'Bhandari'
];

function getRandomName() {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return { fullName: `${first} ${last}`, first, last };
}

const FAILURE_REASONS = [
  { reason: 'insufficient_funds', code: 'INSUFFICIENT_FUNDS' },
  { reason: 'upi_timeout', code: 'U30_TIMEOUT' },
  { reason: 'gateway_error', code: 'GATEWAY_DECLINE' },
  { reason: 'card_limit_exceeded', code: 'LIMIT_EXCEEDED' },
];

const METHODS = ['upi', 'card', 'netbanking'];

export async function POST(request) {
  try {
    let merchant_id = 'merchant_rzp_test';
    try {
      const body = await request.json();
      if (body?.merchant_id) merchant_id = body.merchant_id;
    } catch {}

    const now = Date.now();
    const isoNow = new Date(now).toISOString();

    // Ensure merchant exists
    let merchant = db.getRow('merchants', { id: merchant_id });
    if (!merchant) {
      db.insertRow('merchants', {
        id: merchant_id,
        name: merchant_id === 'merchant_demo' ? 'PayFlow Commerce' : 'TechBazaar India',
        operating_mode: 'autonomous',
        last_synced_at: isoNow,
      });
    }

    // 1. Randomize Batch Size: 15 to 45 transactions
    const totalCount = Math.floor(15 + Math.random() * 31); // 15..45 inclusive

    const insertedPayments = [];
    let capturedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < totalCount; i++) {
      // 2. Weighted Randomization: 75% captured, 25% failed
      const isSuccess = Math.random() < 0.75;
      const status = isSuccess ? 'captured' : 'failed';
      const captured = isSuccess ? 1 : 0;

      let failure_reason = null;
      let error_code = null;
      if (!isSuccess) {
        const failItem = FAILURE_REASONS[Math.floor(Math.random() * FAILURE_REASONS.length)];
        failure_reason = failItem.reason;
        error_code = failItem.code;
        failedCount++;
      } else {
        capturedCount++;
      }

      // 3. Dynamic Properties
      // Amount between ₹500 and ₹50,000
      const amount = Math.floor(500 + Math.random() * 49500);
      
      // Payment method
      const method = METHODS[Math.floor(Math.random() * METHODS.length)];

      // Random customer: cust_mock_ + 4 digits
      const randomDigits = Math.floor(1000 + Math.random() * 9000);
      const customerId = `cust_mock_${randomDigits}`;

      // Generate a unique customer ID and dynamically randomized Indian name
      const randomPerson = getRandomName();
      const existingCustomer = db.getRow('customers', { id: customerId });
      if (!existingCustomer) {
        const email = `${randomPerson.first.toLowerCase()}.${randomPerson.last.toLowerCase()}.${randomDigits}@example.com`;
        const phone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
        db.insertRow('customers', {
          id: customerId,
          merchant_id,
          name: randomPerson.fullName,
          email,
          phone,
          lifetime_value: amount * Math.floor(1 + Math.random() * 4),
          total_payments: 1,
          successful_payments: isSuccess ? 1 : 0,
          failed_payments: isSuccess ? 0 : 1,
          total_spent: isSuccess ? amount : 0,
          preferred_method: method,
          last_payment_at: isoNow,
        });
      }

      const payId = `pay_sync_${db.generateId()}`;
      // Stagger timestamp slightly in the last 2 hours
      const timeOffsetMs = Math.floor(Math.random() * 2 * 60 * 60 * 1000);
      const createdAt = new Date(now - timeOffsetMs).toISOString();

      const paymentRecord = {
        id: payId,
        merchant_id,
        customer_id: customerId,
        amount,
        currency: 'INR',
        status,
        method,
        failure_reason,
        error_code,
        captured,
        created_at: createdAt,
      };

      db.insertRow('payments', paymentRecord);
      insertedPayments.push(paymentRecord);
    }

    // 4. Update merchant last_synced_at
    db.updateRow('merchants', {
      last_synced_at: isoNow,
      updated_at: isoNow,
    }, { id: merchant_id });

    return NextResponse.json({
      success: true,
      total_synced: totalCount,
      captured_count: capturedCount,
      failed_count: failedCount,
      last_synced_at: isoNow,
      message: `Synchronized ${totalCount} transactions (${capturedCount} captured, ${failedCount} failed).`,
    });
  } catch (error) {
    console.error('[API] Sync failed:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Data sync failed' },
      { status: 500 }
    );
  }
}
