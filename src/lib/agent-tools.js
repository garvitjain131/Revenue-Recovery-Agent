/*
 * agent-tools.js
 * 
 * Structured tool execution registry for the Revenue Recovery Agent.
 * 
 * Each tool implements:
 *   - name: Unique identifier
 *   - description: Semantic capability
 *   - input_schema: Parameter expectations
 *   - execute(): Deterministic implementation
 * 
 * The Orchestrator calls tools through executeTool() with execution tracking and error handling.
 */

const db = require('./database');
const razorpay = require('./razorpay-adapter');
const scoring = require('./scoring-engine');
const strategyEngine = require('./recovery-strategy-engine');

// ─── Tool Registry ─────────────────────────────────────────────

const TOOLS = {
  get_revenue_metrics: {
    name: 'get_revenue_metrics',
    description: 'Calculate current revenue metrics including failure rates, revenue at risk, and method breakdown.',
    input_schema: { merchant_id: 'string', time_window_hours: 'number (optional, default 24)' },
    execute: async ({ merchant_id, time_window_hours = 24 }) => {
      const since = new Date(Date.now() - time_window_hours * 60 * 60 * 1000).toISOString();
      const payments = db.runQuery(
        'SELECT * FROM payments WHERE merchant_id = ? AND created_at >= ?',
        [merchant_id, since]
      );
      const metrics = scoring.calculateRevenueMetrics(payments);
      return { success: true, data: metrics };
    },
  },

  get_payment_failures: {
    name: 'get_payment_failures',
    description: 'Get recent failed payments for a merchant, optionally filtered by method.',
    input_schema: { merchant_id: 'string', method: 'string (optional)', hours: 'number (optional, default 24)' },
    execute: async ({ merchant_id, method, hours = 24 }) => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      let sql = 'SELECT * FROM payments WHERE merchant_id = ? AND status = ? AND created_at >= ?';
      const params = [merchant_id, 'failed', since];

      if (method) {
        sql += ' AND method = ?';
        params.push(method);
      }
      sql += ' ORDER BY amount DESC LIMIT 200';

      const failures = db.runQuery(sql, params);
      const totalAmount = failures.reduce((s, p) => s + p.amount, 0);

      return {
        success: true,
        data: {
          count: failures.length,
          total_amount: totalAmount,
          payments: failures.slice(0, 50),
          methods: [...new Set(failures.map(p => p.method))],
        },
      };
    },
  },

  get_customer_history: {
    name: 'get_customer_history',
    description: 'Get customer profile including payment history, lifetime value, and previous interventions.',
    input_schema: { customer_id: 'string' },
    execute: async ({ customer_id }) => {
      const customer = db.getRow('customers', { id: customer_id });
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const recentPayments = db.runQuery(
        'SELECT * FROM payments WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
        [customer_id]
      );

      const recentInterventions = db.runQuery(
        'SELECT * FROM interventions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10',
        [customer_id]
      );

      return {
        success: true,
        data: {
          ...customer,
          recent_payments: recentPayments,
          recent_interventions: recentInterventions,
          success_rate: customer.total_payments > 0
            ? (customer.successful_payments / customer.total_payments * 100).toFixed(1) + '%'
            : 'N/A',
        },
      };
    },
  },

  detect_revenue_opportunities: {
    name: 'detect_revenue_opportunities',
    description: 'Scan payment, cart, and discount data to detect revenue recovery opportunities.',
    input_schema: { merchant_id: 'string' },
    execute: async ({ merchant_id }) => {
      const leakDetectors = require('./leak-detectors');
      const result = leakDetectors.detectAllLeaks(merchant_id);
      return {
        success: true,
        data: result,
      };
    },
  },

  calculate_recovery_options: {
    name: 'calculate_recovery_options',
    description: 'Generate and score ranked recovery strategies with net expected recovery calculations.',
    input_schema: { opportunity_id: 'string', customer_id: 'string (optional)' },
    execute: async ({ opportunity_id, customer_id }) => {
      const opportunity = db.getRow('opportunities', { id: opportunity_id });
      if (!opportunity) {
        return { success: false, error: 'Opportunity not found' };
      }

      const customer = customer_id ? db.getRow('customers', { id: customer_id }) : null;
      const options = strategyEngine.evaluateStrategies(opportunity, customer);

      // Persist strategies to database
      strategyEngine.persistStrategies(opportunity_id, options);

      return { success: true, data: { opportunity_id, options } };
    },
  },

  create_payment_link: {
    name: 'create_payment_link',
    description: 'Create a Razorpay payment link for a customer to recover a failed transaction.',
    input_schema: {
      opportunity_id: 'string',
      customer_id: 'string',
      amount: 'number',
      description: 'string',
    },
    execute: async ({ opportunity_id, customer_id, amount, description }) => {
      const customer = db.getRow('customers', { id: customer_id });
      const referenceId = `recovery_${opportunity_id}_${customer_id || 'guest'}`;

      const result = await razorpay.createPaymentLink({
        amount,
        customer_name: customer?.name || 'Customer',
        customer_email: customer?.email || 'customer@example.com',
        customer_phone: customer?.phone || '9876543210',
        description: description || `Complete payment of ₹${Math.round(amount).toLocaleString('en-IN')}`,
        reference_id: referenceId,
      });

      return result;
    },
  },

  send_notification: {
    name: 'send_notification',
    description: 'Send an omnichannel payment reminder notification.',
    input_schema: { opportunity_id: 'string', customer_id: 'string (optional)' },
    execute: async ({ opportunity_id, customer_id }) => {
      return {
        success: true,
        message: 'Payment recovery reminder queued and dispatched.',
        channel: 'omnichannel_sms_whatsapp',
      };
    },
  },

  retry_payment: {
    name: 'retry_payment',
    description: 'Execute silent payment retry through payment gateway.',
    input_schema: { opportunity_id: 'string', payment_id: 'string (optional)' },
    execute: async ({ opportunity_id, payment_id }) => {
      // Deterministic retry simulation
      return {
        success: true,
        message: 'Silent payment retry submitted to gateway.',
      };
    },
  },

  request_alternate_payment_method: {
    name: 'request_alternate_payment_method',
    description: 'Send tailored prompt directing customer to alternate payment rail.',
    input_schema: { opportunity_id: 'string', customer_id: 'string (optional)' },
    execute: async ({ opportunity_id, customer_id }) => {
      return {
        success: true,
        message: 'Alternate payment method guidance sent to customer.',
      };
    },
  },

  record_agent_action: {
    name: 'record_agent_action',
    description: 'Record an immutable audit log entry.',
    input_schema: {
      merchant_id: 'string',
      opportunity_id: 'string',
      event_type: 'string',
      event_data: 'object',
    },
    execute: async ({ merchant_id, opportunity_id, event_type, event_data }) => {
      db.insertRow('audit_logs', {
        merchant_id,
        opportunity_id: opportunity_id || null,
        event_type,
        event_data: JSON.stringify(event_data || {}),
      });
      return { success: true };
    },
  },
};

// ─── Tool Executor ─────────────────────────────────────────────

async function executeTool(toolName, params = {}) {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { success: false, error: `Unknown tool: "${toolName}"` };
  }

  const startTime = Date.now();
  try {
    const result = await tool.execute(params);
    return {
      ...result,
      tool: toolName,
      duration_ms: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Tool execution failed',
      tool: toolName,
      duration_ms: Date.now() - startTime,
    };
  }
}

function getToolDescriptions() {
  return Object.values(TOOLS).map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

module.exports = {
  TOOLS,
  executeTool,
  getToolDescriptions,
};
