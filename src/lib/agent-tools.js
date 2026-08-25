/*
 * agent-tools.js
 * 
 * Structured tool system for the Revenue Intelligence Agent.
 * 
 * Each tool has:
 *   - name: unique identifier
 *   - description: what it does (for LLM tool selection)
 *   - input_schema: expected parameters
 *   - execute(): actual implementation
 * 
 * Tools handle their own error handling, logging, and return structured results.
 * The agent orchestrator calls these — never the LLM directly.
 */

const db = require('./database');
const razorpay = require('./razorpay-adapter');
const scoring = require('./scoring-engine');

// ─── Tool Registry ─────────────────────────────────────────────

const TOOLS = {
  get_revenue_metrics: {
    name: 'get_revenue_metrics',
    description: 'Calculate current revenue metrics including failure rates, revenue at risk, and method breakdown for a merchant.',
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
    description: 'Get recent failed payments for a merchant, optionally filtered by method or time window.',
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
          payments: failures.slice(0, 50), // limit for LLM context
          methods: [...new Set(failures.map(p => p.method))],
        },
      };
    },
  },

  get_customer_history: {
    name: 'get_customer_history',
    description: 'Get a customer profile including payment history, lifetime value, and recovery probability.',
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
    description: 'Scan current payment data and detect revenue recovery opportunities based on anomalies and failure patterns.',
    input_schema: { merchant_id: 'string' },
    execute: async ({ merchant_id }) => {
      // Current window metrics (last 2 hours)
      const currentSince = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const currentPayments = db.runQuery(
        'SELECT * FROM payments WHERE merchant_id = ? AND created_at >= ?',
        [merchant_id, currentSince]
      );
      const currentMetrics = scoring.calculateRevenueMetrics(currentPayments);

      // Baseline metrics (previous 24 hours, excluding last 2 hours)
      const baselineSince = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
      const baselinePayments = db.runQuery(
        'SELECT * FROM payments WHERE merchant_id = ? AND created_at >= ? AND created_at < ?',
        [merchant_id, baselineSince, currentSince]
      );
      const baselineMetrics = scoring.calculateRevenueMetrics(baselinePayments);

      // Detect anomalies
      const anomalies = scoring.detectAnomalies(currentMetrics, baselineMetrics);

      // Get unresolved failed payments
      const failedPayments = currentPayments.filter(p => p.status === 'failed');
      
      // Calculate per-payment recovery probabilities
      const scoredPayments = [];
      for (const payment of failedPayments) {
        const customer = payment.customer_id
          ? db.getRow('customers', { id: payment.customer_id })
          : null;
        const prob = scoring.calculateRecoveryProbability(payment, customer);
        scoredPayments.push({ ...payment, recovery_probability: prob });
      }

      const revenueAtRisk = scoring.calculateRevenueAtRisk(failedPayments);
      const avgProbability = scoredPayments.length > 0
        ? scoredPayments.reduce((s, p) => s + p.recovery_probability, 0) / scoredPayments.length
        : 0;
      const expectedRecovery = scoring.calculateExpectedRecovery(revenueAtRisk, avgProbability);

      return {
        success: true,
        data: {
          anomalies,
          current_metrics: currentMetrics,
          baseline_metrics: baselineMetrics,
          failed_payments_count: failedPayments.length,
          revenue_at_risk: revenueAtRisk,
          average_recovery_probability: avgProbability,
          expected_recovery: expectedRecovery,
          top_affected_payments: scoredPayments.slice(0, 20),
        },
      };
    },
  },

  calculate_recovery_options: {
    name: 'calculate_recovery_options',
    description: 'For a specific opportunity, calculate expected outcomes for each possible intervention.',
    input_schema: { opportunity_id: 'string' },
    execute: async ({ opportunity_id }) => {
      const opportunity = db.getRow('opportunities', { id: opportunity_id });
      if (!opportunity) {
        return { success: false, error: 'Opportunity not found' };
      }

      const actions = ['create_payment_link', 'send_notification', 'retry_payment', 'escalate_to_merchant', 'do_nothing'];
      const options = actions.map(action => {
        const effectiveness = scoring.getInterventionEffectiveness(action);
        const expected = scoring.calculateExpectedRecovery(
          opportunity.revenue_at_risk,
          opportunity.recovery_probability,
          effectiveness
        );
        return {
          action,
          effectiveness,
          expected_recovery: Math.round(expected),
          risk_level: action === 'do_nothing' ? 'none' : effectiveness > 0.7 ? 'low' : 'medium',
        };
      });

      options.sort((a, b) => b.expected_recovery - a.expected_recovery);
      return { success: true, data: { opportunity_id, options } };
    },
  },

  create_payment_link: {
    name: 'create_payment_link',
    description: 'Create a Razorpay payment link for a customer to recover a failed payment.',
    input_schema: {
      opportunity_id: 'string',
      customer_id: 'string',
      amount: 'number',
      description: 'string',
    },
    execute: async ({ opportunity_id, customer_id, amount, description }) => {
      const customer = db.getRow('customers', { id: customer_id });
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const referenceId = `recovery_${opportunity_id}_${customer_id}`;
      
      const result = await razorpay.createPaymentLink({
        amount,
        customer_name: customer.name || 'Customer',
        customer_email: customer.email,
        customer_phone: customer.phone,
        description: description || 'Complete your payment',
        reference_id: referenceId,
      });

      return result;
    },
  },

  record_agent_action: {
    name: 'record_agent_action',
    description: 'Record an agent action in the audit trail.',
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
        event_data: JSON.stringify(event_data),
      });
      return { success: true };
    },
  },
};

// ─── Tool Executor ─────────────────────────────────────────────

/**
 * Execute a tool by name with given parameters.
 * Returns structured result with error handling.
 */
async function executeTool(toolName, params) {
  const tool = TOOLS[toolName];
  if (!tool) {
    return { success: false, error: `Unknown tool: ${toolName}` };
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

/**
 * Get tool descriptions for LLM context.
 */
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
