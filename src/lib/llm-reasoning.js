/*
 * llm-reasoning.js
 * 
 * LLM reasoning layer using Google Gemini.
 * 
 * The LLM is responsible ONLY for:
 *   - Interpreting revenue signals
 *   - Diagnosing root causes
 *   - Comparing intervention strategies
 *   - Generating structured recommendations
 *   - Explaining decisions in natural language
 * 
 * The LLM NEVER:
 *   - Directly calls Razorpay APIs
 *   - Performs financial calculations (scoring-engine.js does this)
 *   - Enforces guardrails (policy-engine.js does this)
 *   - Executes tools (agent-orchestrator.js does this)
 * 
 * All LLM outputs are validated against a schema before use.
 */

const RECOMMENDATION_SCHEMA = {
  required: ['opportunity_id', 'root_cause', 'confidence', 'recommended_action', 'reason', 'risk_level'],
  actions: ['create_payment_link', 'send_notification', 'retry_payment', 'escalate_to_merchant', 'do_nothing'],
  risk_levels: ['low', 'medium', 'high'],
};

// ─── Gemini Client ─────────────────────────────────────────────

let geminiModel = null;

async function getGeminiModel() {
  if (geminiModel) return geminiModel;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key') {
    return null; // will use fallback reasoning
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    return geminiModel;
  } catch (err) {
    console.error('[LLM] Failed to initialize Gemini:', err.message);
    return null;
  }
}

// ─── Root Cause Analysis ───────────────────────────────────────

/**
 * Ask the LLM to analyze revenue data and identify the root cause.
 * Returns structured recommendation.
 */
async function analyzeRootCause(opportunityData) {
  const model = await getGeminiModel();

  const prompt = buildRootCausePrompt(opportunityData);

  if (model) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseStructuredResponse(text, opportunityData);
      if (parsed) return parsed;
    } catch (err) {
      console.error('[LLM] Gemini root cause analysis failed:', err.message);
    }
  }

  // Fallback: rule-based reasoning when LLM unavailable
  return fallbackRootCauseAnalysis(opportunityData);
}

function buildRootCausePrompt(data) {
  return `You are a Revenue Intelligence Agent analyzing payment failures for a merchant.

CURRENT SITUATION:
- Failed payments: ${data.failed_payments_count}
- Revenue at risk: ₹${Math.round(data.revenue_at_risk).toLocaleString()}
- Current failure rate: ${(data.current_metrics?.failure_rate * 100 || 0).toFixed(1)}%
- Baseline failure rate: ${(data.baseline_metrics?.failure_rate * 100 || 0).toFixed(1)}%
- Payment method failure rates: ${JSON.stringify(data.current_metrics?.method_rates || {})}
- Baseline method rates: ${JSON.stringify(data.baseline_metrics?.method_rates || {})}
- Anomalies detected: ${JSON.stringify(data.anomalies || [])}
- Top affected payments: ${JSON.stringify((data.top_affected_payments || []).slice(0, 10).map(p => ({
    amount: p.amount,
    method: p.method,
    failure_reason: p.failure_reason,
    recovery_probability: p.recovery_probability,
  })))}

AVAILABLE RECOVERY ACTIONS:
- create_payment_link: Send a payment link to the customer
- send_notification: Send a payment reminder notification
- retry_payment: Retry the payment attempt
- escalate_to_merchant: Send to merchant for manual review
- do_nothing: No action needed

Respond with ONLY a valid JSON object (no markdown, no code blocks):
{
  "root_cause": "Brief description of the primary root cause",
  "root_cause_detail": "Detailed explanation of what's happening and why",
  "confidence": 0.85,
  "recommended_action": "create_payment_link",
  "reason": "Why this action is the best choice",
  "risk_level": "low",
  "alternative_actions": ["retry_payment", "send_notification"],
  "explanation_for_merchant": "A clear, non-technical explanation for the merchant"
}`;
}

// ─── Intervention Comparison ───────────────────────────────────

/**
 * Ask the LLM to compare recovery options and recommend the best one.
 */
async function compareInterventions(opportunity, recoveryOptions, customerContext) {
  const model = await getGeminiModel();

  const prompt = `You are a Revenue Intelligence Agent deciding the best recovery action.

OPPORTUNITY:
- Type: ${opportunity.type}
- Revenue at risk: ₹${Math.round(opportunity.revenue_at_risk).toLocaleString()}
- Recovery probability: ${(opportunity.recovery_probability * 100).toFixed(0)}%
- Root cause: ${opportunity.root_cause || 'Unknown'}
- Previous interventions: ${opportunity.intervention_count}

RECOVERY OPTIONS (with deterministic scores):
${JSON.stringify(recoveryOptions, null, 2)}

CUSTOMER CONTEXT:
${customerContext ? JSON.stringify({
  lifetime_value: customerContext.lifetime_value,
  success_rate: customerContext.successful_payments / Math.max(1, customerContext.total_payments),
  total_orders: customerContext.total_payments,
  preferred_method: customerContext.preferred_method,
  do_not_contact: customerContext.do_not_contact,
}, null, 2) : 'No customer data available'}

Respond with ONLY valid JSON:
{
  "recommended_action": "create_payment_link",
  "confidence": 0.85,
  "reason": "Why this is the best choice",
  "risk_level": "low",
  "why_not_others": "Brief explanation of why alternatives were not chosen"
}`;

  if (model) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsed = parseJsonFromText(text);
      if (parsed && RECOMMENDATION_SCHEMA.actions.includes(parsed.recommended_action)) {
        return parsed;
      }
    } catch (err) {
      console.error('[LLM] Gemini comparison failed:', err.message);
    }
  }

  // Fallback: pick highest expected recovery
  const best = recoveryOptions[0]; // already sorted by expected_recovery
  return {
    recommended_action: best?.action || 'do_nothing',
    confidence: 0.75,
    reason: `${best?.action} has the highest expected recovery of ₹${best?.expected_recovery?.toLocaleString()}`,
    risk_level: best?.risk_level || 'low',
    why_not_others: 'Selected based on highest expected recovery value.',
  };
}

