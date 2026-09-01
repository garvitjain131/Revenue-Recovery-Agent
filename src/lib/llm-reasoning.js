/*
 * llm-reasoning.js
 * 
 * LLM Reasoning & Root Cause Diagnostic Layer using Google Gemini.
 * 
 * The LLM is responsible ONLY for:
 *   - Qualitative root cause diagnosis from sanitized evidence
 *   - Comparing contextual nuances across intervention options
 *   - Explaining decisions in clear natural language for merchant stakeholders
 * 
 * The LLM NEVER:
 *   - Directly executes tools or calls Razorpay APIs
 *   - Authoritatively calculates financial amounts or probabilities (scoring-engine does this)
 *   - Authorizes financial transactions or overrides policy guardrails (policy-engine does this)
 *   - Modifies limits or creates synthetic financial metrics
 * 
 * All LLM responses undergo strict JSON schema validation. Malformed outputs fail-closed
 * and smoothly activate deterministic rule-based fallback diagnostics.
 */

const RECOMMENDATION_SCHEMA = {
  required: ['root_cause', 'confidence', 'recommended_action', 'reason', 'risk_level'],
  actions: [
    'create_payment_link',
    'send_notification',
    'retry_payment',
    'request_alternate_payment_method',
    'escalate_to_merchant',
    'flag_discount_review',
    'do_nothing',
  ],
  risk_levels: ['low', 'medium', 'high'],
};

// ─── Gemini Client ───────────────────────────────────────────────

let geminiModel = null;

async function getGeminiModel() {
  if (geminiModel) return geminiModel;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key' || apiKey.startsWith('your_') || apiKey.includes('PLACEHOLDER')) {
    return null;
  }

  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    return geminiModel;
  } catch (err) {
    console.warn('[LLM] Gemini client unavailable, utilizing rule-based fallback diagnostics:', err.message);
    return null;
  }
}

// ─── Root Cause Analysis ─────────────────────────────────────────

/**
 * Ask the LLM to diagnose root cause from sanitized aggregate signals.
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
      console.warn('[LLM] Gemini diagnostic call failed, falling back to deterministic analyzer:', err.message);
    }
  }

  // Deterministic rule-based fallback analyzer
  return fallbackRootCauseAnalysis(opportunityData);
}

function buildRootCausePrompt(data) {
  const currentFailRate = data.current_metrics?.failure_rate != null ? (data.current_metrics.failure_rate * 100).toFixed(1) : 'N/A';
  const baseFailRate = data.baseline_metrics?.failure_rate != null ? (data.baseline_metrics.failure_rate * 100).toFixed(1) : 'N/A';
  const riskAmount = Math.round(data.revenue_at_risk || 0).toLocaleString('en-IN');

  return `You are a Principal Payments Analyst evaluating payment failure telemetry for an Indian merchant processing on Razorpay.

CONTEXT & SANITIZED SIGNALS:
- Failed Payment Volume: ${data.failed_payments_count || 0} transactions
- Total Revenue At Risk: ₹${riskAmount}
- Current Window Failure Rate: ${currentFailRate}% (Baseline: ${baseFailRate}%)
- Payment Method Distribution: ${JSON.stringify(data.current_metrics?.method_rates || {})}
- Detected Anomalies: ${JSON.stringify(data.anomalies || [])}
- Failure Reason Clustering: ${JSON.stringify(data.failure_reason_breakdown || {})}

INSTRUCTIONS:
1. Diagnose the technical root cause based strictly on the telemetry provided.
2. DO NOT fabricate customer data, financial amounts, or unverified outage facts.
3. Recommend the best recovery intervention from the supported list:
   ['create_payment_link', 'send_notification', 'retry_payment', 'request_alternate_payment_method', 'escalate_to_merchant', 'do_nothing']
4. Output MUST be ONLY valid JSON matching this schema:
{
  "root_cause": "Concise headline description of the root cause",
  "root_cause_detail": "Technical diagnosis referencing observed data patterns",
  "confidence": 0.85,
  "recommended_action": "create_payment_link",
  "reason": "Clear economic and technical justification for this action",
  "risk_level": "low",
  "explanation_for_merchant": "Plain-English business summary suitable for a merchant dashboard"
}`;
}

// ─── Intervention Comparison ─────────────────────────────────────

/**
 * Ask LLM to review evaluated strategy options and produce contextual narrative.
 */
