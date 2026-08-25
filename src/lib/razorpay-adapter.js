/*
 * razorpay-adapter.js
 * 
 * Abstraction layer over Razorpay APIs.
 * Supports two modes:
 *   - LIVE: Calls real Razorpay Test Mode APIs
 *   - MOCK: Returns simulated responses from synthetic data
 * 
 * The agent code never knows which mode is active.
 * This allows the demo to work without valid Razorpay credentials.
 */

const { generateId } = require('./database');

let razorpayInstance = null;

function getRazorpayClient() {
  if (razorpayInstance) return razorpayInstance;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (keyId && keySecret && !keyId.startsWith('rzp_test_XXX')) {
    try {
      const Razorpay = require('razorpay');
      razorpayInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
      console.log('[Razorpay] Connected to LIVE test mode');
      return razorpayInstance;
    } catch (err) {
      console.warn('[Razorpay] Failed to initialize live client:', err.message);
    }
  }

  console.log('[Razorpay] Using MOCK adapter (no valid credentials)');
  return null;
}

function isLiveMode() {
  return getRazorpayClient() !== null;
}

// ─── Payment Link Operations ───────────────────────────────────

async function createPaymentLink({ amount, customer_name, customer_email, customer_phone, description, reference_id }) {
  const client = getRazorpayClient();

  if (client) {
    try {
      const link = await client.paymentLink.create({
        amount: Math.round(amount * 100), // Razorpay uses paise
        currency: 'INR',
        description: description || 'Payment recovery',
        customer: {
          name: customer_name,
          email: customer_email,
          contact: customer_phone,
        },
        notify: { sms: true, email: true },
        reminder_enable: true,
        reference_id: reference_id,
        callback_url: '',
        callback_method: 'get',
      });

      return {
        success: true,
        payment_link_id: link.id,
        short_url: link.short_url,
        amount: amount,
        status: link.status,
        source: 'razorpay_live',
      };
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Razorpay API error',
        source: 'razorpay_live',
      };
    }
  }

  // Mock response
  const mockId = `plink_${generateId()}`;
  return {
    success: true,
    payment_link_id: mockId,
    short_url: `https://rzp.io/i/${mockId.substring(6, 14)}`,
    amount: amount,
    status: 'created',
    source: 'mock',
  };
}

async function fetchPaymentLink(paymentLinkId) {
  const client = getRazorpayClient();

  if (client) {
    try {
      const link = await client.paymentLink.fetch(paymentLinkId);
      return { success: true, data: link, source: 'razorpay_live' };
    } catch (err) {
      return { success: false, error: err.message, source: 'razorpay_live' };
    }
  }

  return {
    success: true,
    data: {
      id: paymentLinkId,
      amount: 0,
      status: 'created',
    },
    source: 'mock',
  };
}

// ─── Payment Operations ────────────────────────────────────────

async function fetchPayments(options = {}) {
  const client = getRazorpayClient();

  if (client) {
    try {
      const payments = await client.payments.all(options);
      return { success: true, data: payments, source: 'razorpay_live' };
    } catch (err) {
      return { success: false, error: err.message, source: 'razorpay_live' };
    }
  }

  return { success: true, data: { items: [], count: 0 }, source: 'mock' };
}

async function fetchPayment(paymentId) {
  const client = getRazorpayClient();

  if (client) {
    try {
      const payment = await client.payments.fetch(paymentId);
      return { success: true, data: payment, source: 'razorpay_live' };
    } catch (err) {
      return { success: false, error: err.message, source: 'razorpay_live' };
    }
  }

  return { success: false, error: 'Mock mode: payment not found', source: 'mock' };
}

// ─── Customer Operations ───────────────────────────────────────

async function fetchCustomers(options = {}) {
  const client = getRazorpayClient();

  if (client) {
    try {
      const customers = await client.customers.all(options);
      return { success: true, data: customers, source: 'razorpay_live' };
    } catch (err) {
      return { success: false, error: err.message, source: 'razorpay_live' };
    }
  }

  return { success: true, data: { items: [], count: 0 }, source: 'mock' };
}

// ─── Webhook Signature Verification ────────────────────────────

function verifyWebhookSignature(body, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;

  try {
    const Razorpay = require('razorpay');
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  } catch {
    return false;
  }
}

module.exports = {
  isLiveMode,
  createPaymentLink,
  fetchPaymentLink,
  fetchPayments,
  fetchPayment,
  fetchCustomers,
  verifyWebhookSignature,
};
