# Aurexa ✦

> **"Know it's gold before you dig."**

Aurexa is an enterprise-grade, AI-powered startup idea validation and venture intelligence platform. It provides founders and digital entrepreneurs with comprehensive market validation, competitor analysis, unit economics, dynamic pricing simulation, crowdfunding predictability, and investor-ready pitch decks before risking time or capital.

---

## 🌟 Key Modules

### 1. ✦ Startup Idea Validation (Core)
- **8-Step Idea Wizard**: Deep capture of startup problem, target customer, business model, and solution.
- **Validation Score (0–100)**: Rigorous weighted multi-factor scoring (Problem, Customer, Market, Competitive, WTP, Business Model, Financial, Execution).
- **Evidence-Based GO / NO-GO Engine**: Objective recommendations (GO, MODIFY, TEST FURTHER, NO-GO) with clear evidence strength indicators.
- **Automated Market Sizing**: TAM, SAM, and SOM projections with verified sources and transparency labels.
- **Competitor Benchmarking**: Direct and indirect competitor matrix with differentiation gaps.

### 2. ◈ Lean Business Model Canvas Automation (Pro)
- **Automated 9-Block Generation**: Auto-populate Problem, Customer Segments, UVP, Solution, Channels, Revenue, Cost, Key Metrics, and Unfair Advantage.
- **Confidence Scoring (0–100)**: Real-time confidence tracking per block based on validation evidence.
- **Build-Measure-Learn & Pivot Tracking**: Version control (V1–V4) for tracking iterative startup pivots.

### 3. ◉ Smart Pricing Strategy Simulator (Pro)
- **Dynamic Unit Economics**: Real-time recalculation of CAC, LTV, Gross Margin, and Contribution Margin.
- **Sensitivity & Break-Even Modeling**: Multi-scenario demand simulation (Conservative, Base, Optimistic).
- **Price Elasticity & Discount Analysis**: Assess conversion trade-offs and discount impact on profitability.

### 4. ◆ Crowdfunding Campaign Performance Predictor (Max)
- **300-Campaign Benchmark Dataset**: Historical category-specific campaign performance database.
- **Predictive Success Scoring**: First 24-hour and 7-day funding projections.
- **Reward Tier Economics**: Optimization of backer tiers and campaign duration.

### 5. ◇ Pitch Deck & Portfolio Builder (Max)
- **Automated 12-Slide Pitch Deck**: Structured investor slides exportable to presentation formats.
- **3-Minute & 60-Second Pitches**: Founder pitch scripts and investor Q&A preparation.
- **Shareable Validation Reports**: Branded, read-only public links with OpenGraph previews.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) with Aurexa Design Tokens (Faceted Angular Geometry, Gold Accents, Dark Navy)
- **Database & ORM**: PostgreSQL via [Supabase](https://supabase.com/) & [Drizzle ORM](https://orm.drizzle.team/)
- **Visualizations**: [Recharts](https://recharts.org/) for financial and sensitivity models
- **AI Orchestration**: [Vercel AI SDK](https://sdk.vercel.ai/) with multi-provider fallback:
  - Google Gemini (`@ai-sdk/google`)
  - OpenAI (`@ai-sdk/openai`)
  - Anthropic (`@ai-sdk/anthropic`)
- **Live Search Verification**: Tavily & Serper APIs
- **Payments**: Dual integration with **Stripe** and **Razorpay**
- **Testing**: [Vitest](https://vitest.dev/) (unit tests for scoring algorithms and financial formulas)
- **Compliance**: Built-in GDPR, CCPA, and India DPDPA legal documentation

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ installed
- PostgreSQL database (e.g. Supabase)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/shashankv762/Aurexa.git
cd Aurexa
npm install --legacy-peer-deps
```

### 2. Environment Variables

Copy the example environment configuration:

```bash
cp .env.example .env.local
```

Configure your credentials in `.env.local`:

```env
# Supabase & Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://user:password@host:5432/dbname

# AI Providers (At least one required)
OPENROUTER_API_KEY=your_openrouter_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Web Search (Optional for live enrichment)
TAVILY_API_KEY=your_tavily_key
SERPER_API_KEY=your_serper_key

# Payment Gateways (Stripe & Razorpay)
STRIPE_SECRET_KEY=your_stripe_secret
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Application URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Migration & Seeding

Push the Drizzle database schema to your PostgreSQL instance:

```bash
npx drizzle-kit push
```

Seed the 300-campaign benchmark dataset for the Crowdfunding module:

```bash
npx tsx scripts/seed-crowdfunding-data.ts
```

### 4. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

---

## 🧪 Testing & Verification

Run the comprehensive financial and scoring test suites:

```bash
npm run test
```

Create an optimized production build:

```bash
npm run build
```

---

## ⚖️ Legal & Compliance

Aurexa is architected with privacy and regulatory compliance at its core:
- **Privacy Policy**: `/legal/privacy` (GDPR, CCPA, and India DPDPA 2023 compliant)
- **Terms of Service**: `/legal/terms` (Includes educational decision-support AI disclaimers)
- **Cookie Policy**: `/legal/cookies` (Cookieless privacy-first analytics)
- **Refund Policy**: `/legal/refund` (Fair-use guarantee)

---

## 📄 License

This project is licensed under the Apache License 2.0. See the [LICENSE](./LICENSE) file for details.
