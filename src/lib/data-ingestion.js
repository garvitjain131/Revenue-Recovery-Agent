/*
 * data-ingestion.js
 * 
 * CSV data ingestion with validation and normalization.
 * 
 * Transforms raw merchant CSV data into the application's internal schema.
 * Handles column name normalization, type validation, and error reporting.
 * 
 * Supported data types:
 *   - transactions (→ payments table)
 *   - customers (→ customers table)
 *   - orders (→ orders table)
 *   - cart_events (→ cart_events table)
 *   - discounts (→ discounts table)
 */

const { parse } = require('csv-parse/sync');
const db = require('./database');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_ROW_COUNT = 25000;

function sanitizeString(val, maxLen = 255) {
  if (val === null || val === undefined) return null;
  return String(val).replace(/\0/g, '').trim().slice(0, maxLen);
}

function isValidDate(raw) {
  if (!raw) return true; // optional
  const d = new Date(raw);
  if (isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year < 2000 || year > currentYear + 1) return false;
  return true;
}

const DATA_SCHEMAS = {
  transactions: {
    required: ['transaction_id', 'amount', 'payment_status'],
    optional: ['customer_id', 'payment_method', 'failure_reason', 'order_id', 'timestamp', 'device', 'currency'],
    aliases: {
      'txn_id': 'transaction_id',
      'id': 'transaction_id',
      'trans_id': 'transaction_id',
      'txn_amount': 'amount',
      'transaction_amount': 'amount',
      'total': 'amount',
      'status': 'payment_status',
      'txn_status': 'payment_status',
      'payment_status': 'payment_status',
      'method': 'payment_method',
      'pay_method': 'payment_method',
      'type': 'payment_method',
      'fail_reason': 'failure_reason',
      'error': 'failure_reason',
      'error_reason': 'failure_reason',
      'cust_id': 'customer_id',
      'customer': 'customer_id',
      'date': 'timestamp',
      'created_at': 'timestamp',
      'txn_date': 'timestamp',
      'transaction_date': 'timestamp',
    },
    targetTable: 'payments',
    transform: (row, merchant_id) => ({
      id: sanitizeString(row.transaction_id, 100),
      merchant_id: sanitizeString(merchant_id, 100),
      customer_id: sanitizeString(row.customer_id, 100) || null,
      amount: Math.round(parseFloat(row.amount) * 100) / 100,
      currency: sanitizeString(row.currency, 10) || 'INR',
      status: normalizePaymentStatus(row.payment_status),
      method: normalizePaymentMethod(row.payment_method),
      failure_reason: sanitizeString(row.failure_reason, 500) || null,
      captured: normalizePaymentStatus(row.payment_status) === 'captured' ? 1 : 0,
      created_at: normalizeDate(row.timestamp) || new Date().toISOString(),
    }),
    validate: (row) => {
      const errors = [];
      if (!row.transaction_id || !sanitizeString(row.transaction_id)) errors.push('missing transaction_id');
      const amt = parseFloat(row.amount);
      if (row.amount === undefined || row.amount === null || isNaN(amt) || !isFinite(amt)) {
        errors.push('invalid amount');
      } else if (amt <= 0) {
        errors.push('amount must be positive');
      } else if (amt > 100000000) {
        errors.push('amount exceeds maximum threshold');
      }
      if (!row.payment_status || !sanitizeString(row.payment_status)) errors.push('missing payment_status');
      if (row.timestamp && !isValidDate(row.timestamp)) errors.push('invalid timestamp');
      return errors;
    },
  },

  customers: {
    required: ['customer_id'],
    optional: ['name', 'email', 'phone', 'customer_type', 'location', 'device', 'created_at'],
    aliases: {
      'cust_id': 'customer_id',
      'id': 'customer_id',
      'customer_name': 'name',
      'full_name': 'name',
      'email_address': 'email',
      'phone_number': 'phone',
      'mobile': 'phone',
      'type': 'customer_type',
      'city': 'location',
      'date': 'created_at',
      'registered_at': 'created_at',
      'signup_date': 'created_at',
    },
    targetTable: 'customers',
    transform: (row, merchant_id) => ({
      id: sanitizeString(row.customer_id, 100),
      merchant_id: sanitizeString(merchant_id, 100),
      name: sanitizeString(row.name, 150) || null,
      email: sanitizeString(row.email, 150) || null,
      phone: sanitizeString(row.phone, 30) || null,
      total_payments: 0,
      successful_payments: 0,
      failed_payments: 0,
      total_spent: 0,
      lifetime_value: 0,
      created_at: normalizeDate(row.created_at) || new Date().toISOString(),
    }),
    validate: (row) => {
      const errors = [];
      if (!row.customer_id || !sanitizeString(row.customer_id)) errors.push('missing customer_id');
      if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email).trim())) {
        errors.push('invalid email format');
      }
      if (row.phone && !/^[0-9+\s\-()]{5,30}$/.test(String(row.phone).trim())) {
        errors.push('invalid phone format');
      }
      if (row.created_at && !isValidDate(row.created_at)) errors.push('invalid created_at');
      return errors;
    },
  },

  orders: {
    required: ['order_id', 'order_amount'],
    optional: ['customer_id', 'product_name', 'quantity', 'order_status', 'timestamp'],
    aliases: {
      'id': 'order_id',
      'amount': 'order_amount',
      'total': 'order_amount',
      'product': 'product_name',
      'item': 'product_name',
      'qty': 'quantity',
      'status': 'order_status',
      'cust_id': 'customer_id',
      'customer': 'customer_id',
      'date': 'timestamp',
      'created_at': 'timestamp',
      'order_date': 'timestamp',
    },
    targetTable: 'orders',
    transform: (row, merchant_id) => ({
      id: sanitizeString(row.order_id, 100),
      merchant_id: sanitizeString(merchant_id, 100),
      customer_id: sanitizeString(row.customer_id, 100) || null,
      product_name: sanitizeString(row.product_name, 200) || null,
      quantity: Math.max(1, parseInt(row.quantity, 10) || 1),
      order_amount: Math.round(parseFloat(row.order_amount) * 100) / 100,
      order_status: sanitizeString(row.order_status, 50) || 'completed',
      created_at: normalizeDate(row.timestamp) || new Date().toISOString(),
    }),
    validate: (row) => {
      const errors = [];
      if (!row.order_id || !sanitizeString(row.order_id)) errors.push('missing order_id');
      const amt = parseFloat(row.order_amount);
      if (row.order_amount === undefined || row.order_amount === null || isNaN(amt) || !isFinite(amt)) {
        errors.push('invalid order_amount');
      } else if (amt <= 0) {
        errors.push('order_amount must be positive');
      }
      if (row.quantity !== undefined && row.quantity !== null && (isNaN(parseInt(row.quantity, 10)) || parseInt(row.quantity, 10) < 1)) {
        errors.push('invalid quantity');
      }
      if (row.timestamp && !isValidDate(row.timestamp)) errors.push('invalid timestamp');
      return errors;
    },
  },

  cart_events: {
    required: ['cart_id', 'event_type'],
    optional: ['customer_id', 'product_name', 'product_id', 'cart_value', 'timestamp'],
    aliases: {
      'id': 'cart_id',
      'event': 'event_type',
      'action': 'event_type',
      'type': 'event_type',
      'value': 'cart_value',
      'amount': 'cart_value',
      'total': 'cart_value',
      'product': 'product_name',
      'item': 'product_name',
      'cust_id': 'customer_id',
      'customer': 'customer_id',
      'date': 'timestamp',
      'created_at': 'timestamp',
    },
    targetTable: 'cart_events',
    transform: (row, merchant_id) => ({
      id: sanitizeString(row.cart_id, 100),
      merchant_id: sanitizeString(merchant_id, 100),
      customer_id: sanitizeString(row.customer_id, 100) || null,
      product_name: sanitizeString(row.product_name, 200) || null,
      cart_value: Math.max(0, parseFloat(row.cart_value) || 0),
      event_type: normalizeCartEvent(row.event_type),
      created_at: normalizeDate(row.timestamp) || new Date().toISOString(),
    }),
    validate: (row) => {
      const errors = [];
      if (!row.cart_id || !sanitizeString(row.cart_id)) errors.push('missing cart_id');
      if (!row.event_type || !sanitizeString(row.event_type)) errors.push('missing event_type');
      const validEvents = ['added', 'checkout_started', 'purchased', 'abandoned'];
      if (row.event_type && !validEvents.includes(normalizeCartEvent(row.event_type))) {
        errors.push(`invalid event_type: ${row.event_type}`);
      }
      if (row.cart_value !== undefined && row.cart_value !== null) {
        const val = parseFloat(row.cart_value);
        if (isNaN(val) || !isFinite(val) || val < 0) errors.push('invalid cart_value');
      }
      if (row.timestamp && !isValidDate(row.timestamp)) errors.push('invalid timestamp');
      return errors;
    },
  },

  discounts: {
    required: ['discount_id', 'original_amount', 'discount_amount'],
    optional: ['order_id', 'customer_id', 'final_amount', 'discount_code', 'timestamp'],
    aliases: {
      'id': 'discount_id',
      'original': 'original_amount',
      'orig_amount': 'original_amount',
      'discount': 'discount_amount',
      'disc_amount': 'discount_amount',
      'final': 'final_amount',
      'net_amount': 'final_amount',
      'code': 'discount_code',
      'coupon': 'discount_code',
      'coupon_code': 'discount_code',
      'cust_id': 'customer_id',
      'customer': 'customer_id',
      'date': 'timestamp',
      'created_at': 'timestamp',
    },
    targetTable: 'discounts',
    transform: (row, merchant_id) => {
      const orig = parseFloat(row.original_amount);
      const disc = parseFloat(row.discount_amount);
      const fin = row.final_amount !== undefined && row.final_amount !== null && !isNaN(parseFloat(row.final_amount))
        ? parseFloat(row.final_amount)
        : Math.max(0, orig - disc);
      return {
        id: sanitizeString(row.discount_id, 100),
        merchant_id: sanitizeString(merchant_id, 100),
        order_id: sanitizeString(row.order_id, 100) || null,
        customer_id: sanitizeString(row.customer_id, 100) || null,
        original_amount: Math.round(orig * 100) / 100,
        discount_amount: Math.round(disc * 100) / 100,
        final_amount: Math.round(fin * 100) / 100,
        discount_code: sanitizeString(row.discount_code, 100) || null,
        created_at: normalizeDate(row.timestamp) || new Date().toISOString(),
      };
    },
    validate: (row) => {
      const errors = [];
      if (!row.discount_id || !sanitizeString(row.discount_id)) errors.push('missing discount_id');
      const orig = parseFloat(row.original_amount);
      const disc = parseFloat(row.discount_amount);
      if (row.original_amount === undefined || row.original_amount === null || isNaN(orig) || !isFinite(orig) || orig <= 0) {
        errors.push('invalid original_amount');
      }
      if (row.discount_amount === undefined || row.discount_amount === null || isNaN(disc) || !isFinite(disc) || disc < 0) {
        errors.push('invalid discount_amount');
      }
      if (!isNaN(orig) && !isNaN(disc) && disc > orig) {
        errors.push('discount exceeds original amount');
      }
      if (row.timestamp && !isValidDate(row.timestamp)) errors.push('invalid timestamp');
      return errors;
    },
  },
};

