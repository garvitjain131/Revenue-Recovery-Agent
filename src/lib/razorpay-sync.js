/*
 * razorpay-sync.js
 * 
 * Synchronizes data from the Razorpay Test API into the local database
 * via the data-ingestion normalization layer.
 */

const razorpayAdapter = require('./razorpay-adapter');
const dataIngestion = require('./data-ingestion');

/**
 * Synchronize payments and customers from Razorpay API.
 * @param {string} merchant_id 
 */
async function syncFromRazorpay(merchant_id) {
  if (!razorpayAdapter.isLiveMode()) {
    return {
      success: false,
      error: 'Razorpay API credentials not configured or not in Test Mode. Sync unavailable.',
    };
  }

  try {
    const results = {
      customers: { records: 0, imported: 0 },
      payments: { records: 0, imported: 0 },
    };

    // 1. Sync Customers
    const customersResponse = await razorpayAdapter.fetchCustomers({ count: 100 });
    if (customersResponse.success && customersResponse.data && customersResponse.data.items) {
      const customers = customersResponse.data.items.map(mapCustomerToInternal);
      const customerResult = dataIngestion.ingestJSON(customers, 'customers', merchant_id, 'Razorpay API Sync');
      results.customers.records = customers.length;
      results.customers.imported = customerResult.success ? customerResult.summary.accepted : 0;
    }

    // 2. Sync Payments & Orders (Simulating failed transactions)
    const paymentsResponse = await razorpayAdapter.fetchPayments({ count: 100 });
    const ordersResponse = await razorpayAdapter.fetchOrders({ count: 100 });
    
    let allTransactions = [];
    
    if (paymentsResponse.success && paymentsResponse.data && paymentsResponse.data.items) {
      allTransactions = allTransactions.concat(paymentsResponse.data.items.map(mapPaymentToInternal));
    }
    
    if (ordersResponse.success && ordersResponse.data && ordersResponse.data.items) {
      allTransactions = allTransactions.concat(ordersResponse.data.items.map(mapOrderToInternal));
    }

    if (allTransactions.length > 0) {
      const paymentResult = dataIngestion.ingestJSON(allTransactions, 'transactions', merchant_id, 'Razorpay API Sync');
      results.payments.records = allTransactions.length;
      results.payments.imported = paymentResult.success ? paymentResult.summary.accepted : 0;
    }

    return {
      success: true,
      message: 'Razorpay Test Data synchronized successfully.',
      details: results,
    };
  } catch (err) {
    console.error('[Sync] Razorpay sync failed:', err);
    return {
      success: false,
      error: `Failed to synchronize with Razorpay: ${err.message}`,
    };
  }
}

function mapCustomerToInternal(rzpCustomer) {
  return {
    customer_id: rzpCustomer.id,
    name: rzpCustomer.name,
    email: rzpCustomer.email,
    phone: rzpCustomer.contact,
    created_at: new Date(rzpCustomer.created_at * 1000).toISOString(),
  };
}

function mapPaymentToInternal(rzpPayment) {
  return {
    transaction_id: rzpPayment.id,
    customer_id: rzpPayment.customer_id,
    order_id: rzpPayment.order_id,
    amount: (rzpPayment.amount / 100).toFixed(2), // Convert from paise to rupees
    currency: rzpPayment.currency,
    payment_status: rzpPayment.status,
    payment_method: rzpPayment.method,
    failure_reason: rzpPayment.error_description || rzpPayment.error_reason,
    timestamp: new Date(rzpPayment.created_at * 1000).toISOString(),
  };
}

function mapOrderToInternal(rzpOrder) {
  return {
    transaction_id: rzpOrder.id, // Use order ID as transaction ID for simulation
    customer_id: rzpOrder.notes?.customer_id || null, // Pull from notes if we inject it there
    order_id: rzpOrder.id,
    amount: (rzpOrder.amount / 100).toFixed(2),
    currency: rzpOrder.currency,
    // Map order statuses to payment statuses for the agent
    payment_status: rzpOrder.status === 'paid' ? 'captured' : 'failed',
    payment_method: 'unknown',
    failure_reason: rzpOrder.status === 'paid' ? null : 'Customer abandoned checkout or payment failed',
    timestamp: new Date(rzpOrder.created_at * 1000).toISOString(),
  };
}

module.exports = {
  syncFromRazorpay,
};