async function compareInterventions(opportunity, recoveryOptions, customerContext) {
  const model = await getGeminiModel();

  const prompt = `You are a Revenue Recovery Strategy Consultant evaluating scored recovery options.

OPPORTUNITY:
- Type: ${opportunity.type || 'payment_failure'}
- Revenue at Risk: ₹${Math.round(opportunity.revenue_at_risk || 0).toLocaleString('en-IN')}
- Root Cause Diagnosis: ${opportunity.root_cause || 'Elevated transaction failure rate'}

EVALUATED & DETERMINISTICALLY SCORED STRATEGIES:
${JSON.stringify(recoveryOptions, null, 2)}

CUSTOMER SIGNALS:
${customerContext ? JSON.stringify({
  lifetime_value: customerContext.lifetime_value,
  success_rate: customerContext.success_rate,
  do_not_contact: customerContext.do_not_contact,
  previous_purchases: customerContext.successful_payments,
}, null, 2) : 'No specific customer profile attached'}

TASK:
Review the top-ranked strategy. Provide a concise explanation of why this option is superior to the alternatives.

Output ONLY valid JSON:
{
  "recommended_action": "${recoveryOptions[0]?.action || 'create_payment_link'}",
  "confidence": 0.85,
  "reason": "Economic justification based on net expected recovery",
  "risk_level": "low",
  "why_not_others": "Brief explanation of why lower-ranked alternatives were not selected"
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
      console.warn('[LLM] Gemini comparison failed, applying deterministic strategy selection:', err.message);
    }
  }

  // Fallback to top-ranked strategy from recovery-strategy-engine
  const best = recoveryOptions[0] || {};
  return {
    recommended_action: best.action || 'create_payment_link',
    confidence: best.evidenceStrength || 0.80,
    reason: `${best.name || best.action} provides highest Net Expected Recovery of ₹${Math.round(best.netExpectedRecovery || best.expectedRecovery || 0).toLocaleString('en-IN')}.`,
    risk_level: 'low',
    why_not_others: 'Alternative options produced lower net expected recovery after factoring in carrier costs, failure risks, and customer friction.',
  };
}

// ─── Response Parsing & Schema Validation ────────────────────────

function parseStructuredResponse(text) {
  const parsed = parseJsonFromText(text);
  if (!parsed) return null;

  for (const field of RECOMMENDATION_SCHEMA.required) {
    if (parsed[field] === undefined) {
      console.warn(`[LLM] Schema validation error: missing required field "${field}"`);
      return null;
    }
  }

  if (!RECOMMENDATION_SCHEMA.actions.includes(parsed.recommended_action)) {
    console.warn(`[LLM] Schema validation error: unauthorized action "${parsed.recommended_action}"`);
    return null;
  }

  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    parsed.confidence = 0.70;
  }

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
    return JSON.parse(text.trim());
  } catch {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {}
    }
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {}
    }
    return null;
  }
}

// ─── Deterministic Rule-Based Fallback ────────────────────────────

function fallbackRootCauseAnalysis(data) {
  const anomalies = data.anomalies || [];
  let worstMethod = null;
  let worstIncrease = 0;

  for (const a of anomalies) {
    if (a.type === 'method_degradation' && a.increase > worstIncrease) {
      worstMethod = a.method;
      worstIncrease = a.increase;
    }
  }

  if (worstMethod) {
    const methodUpper = worstMethod.toUpperCase();
    return {
      root_cause: `${methodUpper} payment rail degradation`,
      root_cause_detail: `${methodUpper} failure rate spiked by ${(worstIncrease * 100).toFixed(1)}% above baseline. Issuer or network timeout detected.`,
      confidence: Math.min(0.92, 0.72 + worstIncrease),
      recommended_action: 'create_payment_link',
      reason: `Sending a payment link provides alternative checkout methods (Card, Netbanking), bypassing the degraded ${methodUpper} rail.`,
      risk_level: 'low',
      explanation_for_merchant: `We detected high failure rates on ${methodUpper} transactions. A payment link with alternative payment options will recover these lost sales.`,
      source: 'deterministic_fallback',
    };
  }

  if (data.revenue_at_risk > 100000) {
    return {
      root_cause: 'High-value transaction failure concentration',
      root_cause_detail: `Significant revenue exposure of ₹${Math.round(data.revenue_at_risk).toLocaleString('en-IN')} across high-ticket orders.`,
      confidence: 0.85,
      recommended_action: 'create_payment_link',
      reason: 'High-ticket buyers require frictionless direct links to complete authorization.',
      risk_level: 'low',
      explanation_for_merchant: 'A payment link was prepared for your high-value checkout attempts.',
      source: 'deterministic_fallback',
    };
  }

  return {
    root_cause: 'Isolated transaction payment failures',
    root_cause_detail: `${data.failed_payments_count || 0} failed payments identified requiring standard recovery intervention.`,
    confidence: 0.78,
    recommended_action: 'create_payment_link',
    reason: 'Multi-rail payment link provides the highest recovery probability with zero messaging surcharge.',
    risk_level: 'low',
    explanation_for_merchant: 'Standard automated recovery intervention recommended for failed checkout attempts.',
    source: 'deterministic_fallback',
  };
}

module.exports = {
  analyzeRootCause,
  compareInterventions,
  RECOMMENDATION_SCHEMA,
};
