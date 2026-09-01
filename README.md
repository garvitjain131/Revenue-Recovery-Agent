# Revenue Recovery Agent / Opportunity Engine
### Razorpay AI Buildathon 2026 — Track: AI Revenue Recovery

> **A closed-loop AI Opportunity Engine that identifies revenue at risk, diagnoses root causes, generates and deterministically scores multi-action recovery strategies, enforces a 14-point Policy Guardian, safely executes interventions through Razorpay tools, and proves measured incremental revenue recovered.**

---

## 1. Product Overview & Principle

This is **not** an AI chat assistant or a passive dashboard that merely warns merchants they are losing revenue.

It is a **closed-loop revenue recovery system**:

```
DATA
 └──> DETECT REVENUE AT RISK
       └──> DIAGNOSE ROOT CAUSE (Deterministic Aggregation + LLM)
             └──> GENERATE RECOVERY STRATEGIES
                   └──> DETERMINISTIC EXPECTED VALUE SCORING
                         └──> STRATEGY RANKING & SELECTION
                               └──> 14-POINT POLICY GUARDIAN (Risk-Adaptive Autonomy)
                                     ├── [AUTO EXECUTE] ──> RAZORPAY TOOLS
                                     ├── [DOWNGRADE]   ──> HUMAN REVIEW QUEUE
                                     └── [BLOCK]       ──> SAFETY AUDIT
                                           └──> OUTCOME TRACKING & ATTRIBUTION
                                                 └──> EMPIRICAL BENCHMARK CALIBRATION
```

### Primary Product Metric
**Actual Incremental Revenue Recovered (INR)** — All numbers originate from single-source attribution records without duplicate counting or hardcoded counters.

---

## 2. Architectural Invariant: Deterministic Safety Model

The system enforces strict execution boundaries between AI reasoning and financial money movement:

| System Layer | Responsibilities | Technology |
|---|---|---|
| **Layer 1 — Detection & Scoring** | Anomaly detection, baseline deviation, Revenue at Risk, Net Expected Recovery | Deterministic Code ([`scoring-engine.js`](src/lib/scoring-engine.js)) |
| **Layer 2 — Recovery Strategy Engine** | Multi-strategy generation, cost/friction modeling, strategy ranking | Deterministic Code ([`recovery-strategy-engine.js`](src/lib/recovery-strategy-engine.js)) |
| **Layer 3 — Qualitative Reasoning** | Root cause diagnosis, contextual intervention justification | Google Gemini + Deterministic Fallback ([`llm-reasoning.js`](src/lib/llm-reasoning.js)) |
| **Layer 4 — Policy Guardian** | 14 safety checks, budget limits, idempotency, risk-adaptive autonomy | Deterministic Code ([`policy-engine.js`](src/lib/policy-engine.js)) |
| **Layer 5 — Tool Execution** | Razorpay Payment Links, Notifications, Gateway Retries | Razorpay Live Test API + Mock Mode ([`razorpay-adapter.js`](src/lib/razorpay-adapter.js)) |
| **Layer 6 — Single Attribution** | 1:1 attribution tracking, double-counting protection | Database Ledger ([`database.js`](src/lib/database.js)) |

> **Critical Safety Rule:** The LLM *proposes* and *explains*. The deterministic Policy Guardian *authorizes*. Tools *execute*. The LLM never touches financial calculations, transaction amounts, or Razorpay API credentials directly.

---

## 3. Closed-Loop Agentic Lifecycle (16 Stages)

When the agent runs, it executes a 16-stage pipeline logged to `agent_runs` and `audit_logs`:

1. **OBSERVE**: Continuously scans transaction telemetry, cart events, and promotional coupon data.
2. **DETECT**: Identifies failure rate spikes and payment rail degradations against baseline.
3. **SCORE**: Computes deterministic Revenue At Risk and assigns priority (Critical, High, Medium, Low).
4. **CREATE**: Persists opportunity records in the database.
5. **DIAGNOSE**: Evaluates sanitized signals with AI to identify root causes (e.g. "UPI rail degradation").
6. **GENERATE**: Produces candidate recovery strategies (`create_payment_link`, `send_notification`, `retry_payment`, `request_alternate_payment_method`, `escalate_to_merchant`, `do_nothing`).
7. **SIMULATE**: Calculates gross and net expected recovery:
   $$\text{Expected Recovery} = \text{Revenue at Risk} \times \text{Recovery Probability} \times \text{Effectiveness}$$
   $$\text{Net Expected Recovery} = \text{Expected Recovery} - \text{Intervention Cost} - \text{Expected Risk Cost}$$
8. **RANK**: Ranks options by Net Expected Recovery and preserves evaluated alternatives for explainability.
9. **RECOMMEND**: Synthesizes qualitative merchant-facing rationale.
10. **GUARD**: Validates the proposed action against the 14-Point Policy Guardian.
11. **DECIDE**: Resolves execution state:
    - **Approved**: Auto-execute within autonomous guardrails.
    - **Review Required**: Downgrade to human review queue (high value, medium risk, or review mode).
    - **Blocked**: Prohibited by policy (kill switch, opted-out customer, exhausted attempts).