// ─── Normalization Helpers ─────────────────────────────────────

function normalizePaymentStatus(raw) {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  const map = {
    'captured': 'captured', 'success': 'captured', 'successful': 'captured', 'paid': 'captured',
    'completed': 'captured', 'authorized': 'captured', 'settled': 'captured',
    'failed': 'failed', 'failure': 'failed', 'declined': 'failed', 'rejected': 'failed',
    'error': 'failed', 'timeout': 'failed',
    'pending': 'pending', 'created': 'pending', 'processing': 'pending',
    'refunded': 'refunded',
  };
  return map[s] || s;
}

function normalizePaymentMethod(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const map = {
    'upi': 'upi', 'card': 'card', 'credit_card': 'card', 'debit_card': 'card',
    'credit card': 'card', 'debit card': 'card', 'cc': 'card', 'dc': 'card',
    'netbanking': 'netbanking', 'net_banking': 'netbanking', 'net banking': 'netbanking', 'nb': 'netbanking',
    'wallet': 'wallet', 'emi': 'emi', 'paylater': 'paylater', 'pay_later': 'paylater',
  };
  return map[s] || s;
}

function normalizeCartEvent(raw) {
  if (!raw) return 'unknown';
  const s = String(raw).toLowerCase().trim();
  const map = {
    'added': 'added', 'add': 'added', 'add_to_cart': 'added',
    'checkout_started': 'checkout_started', 'checkout': 'checkout_started',
    'begin_checkout': 'checkout_started', 'start_checkout': 'checkout_started',
    'purchased': 'purchased', 'purchase': 'purchased', 'completed': 'purchased',
    'converted': 'purchased', 'bought': 'purchased',
    'abandoned': 'abandoned', 'abandon': 'abandoned', 'dropped': 'abandoned',
  };
  return map[s] || s;
}