// ─── Natural Language Query ────────────────────────────────────

/**
 * Answer a merchant's natural-language revenue question.
 */
async function answerMerchantQuery(query, revenueContext) {
  const model = await getGeminiModel();

  const prompt = `You are a Revenue Intelligence Agent answering a merchant's question.

MERCHANT QUESTION: "${query}"

CURRENT REVENUE DATA:
${JSON.stringify(revenueContext, null, 2)}

Provide a clear, concise answer with:
1. Direct answer to the question
2. Key numbers and trends
3. If relevant, recommended action

Respond in plain text (not JSON). Be specific with numbers. Use ₹ for amounts.`;

  if (model) {
    try {
      const result = await model.generateContent(prompt);
      return { success: true, answer: result.response.text() };
    } catch (err) {
      return { success: false, answer: `Unable to process query: ${err.message}` };
    }
  }

  return {
    success: true,
    answer: `Revenue at risk: ₹${Math.round(revenueContext.revenue_at_risk || 0).toLocaleString()}. Failed payments: ${revenueContext.failed_payments || 0}. Current failure rate: ${((revenueContext.failure_rate || 0) * 100).toFixed(1)}%.`,
  };
}

// ─── Response Parsing & Validation ─────────────────────────────

function parseStructuredResponse(text, originalData) {
  const parsed = parseJsonFromText(text);
  if (!parsed) return null;

  // Validate required fields
  for (const field of RECOMMENDATION_SCHEMA.required) {
    if (field === 'opportunity_id') continue; // we'll set this ourselves
    if (parsed[field] === undefined) {
      console.warn(`[LLM] Missing required field: ${field}`);
      return null;
    }
  }

  // Validate action
  if (!RECOMMENDATION_SCHEMA.actions.includes(parsed.recommended_action)) {
    console.warn(`[LLM] Invalid action: ${parsed.recommended_action}`);
    return null;
  }

  // Validate confidence range
  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    parsed.confidence = 0.5;
  }

  // Validate risk level
  if (!RECOMMENDATION_SCHEMA.risk_levels.includes(parsed.risk_level)) {
    parsed.risk_level = 'medium';
  }

  return {
    ...parsed,
    source: 'gemini',
  };
}

function parseJsonFromText(text) {
  try {
    // Try direct parse first
    return JSON.parse(text.trim());
  } catch {
    // Try extracting JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch { /* continue */ }
    }

    // Try finding JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch { /* continue */ }
    }

    return null;
  }
}

// ─── Fallback Reasoning ────────────────────────────────────────

function fallbackRootCauseAnalysis(data) {
  const anomalies = data.anomalies || [];
  const methodRates = data.current_metrics?.method_rates || {};

  // Find the worst degraded method
  let worstMethod = null;
  let worstIncrease = 0;
  for (const a of anomalies) {
    if (a.type === 'method_degradation' && a.increase > worstIncrease) {
      worstMethod = a.method;
      worstIncrease = a.increase;
    }
  }

  if (worstMethod) {
    return {
      root_cause: `${worstMethod.toUpperCase()} payment method degradation`,
      root_cause_detail: `${worstMethod.toUpperCase()} failure rate increased by ${(worstIncrease * 100).toFixed(1)}% compared to baseline. This is the primary driver of revenue loss.`,
      confidence: Math.min(0.90, 0.70 + worstIncrease),
      recommended_action: 'create_payment_link',
      reason: 'Payment links provide an alternative payment flow, bypassing the degraded payment method.',
      risk_level: 'low',
      alternative_actions: ['retry_payment', 'send_notification'],
      explanation_for_merchant: `Your ${worstMethod.toUpperCase()} payments are experiencing higher-than-normal failures. We recommend sending payment links to affected customers so they can pay through an alternative method.`,
      source: 'fallback',
    };
  }

  if (data.failed_payments_count > 0) {
    return {
      root_cause: 'Elevated payment failure rate',
      root_cause_detail: `${data.failed_payments_count} payments failed with ₹${Math.round(data.revenue_at_risk).toLocaleString()} at risk.`,
      confidence: 0.65,
      recommended_action: data.revenue_at_risk > 50000 ? 'create_payment_link' : 'send_notification',
      reason: 'Recovery action recommended based on failure volume and revenue exposure.',
      risk_level: 'low',
      alternative_actions: ['retry_payment', 'do_nothing'],
      explanation_for_merchant: `We detected ${data.failed_payments_count} failed payments totaling ₹${Math.round(data.revenue_at_risk).toLocaleString()}. We recommend recovery action.`,
      source: 'fallback',
    };
  }

  return {
    root_cause: 'No significant issues detected',
    root_cause_detail: 'Payment performance is within normal parameters.',
    confidence: 0.90,
    recommended_action: 'do_nothing',
    reason: 'No anomalies or significant failures detected.',
    risk_level: 'low',
    alternative_actions: [],
    explanation_for_merchant: 'Everything looks good — no revenue recovery needed right now.',
    source: 'fallback',
  };
}

module.exports = {
  analyzeRootCause,
  compareInterventions,
  answerMerchantQuery,
  RECOMMENDATION_SCHEMA,
};
