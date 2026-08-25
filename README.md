# Revenue Recovery Agent — Razorpay AI Buildathon 2026

An autonomous **Revenue Intelligence Agent** that continuously finds where a merchant is losing money, explains why, predicts the best recovery action, executes it safely through Razorpay tools, and proves how much incremental revenue it recovered.

## Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in your Razorpay test keys and Gemini API key
npm run seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Architecture

```
OBSERVE → DIAGNOSE → ESTIMATE → PRIORITIZE → DECIDE → GUARD → ACT → MEASURE → LEARN
```

The agent uses a three-layer safety architecture:
- **Layer 1 — Detection**: Statistical rules and anomaly detection (deterministic)
- **Layer 2 — Reasoning**: LLM interprets signals and recommends actions (Gemini)
- **Layer 3 — Execution**: Deterministic tools call Razorpay APIs (never the LLM directly)

## Tech Stack

- **Next.js 14** — Frontend + API routes
- **better-sqlite3** — Embedded database (zero config)
- **Google Gemini** — AI reasoning layer
- **Razorpay Test Mode** — Payment APIs, Payment Links, Webhooks

## License

MIT
