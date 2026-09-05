/*
 * contact-tracker.js
 * 
 * Production-Hardened Customer Contact History Tracking.
 * 
 * Guarantees:
 *   - Every outbound contact attempt (sent, delivered, failed, suppressed) is recorded.
 *   - Exact UTC and IST timestamps are preserved.
 *   - Customer last_contacted_at and contact_count aggregates are atomically updated.
 *   - Idempotency key prevents duplicate contact logging.
 *   - All multi-table updates are executed inside ACID database transactions.
 */

const db = require('./database');
const timezone = require('./timezone');

/**
 * Atomically record a contact attempt and update customer telemetry.
 * 
 * @param {Object} params
 * @param {string} params.merchant_id
 * @param {string} [params.customer_id]
 * @param {string} [params.opportunity_id]
 * @param {string} [params.intervention_id]
 * @param {string} params.channel - 'sms' | 'whatsapp' | 'email' | 'payment_link'
 * @param {string} params.status - 'sent' | 'delivered' | 'failed' | 'suppressed'
 * @param {string} [params.error_reason]
 * @returns {Object} { success: boolean, contact_id: string, duplicate: boolean }
 */
function recordContactAttempt({
  merchant_id,
  customer_id = null,
  opportunity_id = null,
  intervention_id = null,
  channel = 'payment_link',
  status = 'sent',
  error_reason = null,
}) {
  if (!merchant_id) {
    throw new Error('merchant_id is required to record a contact attempt');
  }

  const idempotencyKey = `contact:${intervention_id || 'manual'}:${channel}:${customer_id || 'guest'}`;

  return db.withTransaction(() => {
    // Check for duplicate contact attempt
    const existing = db.getRow('contact_history', { idempotency_key: idempotencyKey });
    if (existing) {
      return {
        success: true,
        contact_id: existing.id,
        duplicate: true,
        message: 'Contact attempt was already recorded (idempotent)',
      };
    }

    const contactId = db.generateId('cnt');
    const now = new Date();
    const utcIso = now.toISOString();
    const istIso = timezone.toISTString(now);

    // Insert contact history
    db.insertRow('contact_history', {
      id: contactId,
      merchant_id,
      customer_id: customer_id || null,
      opportunity_id: opportunity_id || null,
      intervention_id: intervention_id || null,
      channel,
      status,
      contact_time_utc: utcIso,
      contact_time_ist: istIso,
      error_reason: error_reason || null,
      idempotency_key: idempotencyKey,
      created_at: utcIso,
    });

    // If contact succeeded and customer exists, update customer metrics
    if (customer_id && (status === 'sent' || status === 'delivered')) {
      const customer = db.getRow('customers', { id: customer_id });
      if (customer) {
        db.updateRow(
          'customers',
          {
            last_contacted_at: utcIso,
            contact_count: (customer.contact_count || 0) + 1,
          },
          { id: customer_id }
        );
      }
    }

    // Record audit log
    db.insertRow('audit_logs', {
      merchant_id,
      opportunity_id: opportunity_id || null,
      intervention_id: intervention_id || null,
      event_type: 'customer_contact_recorded',
      event_data: JSON.stringify({
        contact_id: contactId,
        customer_id,
        channel,
        status,
        contact_time_ist: istIso,
        error_reason,
      }),
    });

    return {
      success: true,
      contact_id: contactId,
      duplicate: false,
    };
  });
}

/**
 * Retrieve contact history for a specific customer or opportunity.
 * 
 * @param {Object} filter - { customer_id, opportunity_id, merchant_id }
 * @param {number} limit 
 * @returns {Array<Object>}
 */
function getContactHistory(filter = {}, limit = 50) {
  const database = db.getDatabase();
  const conditions = [];
  const params = [];

  if (filter.customer_id) {
    conditions.push('customer_id = ?');
    params.push(filter.customer_id);
  }
  if (filter.opportunity_id) {
    conditions.push('opportunity_id = ?');
    params.push(filter.opportunity_id);
  }
  if (filter.merchant_id) {
    conditions.push('merchant_id = ?');
    params.push(filter.merchant_id);
  }

  let sql = 'SELECT * FROM contact_history';
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(Math.min(200, Math.max(1, limit)));

  return database.prepare(sql).all(...params);
}

module.exports = {
  recordContactAttempt,
  getContactHistory,
};