12. **ACT**: Executes tool via Razorpay adapter with deterministic idempotency keys.
13. **RECORD**: Appends structured entry to the immutable audit trail.
14. **MEASURE**: Detects payment completion webhook or demo payment simulation.
15. **ATTRIBUTE**: Records 1:1 attribution to `recovery_attributions` ensuring zero double-counting.
16. **CALIBRATE**: Updates strategy performance calibration metrics.

---

## 4. 14-Point Policy Guardian & Risk-Adaptive Autonomy

Every executable action must pass all 14 deterministic rules before any financial tool is called:

1. **Global Kill Switch**: Immediate emergency stop halting all autonomous actions.
2. **Merchant Operating Mode**: Enforces Observe, Review, or Autonomous rules.
3. **Action Allowlist**: Restricts execution strictly to merchant-approved tool types.
4. **Multi-Factor Recovery Confidence Floor**: Enforces minimum weighted confidence ($\ge 70\%$).
5. **Maximum Autonomous Transaction Amount**: Caps auto-execution (default $\le ₹25,000$).
6. **High-Value Escalation Threshold**: Automatically forces human review for large exposures ($> ₹1,00,000$).
7. **Maximum Retry Limit**: Enforces cap on recovery attempts per opportunity ($\le 3$).
8. **Customer Contact Frequency & Minimum Gap**: Enforces $\ge 4$-hour delay between messages and respects `do_not_contact` opt-outs.
9. **Contact Hour Restrictions**: Prohibits outbound communication outside permissible hours ($08:00 - 22:00$).
10. **Deterministic Idempotency Key**: `hash(merchant + opp + action + attempt)` prevents duplicate payment links or spam.
11. **Daily Recovery Budget**: Tracks operational budget consumption against merchant limits.
12. **Minimum Expected Recovery Floor**: Ensures expected value justifies intervention cost ($\ge ₹500$).
13. **Action Risk-Level Classification**: Automatically executes low risk, downgrades medium risk to review, and blocks high risk.
14. **Data Completeness Verification**: Verifies prerequisite telemetry before authorizing execution.

---

## 5. Empirical Benchmark & Baseline Comparisons

The repository includes a benchmark evaluation framework comparing 4 architectures across a deterministic 5,000-transaction dataset:

| Metric | Baseline A: Do Nothing | Baseline B: Naive Retry | Baseline C: Rule-Based Engine | System D: Full Recovery Agent |
|---|---|---|---|---|
| **Architecture** | Natural recovery only | Blind retry on all failures | Static threshold rules | Closed-Loop Opportunity Engine |
| **Revenue Recovered** | ₹2.1L (4%) | ₹16.4L (31%) | ₹27.6L (52%) | **₹43.8L (82%)** |
| **Net Recovery** | ₹2.1L | ₹16.2L | ₹27.1L | **₹43.6L** |
| **Unnecessary Outreach** | 0 | 384 (High spam) | 142 | **0 (Suppressed)** |
| **Policy Violations** | 0 | 48 (Limit breaches) | 0 | **0 (100% Compliant)** |
| **Unauthorized Executions** | 0 | 48 | 0 | **0 (Architectural Zero)** |
| **Average Recovery Latency** | 1,440 mins | 240 mins | 90 mins | **22 mins** |

---

## 6. Quick Start & Demo Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration (Optional)
The system operates seamlessly in **Dual Mode** with or without API keys.
```bash
cp .env.example .env.local
```
Fill in Razorpay Test Keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) and Google Gemini API Key if available.

### 3. Seed Deterministic Demo Dataset
```bash
npm run seed
```

### 4. Run Automated Verification Suite
```bash
node scripts/run-tests.js
```
Runs 23 automated unit and integration tests verifying scoring math, strategy ranking, 14 policy checks, idempotency, fallback diagnostics, and attribution integrity.

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## 7. Golden Path Demo Flow for Judges

1. **Step 1: Dashboard Overview**: Review Hero Metrics (Processed Revenue, Revenue at Risk, Recovered Revenue) and the 5-Stage Recovery Funnel.
2. **Step 2: Trigger Autonomous Agent**: Click **"▶ Run Agent"** in the top header.
   - Watch the agent detect the injected UPI rail degradation anomaly.
   - Diagnoses root cause and deterministically scores recovery strategies.
   - Evaluates the 14-Point Policy Guardian and selects the optimal multi-rail payment link.
3. **Step 3: "Why This Action?" Decision Explanation**: Click **"View Decision"** on any opportunity card.
   - View the Evaluated Strategy Matrix ranking Gross Recovery, Costs, and Net Expected Recovery.
   - Review the live 14-point Policy Guardian checklist.
4. **Step 4: Authorize Review & Simulate Recovery**: Click **"Approve"** on a pending high-value intervention, then click **"Simulate Recovery"** to confirm payment.
   - Verify single-source attribution updates `Revenue Recovered` exactly once without double-counting.
5. **Step 5: Benchmark Tab**: Navigate to the **"Benchmark & Evaluation"** tab and click **"Re-Run Benchmark Simulation"** to demonstrate empirical superiority over baselines.

---

## 8. License
MIT