function normalizeDate(raw) {
  if (!raw) return null;
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

// ─── Column Name Normalization ─────────────────────────────────

function normalizeColumnNames(row, schema) {
  const normalized = {};
  const allAliases = schema.aliases || {};
  const allFields = [...schema.required, ...schema.optional];

  for (const [rawKey, value] of Object.entries(row)) {
    const cleanKey = rawKey.toLowerCase().trim().replace(/\s+/g, '_');

    // Direct match
    if (allFields.includes(cleanKey)) {
      normalized[cleanKey] = value;
      continue;
    }

    // Alias match
    if (allAliases[cleanKey]) {
      normalized[allAliases[cleanKey]] = value;
      continue;
    }

    // Keep unmapped columns silently (don't error, just ignore)
  }

  return normalized;
}

// ─── Main Ingestion Function ───────────────────────────────────

/**
 * Ingest CSV data for a merchant.
 * 
 * @param {string} csvContent - Raw CSV string
 * @param {string} dataType - One of: transactions, customers, orders, cart_events, discounts
 * @param {string} merchant_id - Merchant identifier
 * @param {string} fileName - Original file name for audit
 * @returns {Object} Import result with summary and errors
 */
function ingestCSV(csvContent, dataType, merchant_id, fileName = 'upload.csv') {
  const schema = DATA_SCHEMAS[dataType];
  if (!schema) {
    return {
      success: false,
      error: `Unknown data type: "${dataType}". Supported: ${Object.keys(DATA_SCHEMAS).join(', ')}`,
    };
  }

  if (!csvContent || typeof csvContent !== 'string') {
    return {
      success: false,
      error: 'CSV content is empty or invalid.',
    };
  }

  const byteLength = Buffer.byteLength(csvContent, 'utf8');
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `CSV file size (${(byteLength / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed limit of 10MB.`,
    };
  }

  // Parse CSV
  let rawRows;
  try {
    rawRows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    return {
      success: false,
      error: `CSV parsing failed: ${err.message}`,
    };
  }

  if (rawRows.length === 0) {
    return {
      success: false,
      error: 'CSV file contains no data rows.',
    };
  }

  if (rawRows.length > MAX_ROW_COUNT) {
    return {
      success: false,
      error: `CSV row count (${rawRows.length}) exceeds maximum allowed limit of ${MAX_ROW_COUNT} rows.`,
    };
  }

  // Ensure merchant exists
  let merchant = db.getRow('merchants', { id: merchant_id });
  if (!merchant) {
    db.insertRow('merchants', {
      id: merchant_id,
      name: merchant_id,
      operating_mode: 'review',
      guardrails: JSON.stringify({}),
    });
  }

  // Normalize column names and validate
  const accepted = [];
  const rejected = [];
  const reasonCounts = {};
  const seenIds = new Set();

  for (let i = 0; i < rawRows.length; i++) {
    const normalized = normalizeColumnNames(rawRows[i], schema);
    const errors = schema.validate(normalized);

    // Check for duplicate IDs
    const idField = schema.required[0]; // first required field is the ID
    if (normalized[idField] && seenIds.has(normalized[idField])) {
      errors.push(`duplicate ${idField}`);
    }

    if (errors.length > 0) {
      rejected.push({ row: i + 2, errors }); // +2 for header + 1-indexed
      for (const err of errors) {
        reasonCounts[err] = (reasonCounts[err] || 0) + 1;
      }
      continue;
    }

    seenIds.add(normalized[idField]);

    try {
      const transformed = schema.transform(normalized, merchant_id);
      accepted.push(transformed);
    } catch (err) {
      rejected.push({ row: i + 2, errors: [`transform error: ${err.message}`] });
      reasonCounts['transform_error'] = (reasonCounts['transform_error'] || 0) + 1;
    }
  }

  // Insert accepted rows into database
  let insertedCount = 0;
  let skippedDuplicates = 0;
  const database = db.getDatabase();
  const insertStmt = buildInsertStatement(database, schema.targetTable, accepted[0]);

  if (insertStmt && accepted.length > 0) {
    const transaction = database.transaction(() => {
      for (const row of accepted) {
        try {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map(() => '?').join(', ');
          database.prepare(
            `INSERT OR IGNORE INTO ${schema.targetTable} (${columns.join(', ')}) VALUES (${placeholders})`
          ).run(...values);
          insertedCount++;
        } catch (err) {
          if (err.message.includes('UNIQUE')) {
            skippedDuplicates++;
          } else {
            console.error(`[Ingestion] Insert error row:`, err.message);
          }
        }
      }
    });
    transaction();
  }

  // Update customer aggregates if we imported transactions
  if (dataType === 'transactions') {
    updateCustomerAggregates(merchant_id);
  }

  // Record data source
  try {
    db.insertRow('data_sources', {
      merchant_id,
      data_type: dataType,
      record_count: rawRows.length,
      accepted_count: insertedCount,
      rejected_count: rejected.length,
      file_name: fileName,
    });
  } catch (e) {
    console.error('[Ingestion] Failed to record data source:', e.message);
  }

  return {
    success: true,
    summary: {
      data_type: dataType,
      merchant_id,
      file_name: fileName,
      total_records: rawRows.length,
      accepted: insertedCount,
      rejected: rejected.length,
      skipped_duplicates: skippedDuplicates,
      rejection_reasons: Object.entries(reasonCounts).map(([reason, count]) => ({ reason, count })),
    },
    rejected_samples: rejected.slice(0, 10), // show first 10 for debugging
  };
}

