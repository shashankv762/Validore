# Validore

[![Next.js](https://img.shields.io/badge/Next.js-16.3.7-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.8-blue?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Supabase-3ecf8e?style=flat-square&logo=supabase)](https://supabase.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45.3-c5f74f?style=flat-square)](https://orm.drizzle.team/)
[![Docker](https://img.shields.io/badge/Docker-Multi--Stage-2496ed?style=flat-square&logo=docker)](https://www.docker.com/)
[![Jenkins](https://img.shields.io/badge/Jenkins-Declarative_CI%2FCD-d33833?style=flat-square&logo=jenkins)](https://www.jenkins.io/)
[![Vitest](https://img.shields.io/badge/Vitest-180%2B_Tests-6e9f18?style=flat-square&logo=vitest)](https://vitest.dev/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square)](./LICENSE)

> **"Know it's gold before you dig."**  
> An enterprise-grade venture intelligence and startup idea validation engine built to analyze market feasibility, unit economics, crowdfunding predictability, and investor readiness before risking capital.

---

## Table of Contents

1. [System Overview & Architecture](#1-system-overview--architecture)
2. [Core Product Modules](#2-core-product-modules)
3. [Technology Stack](#3-technology-stack)
4. [Database & Schema Architecture](#4-database--schema-architecture)
5. [Jenkins CI/CD Pipeline & Automated Triggers](#5-jenkins-cicd-pipeline--automated-triggers)
6. [Local Deployment & Physical File Locations](#6-local-deployment--physical-file-locations)
7. [Teacher Presentation & Live Demo Guide](#7-teacher-presentation--live-demo-guide)
8. [Local Installation & Development Setup](#8-local-installation--development-setup)
9. [Automated Quality Gates & Test Execution](#9-automated-quality-gates--test-execution)
10. [Repository Directory Structure](#10-repository-directory-structure)
11. [Security, Privacy & Legal Compliance](#11-security-privacy--legal-compliance)
12. [Author & License](#12-author--license)

---

## 1. System Overview & Architecture

Over 90% of early-stage startups fail due to building products without verified market demand or sustainable unit economics. Validore replaces guesswork with empirical venture intelligence:

* **Multivariate Validation**: Evaluates customer persona, problem urgency, market size, competition, and willingness-to-pay (WTP).
* **Automated Canvas Synthesis**: Produces 9-block Lean Canvases with live confidence scoring.
* **Unit Economics Modeling**: Simulates CAC, LTV, Gross Margins, and dynamic scenario elasticity.
* **Empirical Crowdfunding Predictions**: Compares campaigns against a benchmark dataset of 300+ historical projects.
* **Multi-Format Investor Deliverables**: Generates board-ready slide decks (PPTX), white-label audit reports (PDF), financial sheets (CSV), and portfolio landing sites (ZIP).

### High-Level System Topology

```
+-----------------------------------------------------------------------------------------+
|                                    CLIENT BROWSER                                       |
|    - Next.js 16 App Router UI   - Faceted Dark Navy / Gold Token System                 |
|    - Dynamic Recharts Visuals   - Interactive 8-Step Validation Wizard                  |
+--------------------------------------------+--------------------------------------------+
                                             | HTTP / WebSocket
                                             v
+-----------------------------------------------------------------------------------------+
|                              NGINX REVERSE PROXY (Port 80 / 443)                        |
|    - TLS Termination           - Connection Pooling / Upgrade Headers                   |
|    - Static Asset Caching      - /api/health Liveness Probe Pass-Through                |
+--------------------------------------------+--------------------------------------------+
                                             | proxy_pass http://app:3000
                                             v
+-----------------------------------------------------------------------------------------+
|                              VALIDORE APPLICATION (Node 20 Standalone)                  |
|  +--------------------+  +--------------------+  +-----------------------------------+  |
|  | /api/validate      |  | /api/lean-canvas   |  | /api/pricing                      |  |
|  | /api/crowdfunding  |  | /api/pitch-deck    |  | /api/credits/purchase             |  |
|  +--------------------+  +--------------------+  +-----------------------------------+  |
|  +-----------------------------------------------------------------------------------+  |
|  | Exporters: CSV (Native) | PDF (@react-pdf) | PPTX (pptxgenjs) | ZIP (jszip)       |  |
|  +-----------------------------------------------------------------------------------+  |
+---------------------+-------------------+---------------------+-------------------------+
                      |                   |                     |
         Drizzle ORM  |     Vercel AI SDK |                     | Webhook Callbacks
                      v                   v                     v
+-----------------------------+ +--------------------+ +----------------------------------+
|     POSTGRESQL / SUPABASE   | |   AI ORCHESTRATION | |       PAYMENT GATEWAYS           |
| - 12 Relational Tables      | | - Gemini Flash/Pro | | - Stripe Checkout & Webhooks     |
| - 4 Domain Enums            | | - OpenAI GPT-4o    | | - Razorpay Orders & Verification |
| - Supabase Auth Integration | | - Anthropic Claude | | - Founding Member Quota Counter  |
+-----------------------------+ +--------------------+ +----------------------------------+
```

---

## 2. Core Product Modules

### 1. ✦ 8-Step Startup Idea Validation & Scoring Engine
* **Step-by-Step Discovery**: Captures target customer segmentation, problem urgency, proposed solution, revenue model, and acquisition channels.
* **Weighted Feasibility Score (0–100)**: Calculates an empirical index across 8 weighted vectors:
  $$\text{Score} = \sum (\text{Problem} \cdot 0.15 + \text{Customer} \cdot 0.15 + \text{Market} \cdot 0.15 + \text{Competitive} \cdot 0.15 + \text{WTP} \cdot 0.15 + \text{UnitEconomics} \cdot 0.10 + \text{Execution} \cdot 0.10 + \text{Timing} \cdot 0.05)$$
* **Objective GO / NO-GO Recommendation**: Classifies output into `GO`, `MODIFY`, `TEST FURTHER`, or `NO-GO` with evidence-strength indicators.
* **TAM / SAM / SOM Market Sizing**: Computes Total Addressable, Serviceable Available, and Serviceable Obtainable markets with verified citations.

### 2. ◈ Lean Business Model Canvas Synthesizer
* **Automated 9-Block Generation**: Synthesizes Problem, Customer Segments, Unique Value Proposition (UVP), Solution, Channels, Revenue Streams, Cost Structure, Key Metrics, and Unfair Advantage.
* **Block Confidence Index (0–100)**: Assesses statistical confidence per block based on validation inputs.
* **Versioned Pivot Tracking**: Retains iteration history (V1 through V4) to map Build-Measure-Learn cycles over time.

### 3. ◉ Smart Pricing & Dynamic Unit Economics Simulator
* **Unit Economics Dashboard**: Live recalculation of Customer Acquisition Cost (CAC), Lifetime Value (LTV), Gross Margin, Contribution Margin, and Payback Velocity.
* **Multi-Scenario Sensitivity Modeling**: Dynamic financial curves across Conservative, Base, and Optimistic cases.
* **Price Elasticity Analysis**: Models conversion velocity trade-offs against discounting to compute optimal gross revenue points.

### 4. ◆ Crowdfunding Predictor (300+ Campaign Benchmark)
* **Empirical Historical Dataset**: Leverages a 300+ campaign database across tech, design, hardware, and creative categories (`synthetic_campaigns`).
* **Velocity Forecasts**: Predicts funding trajectories for the critical first 24-hour and 7-day windows.
* **Tier Optimization**: Recommends pledge pricing tiers, backer rewards, and optimal campaign runtimes (30 vs. 45 vs. 60 days).

### 5. ◇ Pitch Deck Builder & Multi-Format Exporters
* **12-Slide Structured Pitch Deck**: Generates Problem, Solution, Market Size, Product, Business Model, Traction, Competition, Unit Economics, Team, Financial Projections, The Ask, and Contact slides.
* **Native PPTX Generation**: Direct `.pptx` file creation via `pptxgenjs` (supports customized deck IDs).
* **White-Label PDF Reports**: Formatted audit reports rendered via `@react-pdf/renderer` without branding headers.
* **Full Portfolio ZIP**: Bundles self-contained responsive HTML/CSS microsites for immediate sharing (`jszip`).
* **CSV Financial Exports**: Raw data streams for external spreadsheet modeling.

### 6. 💳 Dual Monetization & Quota Engine
* **Hybrid Billing Architecture**: Dual checkout support for international founders (**Stripe**) and domestic founders (**Razorpay**).
* **Tier-Based Feature Gating**: Free, Premium, and Max Premium levels with module-level credit fallback.
* **Founding Member Cap**: Automated database lock preventing enrollment past the first 100 founding members.

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose in Validore |
|---|---|---|---|
| **Frontend Framework** | Next.js (App Router, Turbopack) | `16.3.7` | Server-side rendering, API routes, streaming UI |
| **UI Runtime** | React | `19.2.8` | Core component lifecycle & hooks |
| **Type System** | TypeScript | `5.x` | Strict end-to-end type safety |
| **Styling & Tokens** | Tailwind CSS | `4.x` | Dark Navy (`#060B18`) and Gold (`#F59E0B`) token styling |
| **Database** | PostgreSQL (Supabase) | Latest | Relational persistence with row-level security |
| **ORM & Migrations** | Drizzle ORM / Drizzle Kit | `0.45.3` / `0.31.11` | TypeScript-first schema modeling and SQL queries |
| **Authentication** | Supabase Auth SSR | `0.12.7` | JWT session handling and user auto-provisioning |
| **AI Orchestration** | Vercel AI SDK | `7.0.122` | Unified multi-provider AI model orchestration |
| **AI Providers** | Google Gemini / OpenAI / Anthropic | Latest | Multi-model fallback for validation synthesis |
| **Visualizations** | Recharts | `3.10.1` | Financial sensitivity curves and break-even charts |
| **Document Engines** | `@react-pdf/renderer`, `pptxgenjs`, `jszip` | Latest | PDF rendering, PowerPoint slides, ZIP bundle exports |
| **Payment Gateways** | Stripe (`22.6.2`) / Razorpay (`2.9.8`) | Latest | Subscription billing and credit microtransactions |
| **Testing Framework** | Vitest | `5.0.2` | Unit, integration, and scoring algorithm tests |
| **Containerization** | Docker (Alpine Linux) | `20-alpine` | Non-root multi-stage production container build |
| **Reverse Proxy** | Nginx | `1.27-alpine` | Edge proxy, header forwarding, and SSL readiness |
| **CI/CD Automation** | Jenkins Declarative Pipeline | LTS JDK 21 | Automated testing, linting, scanning, and staging |

---

## 4. Database & Schema Architecture

Validore uses PostgreSQL managed by Drizzle ORM. The relational model contains **12 tables** and **4 domain enums**:

```
users ──────────────────────┬──< ideas ───┬──< validation_reports
                            │             ├──< lean_canvases
tier_config                 │             ├──< pricing_models
                            │             └──< pitch_decks
founding_member_counter     │
                            ├──< credit_purchases
synthetic_campaigns         ├──< crowdfunding_predictions
                            └──< shared_reports
```

### Table Schema Summary

* `users`: Profiles, tiers (`free`, `premium`, `max_premium`), subscription states, Stripe/Razorpay customer IDs, credit balances.
* `tier_config`: Quotas and feature flags (`canExportCsv`, `canWhitelabelPdf`, `canPortfolioExport`, `canExportPptx`).
* `founding_member_counter`: Single-row singleton (`id=1`, `count=0..100`, `maxCap=100`) with row-locking protection.
* `ideas`: Startup submissions containing raw problem statement, customer profile, industry, and wizard inputs.
* `validation_reports`: Computed 0–100 scores, evidence strength ratings, GO/NO-GO verdicts, TAM/SAM/SOM projections, competitor matrices.
* `lean_canvases`: 9 canvas blocks, per-block confidence scores, and version tracking (`v1`–`v4`).
* `pricing_models`: Unit economics (CAC, LTV, Gross Margin, Payback), scenario sensitivities (Conservative, Base, Optimistic).
* `crowdfunding_predictions`: Predicted 24-hr and 7-day velocity scores, recommended reward tiers, campaign length.
* `synthetic_campaigns`: Benchmark repository of 300+ historical crowdfunding campaigns with category-specific metrics.
* `pitch_decks`: 12-slide presentation structure, founder scripts, and investor Q&A prep cards.
* `credit_purchases`: Audit log of credit purchases with provider transaction IDs and quantities.
* `shared_reports`: Unique UUID share tokens with view counters and expiration controls for read-only access.

---

## 5. Jenkins CI/CD Pipeline & Automated Triggers

Validore includes an industry-grade, enterprise Jenkins declarative pipeline defined in [Jenkinsfile](file:///c:/Users/2025/IIT%20DELHI/entrepreneur/Validore/Jenkinsfile).

### Automated Build Triggers

The pipeline implements **three automated triggers** running simultaneously:

```groovy
triggers {
    // ── Trigger 1: GitHub Push Webhook (Instant) ────────────────────────────
    githubPush()

    // ── Trigger 2: Poll SCM Fallback (Every 5 Minutes) ──────────────────────
    pollSCM('H/5 * * * *')

    // ── Trigger 3: Nightly Regression Cron (01:30 IST / 20:00 UTC) ──────────
    cron('30 20 * * *')
}
```

```
+───────────────────────────────────────────────────────────────────────────────────+
|                                  TRIGGER TAXONOMY                                 |
+---------------------+-------------------------------+-----------------------------+
| Trigger             | Execution Event               | Purpose                     |
+---------------------+-------------------------------+-----------------------------+
| 1. githubPush()     | Push or Pull Request event    | Fires immediately via       |
|                     | sent by GitHub via HTTP POST  | webhook. Zero delay.        |
+---------------------+-------------------------------+-----------------------------+
| 2. pollSCM(H/5)     | Scheduled check every 5 min   | Safety net fallback in case |
|                     | against the git remote repository | webhook dropped or offline. |
+---------------------+-------------------------------+-----------------------------+
| 3. cron(30 20)      | Nightly at 01:30 IST          | Catches dependency drift,   |
|                     | (20:00 UTC) every 24 hours    | stale caches, and new CVEs. |
+---------------------+-------------------------------+-----------------------------+
```

### Complete 11-Stage Pipeline Matrix

| Stage | Name | Exact Command Executed | Quality Gate Threshold |
|---|---|---|---|
| **1** | **Checkout** | `checkout scm` | Valid commit SHA on branch `main` |
| **2** | **Env Info** | `node -v && npm -v && docker -v` | Node.js `>= 20.0.0` validated |
| **3** | **Install** | `npm ci --legacy-peer-deps` | Hermetic lockfile integrity verified |
| **4** | **Lint** | `npm run lint:ci` | **0 errors, 0 warnings** allowed (`--max-warnings 0`) |
| **5** | **Typecheck** | `npm run typecheck` | TypeScript compilation clean (`tsc --noEmit`) |
| **6** | **Unit Tests** | `npm run test:ci` | All unit tests pass, generates `reports/junit.xml` |
| **7** | **Next.js Build**| `npm run build` | Produces standalone bundle in `.next/standalone` |
| **8** | **Docker Build** | `docker build --build-arg GIT_COMMIT=... -t validore:... .` | OCI-compliant multi-stage container image built |
| **9** | **Trivy Scan** | `trivy image --severity HIGH,CRITICAL validore:...` | Pipeline halts on unresolved High/Critical vulnerabilities |
| **10** | **Publish** | `docker push ghcr.io/validore:...` | Executed only on `main` branch merges |
| **11** | **Deploy** | `docker-compose up -d` + `/api/health` probe | Staging smoke test returns HTTP 200 |

---

## 6. Local Deployment & Physical File Locations

This section details the physical file paths on the local system for evaluator inspection:

### 1. Jenkins Workspace (Where the build executes)
* **Windows Host**:  
  `C:\ProgramData\Jenkins\.jenkins\workspace\Validore-CI-CD\`
* **Docker Jenkins Container**:  
  `/var/jenkins_home/workspace/Validore-CI-CD/`

### 2. Test Artifacts & Test Reports
* **Physical Location**:  
  `c:\Users\2025\IIT DELHI\entrepreneur\Validore\reports\junit.xml`  
  *(Also archived in Jenkins UI: `Job -> Build #N -> Test Result`)*

### 3. Docker Container Deployment
* **Container 1: `validore-app`**
  * Port: `3000` (Internal bridge network `validore-net`)
  * User: Non-root `validore` (UID 1001)
  * Liveness Check: `http://localhost:3000/api/health`
* **Container 2: `validore-nginx`**
  * Port: `80` (HTTP) and `443` (HTTPS ready)
  * Public Endpoint: `http://localhost:80/`
  * Upstream Target: `http://app:3000`

### 4. Physical Local Source Repository
* Root Directory: `c:\Users\2025\IIT DELHI\entrepreneur\Validore\`
* Git Remote: `https://github.com/shashankv762/Validore.git`
* Active Branch: `main`

---

## 7. Teacher Presentation & Live Demo Guide

Use this section as a reference during viva questions, live presentations, or evaluator walkthroughs.

### 5-Minute Live Demonstration Script

#### Step 1: Show the Git Interface (1 Minute)
1. Open the repository: [https://github.com/shashankv762/Validore](https://github.com/shashankv762/Validore)
2. Point out [Jenkinsfile](file:///c:/Users/2025/IIT%20DELHI/entrepreneur/Validore/Jenkinsfile) at root: explain that the entire CI/CD pipeline is version-controlled alongside application code.
3. Show the `triggers {}` block inside `Jenkinsfile` (lines 101–117): show `githubPush()`, `pollSCM`, and `cron`.
4. Navigate to **Settings → Webhooks**: show the webhook configured to point to `http://<jenkins-url>:8080/github-webhook/`.
5. Navigate to **Commits**: show that every commit is signed and authored by `Shashank V`.

#### Step 2: Show the Jenkins Job & Triggers (1 Minute)
1. Open Jenkins Dashboard at `http://localhost:8080`.
2. Click on the job **`Validore-CI-CD`**.
3. Click **Configure → Build Triggers** to demonstrate:
   * `[x] GitHub hook trigger for GITScm polling`
   * `[x] Poll SCM` (`H/5 * * * *`)
   * `[x] Build periodically` (`30 20 * * *`)

#### Step 3: Demonstrate Automated Triggering (1 Minute)
1. In your terminal or editor, make a trivial edit (e.g., adding a blank line or comment):
   ```bash
   git add .
   git commit -m "ci: demonstrate automated trigger execution"
   git push origin main
   ```
2. Switch back to Jenkins: show that a new build appears in the **Build History** within seconds without clicking any buttons.

#### Step 4: Inspect Pipeline Stages & Test Reports (1 Minute)
1. Click the active build → **Console Output** or **Stage View**.
2. Show each stage succeeding sequentially:
   * `Checkout` → `Environment Validation` → `Dependencies (npm ci)` → `Lint (0 errors)` → `Typecheck (tsc)` → `Unit Tests (180+ tests)` → `Next.js Build` → `Docker Build`.
3. Click **Test Result** in the build menu:
   * Show the green JUnit test breakdown: **180+ tests passed**, 0 failed.

#### Step 5: Verify Local Staging Deployment (1 Minute)
1. Open terminal and run:
   ```bash
   docker-compose ps
   ```
2. Show both `validore-app` and `validore-nginx` running in `Up` status.
3. Open browser to `http://localhost:80/api/health` and show the HTTP 200 JSON response:
   ```json
   {
     "status": "ok",
     "service": "validore",
     "timestamp": "2026-10-11T..."
   }
   ```
4. Open `http://localhost:80` to display the running Validore web interface.

---

### Evaluator Q&A Defense Sheet

| Expected Question | Precise Technical Answer |
|---|---|
| **"How does Jenkins detect when code is pushed to Git?"** | "When a push occurs, GitHub sends an HTTP POST request containing commit metadata to Jenkins at the `/github-webhook/` endpoint. Jenkins validates the payload, matches it to the `Validore-CI-CD` job via `githubPush()`, and triggers the pipeline immediately." |
| **"What happens if GitHub webhooks fail or drop connection?"** | "We have a secondary fallback trigger: `pollSCM('H/5 * * * *')`. Jenkins queries GitHub every 5 minutes. If a webhook is missed, the polling fallback detects the new commit hash and runs the build." |
| **"Where are files deployed on this physical machine?"** | "The pipeline clones and builds code in `C:\ProgramData\Jenkins\.jenkins\workspace\Validore-CI-CD\`. Test results are written to `reports/junit.xml`. The final artifact is packaged as a Docker image (`validore:latest`) and deployed via Docker Compose with Nginx listening on port 80." |
| **"Why is Nginx placed in front of Next.js?"** | "Industry standard: Nginx acts as a reverse proxy providing TLS termination, request buffering, static asset offloading, protection against slowloris attacks, and connection upgrade handling for WebSockets." |
| **"Why is the Docker container run as a non-root user?"** | "In `Dockerfile`, we create a system group and user `validore` with UID 1001 (`USER validore`). If an application vulnerability or dependency exploit occurs, the attacker is trapped inside an unprivileged sandbox and cannot access host root capabilities." |
| **"Why use `npm ci` instead of `npm install` in CI?"** | "`npm ci` reads directly from `package-lock.json` and deletes any existing `node_modules` before installing. It guarantees 100% reproducible builds and prevents silent version drift across machines." |

---

## 8. Local Installation & Development Setup

### Prerequisites
* **Node.js**: `v20.x` or higher
* **npm**: `v10.x` or higher
* **Docker & Docker Compose**: Installed and running
* **Git**: Installed

### Step 1: Clone the Repository
```bash
git clone https://github.com/shashankv762/Validore.git
cd Validore
```

### Step 2: Install Node Dependencies
```bash
npm install --legacy-peer-deps
```

### Step 3: Configure Environment Variables
Copy the example environment configuration:
```bash
cp .env.example .env.local
```

Configure `.env.local` with your database and API credentials:
```env
# Database & Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DATABASE_URL=postgresql://user:password@host:5432/postgres

# AI Engines (at least one key required for AI generation)
OPENAI_API_KEY=your_openai_key
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_claude_key

# Search Verification (Optional)
TAVILY_API_KEY=your_tavily_key
SERPER_API_KEY=your_serper_key

# Payments (Stripe & Razorpay)
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Application Host
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Initialize the Database
Push the schema to your PostgreSQL database instance:
```bash
npm run db:push
```

Seed the tier configurations, founding member counter, and benchmark crowdfunding dataset:
```bash
npm run db:seed
```

Verify database tables and record counts:
```bash
npm run db:verify
```

### Step 5: Start the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 9. Automated Quality Gates & Test Execution

Validore enforces quality standards before any code can be built or deployed.

### 1. Code Style & Linting
Enforces ESLint with zero permitted warnings:
```bash
npm run lint:ci
```

### 2. Strict Type Safety
Verifies that all TypeScript modules conform to compiler checks without emitting files:
```bash
npm run typecheck
```

### 3. Automated Test Suite (Vitest)
Executes unit tests, scoring algorithm tests, and financial models:
```bash
# Standard interactive run
npm run test

# CI mode: generates JUnit XML report for Jenkins
npm run test:ci
```

### 4. Full Quality Gate Verification
Runs the entire CI validation sequence locally in a single command:
```bash
npm run ci
```

### 5. Production Build
Generates the Next.js standalone distribution:
```bash
npm run build
```

---

## 10. Repository Directory Structure

```
Validore/
├── .agents/                    # Custom agent definitions and rules
├── infra/
│   └── nginx/
│       └── default.conf        # Nginx reverse proxy routing & health probe rules
├── public/                     # Static brand assets, favicon, SVGs
├── reports/
│   └── junit.xml               # CI test output parsed by Jenkins JUnit plugin
├── scripts/
│   ├── seed-crowdfunding-data.ts   # Populates 300+ benchmark campaigns
│   ├── seed-tiers-and-counter.ts   # Initializes tiers & founding member singleton
│   └── verify-db-setup.ts          # Checks schema health and database tables
├── src/
│   ├── app/
│   │   ├── api/                # REST endpoints: validate, export, credits, health
│   │   ├── auth/               # Supabase authentication flows
│   │   ├── dashboard/          # Authenticated app views (ideas, canvas, pricing)
│   │   ├── legal/              # Privacy, Terms, Cookies, Refund policies
│   │   ├── globals.css         # Faceted geometric token styling
│   │   ├── layout.tsx          # Root HTML metadata and navigation layout
│   │   └── page.tsx            # Main product landing page
│   ├── components/             # Reusable UI widgets and faceted layout cards
│   ├── db/
│   │   ├── index.ts            # Postgres client connection
│   │   └── schema.ts           # Drizzle ORM schema (12 tables, 4 enums)
│   ├── lib/                    # Scoring algorithms, pricing math, export generators
│   └── middleware.ts           # Route protection and auth session propagation
├── tests/                      # 180+ automated Vitest tests
├── .env.example                # Canonical environment variable reference
├── docker-compose.yml          # Production multi-container stack (App + Nginx)
├── Dockerfile                  # Multi-stage hardened container build (Node 20 Alpine)
├── Jenkinsfile                 # Declarative pipeline with 11 stages and 3 triggers
├── CICD.md                     # Comprehensive pipeline architectural documentation
├── JENKINS_SETUP.md            # Step-by-step Jenkins installation and demo guide
├── PROJECT.md                  # Milestone status and interface specifications
├── package.json                # Project dependencies and CI automation scripts
└── tsconfig.json               # Strict TypeScript configuration
```

---

## 11. Security, Privacy & Legal Compliance

* **Container Isolation**: Non-root execution (`USER validore`, UID 1001) in Alpine Linux.
* **Hermetic Vulnerability Scanning**: Integrated Trivy scan in CI stage 9 blocks deployments on High/Critical CVEs.
* **Regulatory Compliance**:
  * **GDPR**: Right to erasure and data portability endpoints (`/legal/privacy`).
  * **CCPA**: Do Not Sell My Personal Information provisions.
  * **India DPDPA 2023**: Purpose limitation, parental consent provisions, and grievance redressal officer details.
* **Privacy-Preserving Telemetry**: Next.js telemetry permanently disabled (`NEXT_TELEMETRY_DISABLED=1`).
* **Rate Limiting**: API routes guarded with Upstash Redis token bucket algorithms to prevent brute-force exploitation.

---

## 12. Author & License

* **Author**: Shashank V
* **Institution**: Dayananda Sagar Academy of Technology and Management (DSATM)
* **Email**: [1dt24cy038@dsatm.edu.in](mailto:1dt24cy038@dsatm.edu.in)
* **Repository**: [https://github.com/shashankv762/Validore.git](https://github.com/shashankv762/Validore.git)

This project is open-source software licensed under the **Apache License 2.0**. See the [LICENSE](./LICENSE) file for complete terms.