function buildInsertStatement(database, table, sampleRow) {
  if (!sampleRow) return null;
  const columns = Object.keys(sampleRow);
  const placeholders = columns.map(() => '?').join(', ');
  return database.prepare(
    `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
  );
}

function updateCustomerAggregates(merchant_id) {
  try {
    const database = db.getDatabase();
    database.prepare(`
      UPDATE customers SET
        total_payments = COALESCE((SELECT COUNT(*) FROM payments WHERE payments.customer_id = customers.id AND payments.merchant_id = ?), 0),
        successful_payments = COALESCE((SELECT COUNT(*) FROM payments WHERE payments.customer_id = customers.id AND payments.merchant_id = ? AND payments.status = 'captured'), 0),
        failed_payments = COALESCE((SELECT COUNT(*) FROM payments WHERE payments.customer_id = customers.id AND payments.merchant_id = ? AND payments.status = 'failed'), 0),
        total_spent = COALESCE((SELECT SUM(amount) FROM payments WHERE payments.customer_id = customers.id AND payments.merchant_id = ? AND payments.status = 'captured'), 0),
        lifetime_value = COALESCE((SELECT SUM(amount) FROM payments WHERE payments.customer_id = customers.id AND payments.merchant_id = ? AND payments.status = 'captured'), 0),
        last_payment_at = (SELECT MAX(created_at) FROM payments WHERE payments.customer_id = customers.id AND payments.merchant_id = ?)
      WHERE customers.merchant_id = ?
    `).run(merchant_id, merchant_id, merchant_id, merchant_id, merchant_id, merchant_id, merchant_id);
  } catch (err) {
    console.error('[Ingestion] Customer aggregates update failed:', err.message);
  }
}

// ─── Data Availability ─────────────────────────────────────────

/**
 * Get data availability for a merchant.
 * Returns which data types have been uploaded and their record counts.
 */
function getDataAvailability(merchant_id) {
  const sources = db.runQuery(
    'SELECT data_type, SUM(accepted_count) as records, MAX(imported_at) as last_import, MAX(file_name) as file_name FROM data_sources WHERE merchant_id = ? GROUP BY data_type',
    [merchant_id]
  );

  const availability = {};
  for (const type of Object.keys(DATA_SCHEMAS)) {
    const source = sources.find(s => s.data_type === type);
    availability[type] = {
      available: !!source && source.records > 0,
      records: source ? source.records : 0,
      last_import: source ? source.last_import : null,
      file_name: source ? source.file_name : null,
    };
  }

  // Determine available analyses
  const analyses = [];
  if (availability.transactions.available) {
    analyses.push('payment_failure_analysis');
    analyses.push('revenue_analysis');
  }
  if (availability.transactions.available && availability.customers.available) {
    analyses.push('customer_recovery_analysis');
  }
  if (availability.cart_events.available) {
    analyses.push('cart_abandonment_analysis');
  }
  if (availability.discounts.available) {
    analyses.push('discount_leakage_analysis');
  }

  return {
    sources: availability,
    available_analyses: analyses,
    has_data: Object.values(availability).some(a => a.available),
  };
}

/**
 * Ingest JSON data (array of objects) for a merchant.
 * Used for Razorpay API sync where data is already parsed.
 * 
 * @param {Array<Object>} jsonData - Array of raw data objects
 * @param {string} dataType - One of: transactions, customers, orders, cart_events, discounts
 * @param {string} merchant_id - Merchant identifier
 * @param {string} fileName - Source name for audit
 * @returns {Object} Import result with summary and errors
 */
function ingestJSON(jsonData, dataType, merchant_id, fileName = 'api_sync') {
  const schema = DATA_SCHEMAS[dataType];
  if (!schema) {
    return {
      success: false,
      error: `Unknown data type: "${dataType}". Supported: ${Object.keys(DATA_SCHEMAS).join(', ')}`,
    };
  }

  if (!Array.isArray(jsonData) || jsonData.length === 0) {
    return {
      success: false,
      error: 'Data is empty or not an array.',
    };
  }

  if (jsonData.length > MAX_ROW_COUNT) {
    return {
      success: false,
      error: `Record count (${jsonData.length}) exceeds maximum allowed limit of ${MAX_ROW_COUNT} records.`,
    };
  }

  // Ensure merchant exists
  let merchant = db.getRow('merchants', { id: merchant_id });
  if (!merchant) {
    db.insertRow('merchants', {
      id: merchant_id,
      name: merchant_id,
      operating_mode: 'review',
      guardrails: JSON.stringify({}),
    });
  }

  const accepted = [];
  const rejected = [];
  const reasonCounts = {};
  const seenIds = new Set();

  for (let i = 0; i < jsonData.length; i++) {
    const normalized = normalizeColumnNames(jsonData[i], schema);
    const errors = schema.validate(normalized);

    const idField = schema.required[0];
    if (normalized[idField] && seenIds.has(normalized[idField])) {
      errors.push(`duplicate ${idField}`);
    }

    if (errors.length > 0) {
      rejected.push({ row: i + 1, errors });
      for (const err of errors) {
        reasonCounts[err] = (reasonCounts[err] || 0) + 1;
      }
      continue;
    }

    seenIds.add(normalized[idField]);

    try {
      const transformed = schema.transform(normalized, merchant_id);
      accepted.push(transformed);
    } catch (err) {
      rejected.push({ row: i + 1, errors: [`transform error: ${err.message}`] });
      reasonCounts['transform_error'] = (reasonCounts['transform_error'] || 0) + 1;
    }
  }

  let insertedCount = 0;
  let skippedDuplicates = 0;
  const database = db.getDatabase();
  const insertStmt = buildInsertStatement(database, schema.targetTable, accepted[0]);

  if (insertStmt && accepted.length > 0) {
    const transaction = database.transaction(() => {
      for (const row of accepted) {
        try {
          const columns = Object.keys(row);
          const values = Object.values(row);
          const placeholders = columns.map(() => '?').join(', ');
          database.prepare(
            `INSERT OR IGNORE INTO ${schema.targetTable} (${columns.join(', ')}) VALUES (${placeholders})`
          ).run(...values);
          insertedCount++;
        } catch (err) {
          if (err.message.includes('UNIQUE')) {
            skippedDuplicates++;
          } else {
            console.error(`[Ingestion] Insert error row:`, err.message);
          }
        }
      }
    });
    transaction();
  }

  if (dataType === 'transactions') {
    updateCustomerAggregates(merchant_id);
  }

  try {
    db.insertRow('data_sources', {
      merchant_id,
      data_type: dataType,
      record_count: jsonData.length,
      accepted_count: insertedCount,
      rejected_count: rejected.length,
      file_name: fileName,
    });
  } catch (e) {
    console.error('[Ingestion] Failed to record data source:', e.message);
  }

  return {
    success: true,
    summary: {
      data_type: dataType,
      merchant_id,
      file_name: fileName,
      total_records: jsonData.length,
      accepted: insertedCount,
      rejected: rejected.length,
      skipped_duplicates: skippedDuplicates,
      rejection_reasons: Object.entries(reasonCounts).map(([reason, count]) => ({ reason, count })),
    },
    rejected_samples: rejected.slice(0, 10),
  };
}

/**
 * Get supported data types and their required/optional fields.
 */
function getSupportedFormats() {
  return Object.entries(DATA_SCHEMAS).map(([type, schema]) => ({
    type,
    required_columns: schema.required,
    optional_columns: schema.optional,
    description: {
      transactions: 'Payment/transaction records — enables payment failure analysis',
      customers: 'Customer profiles — enables customer-level recovery analysis',
      orders: 'Order records — enriches transaction analysis',
      cart_events: 'Cart/checkout events — enables cart abandonment analysis',
      discounts: 'Discount/coupon records — enables discount leakage analysis',
    }[type],
  }));
}

module.exports = {
  ingestCSV,
  ingestJSON,
  getDataAvailability,
  getSupportedFormats,
  DATA_SCHEMAS,
};
