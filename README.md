# Validore

> Know it's gold before you dig.

Validore helps founders examine startup ideas, market assumptions, pricing, and launch plans. It combines a guided idea form, specialist AI agents, saved reports, Lean Canvas versions, pricing simulation, crowdfunding analysis, pitch decks, and exports. AI conclusions are estimates; source matching establishes citation provenance, not proof of demand.

The requested deployment now has **two independent sites**: the marketing website at `https://validore.tech`, entirely inside [static webpage](static%20webpage/README.md), and the full SaaS at `https://validore.onrender.com`. The static folder includes Vercel and Cloudflare Pages configuration, visitor-triggered wake-up checks, and step-by-step publishing instructions. Vercel Hobby excludes commercial use; Cloudflare Pages Free is the free commercial option for this marketing site. The [Render Free guide](docs/FREE_PROTOTYPE_DEPLOYMENT.md) covers the ten-user backend and its external services. The [Cloudflare Workers guide](docs/GO_LIVE.md) is an alternative full-app deployment, not part of this split setup. These changes are prepared locally and have not been deployed.

Operator: **Shashank V, India**. Public support and privacy contact: **aegixchainai@gmail.com**.

The brief now includes an optional private founder interview. Saved answers guide follow-up questions, identify evidence gaps, and inform validation, Lean Canvas, pricing, crowdfunding and pitch analysis. Questions assess the clarity of submitted answers, not personal ability. Settings includes an account-data download; each interview can be cleared separately. Terms, privacy, refund, acceptable-use and essential-cookie notices describe the implemented processing.

The project also includes **48 official World Bank observations** for India and five comparison geographies, plus **10 official source references**, collected using GPT-6 Astra in the development session. The observations cover 2024–2025 and retain actual retrieval dates, units, provenance and 30-day expiry. Fetching them did not use the application's AI API tokens. Refresh the public snapshot with:

```powershell
npm run data:refresh
```

The refresh command uses direct public HTTPS requests and does not load application keys, call models, or access the database. Review [data provenance](docs/DATA_SOURCES.md) and [memory behavior](docs/MARKET_MEMORY.md). Agents still consume model tokens when analyzing a plan or tailoring questions. **Apply required deltas through `drizzle/0004_rewarded_ads.sql` before running this version against an existing database, even when ads are disabled.** Optional `npm run db:seed:research` copies the reviewed snapshot into PostgreSQL; it is a separate write operation.

## Start locally

Use Node.js 24 LTS and npm. Install from the lockfile:

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Set the public Supabase URL and publishable/anon key, private `DATABASE_URL`, and at least one AI provider in `.env.local`. Keep `VALIDATION_RUNNER=local` and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100` for local development. Run `npm run dev` and open http://127.0.0.1:3100. This explicit address avoids another old app that may still answer on `localhost:3000`. The public `/demo` sample needs no account or AI request.

The research team uses three specialists for Lite reports and nine for full reports. Fourteen tools cover dated market memory, official country indicators, public research, source review, market sizing, financial scenarios, cash runway, feature priorities, survey planning, and conversion analysis. Each specialist receives the tools relevant to its role. PixRouter's four approved free aliases are the primary candidates; OpenCode and OpenRouter are configured fallbacks. [AI agents and model policy](docs/AI_AGENTS.md) describes quotas, source handling and current live verification.

Credits, Usage, Settings and planning tools share refreshed account balances. Prices remain Free $0, Premium $29/month and Max Premium $79/month, with 100, 1,500 and 4,500 plan credits respectively. Usage separates recorded validation tokens from app credits. The [market-memory guide](docs/MARKET_MEMORY.md) explains evidence reuse, expiry, bounded search spending and optional self-hosted tools.

The Credits tab includes opt-in rewarded video: one signed AppLixir completion earns 10 credits. Earned balances carry forward; five rewards can fund an extra Lite validation beyond the Free plan's included runs. Ads remain unavailable until the publisher account, placement, signed callback and privacy settings are approved/configured. [Ad setup and crypto payout options](docs/REWARDED_ADS.md) explains the integration and why direct AppLixir crypto withdrawals cannot currently be promised.

Every authenticated owner can download their saved validation, Lean Canvas, pricing, crowdfunding and pitch content as PDF or editable Word documents. Selected canvas/deck versions stay selected during export. CSV and other advanced export entitlements are unchanged.

The Reports and Research team pages also offer a reusable five-page report template in PDF and Word. It covers the decision, customer and market evidence, product, economics, experiments, and founder review. See [the template guide](docs/REPORT_TEMPLATE.md) for the structure and regeneration command.

For a **new development database**, review the schema before running `npm run db:push` and `npm run db:seed`. These commands modify the configured database. For existing databases, follow [Production setup](docs/PRODUCTION_SETUP.md), including the explicit browser-role access restrictions in the reviewed SQL deltas.

## Architecture

- A Node standalone server on Render, or the Cloudflare Worker adapter, serves Next.js pages and API routes together.
- Supabase Auth handles sessions, confirmation, Google sign-in, and password recovery. APIs verify identity and idea/report ownership.
- Drizzle/PostgreSQL store ideas, private founder interviews, public research, jobs, reports, billing references, and the credit ledger. Credit reservation and refunds use transactions and row locks; concurrent validation requests reuse an existing active job.
- Inngest runs Full and Lite validation as separate durable research, agent, and persistence steps. Completed steps are reused during replay. Keys stay on the server and are excluded from cached step results.
- Redis supplies production rate and concurrency limits. Unconfigured production abuse controls fail closed.
- Custom OpenRouter keys are encrypted with AES-GCM. Stored key values are never returned to the browser.
- Stripe handles configured subscriptions, credit checkout, portal management, and signed payment events. Checkout stays unavailable until the required billing settings exist. Razorpay checkout is not enabled.
- Crowdfunding benchmarks are synthetic and remain labeled accordingly.

## Manual release checks

```powershell
npm run verify:release-files
npm run lint
npm run typecheck
npm test
npm run build:deploy
npm run smoke:production
npm audit --omit=dev
```

For Workers, also run `npm run build:cloudflare`, `npm run check:cloudflare`, and `npm run smoke:cloudflare`. The Node smoke starts the built standalone app on a loopback port, verifies public pages, branding, generated images, metadata, headers, sign-in rendering and error recovery, then stops it. Results are written to ignored `reports/production-smoke.json`.

Most tests use synthetic services. Reward accounting tests run the real SQL migration and transactions in isolated PGlite PostgreSQL, without network/database credentials. Other live database tests require a separate `TEST_DATABASE_URL` in ignored `.env.test.local`; the suite does not load the application's `.env.local`. Local tests do not establish hosted email, payment, queue or multi-connection database behavior.

For a focused check of search reuse, agent tool execution, usage accounting, private context, fallback and job replay, run `npm run verify:agents`. It includes the real coordinator and AI SDK with synthetic external services, so it uses no application AI tokens. This release passed **532 tests** with **8 external-database tests skipped**; see [current verification status](docs/IMPLEMENTATION_STATUS.md). Historical live-model runs are identified separately.

`.gitignore` and the Worker asset boundary exclude local credentials, browser sessions, account exports, test screenshots, logs, backups and generated output. `verify:release-files` checks source-control rules and confirms that public research snapshots, SQL migrations, fonts, templates and the lockfile remain included. Ignore rules do not remove files already tracked in Git or replace a secret-content scan. Keep deployments manual and review the diff before committing.

## Deployment

Jenkins pipelines, Jenkins setup scripts, the GitHub Actions CI workflow, and the Render deployment helper/blueprint have been removed. Cloudflare deployment uses the manual `npm run deploy:cloudflare` command; no Git integration is configured in this repository. Releases are manual; the lint, test, build, and smoke commands remain available for local verification.

Follow the [free prototype guide](docs/FREE_PROTOTYPE_DEPLOYMENT.md) for Render's exact build/start settings and all external services. Render Free can sleep or hit quotas; free hosting does not imply unlimited free AI. The checked-in Cloudflare CPU configuration uses Workers Paid (currently from US$5/month plus usage); follow [its launch guide](docs/GO_LIVE.md) if selecting that option. Bundle size alone no longer rules out Workers Free.

The daily credit-maintenance cron and Inngest jobs are application features. Render uses `CREDIT_MAINTENANCE_RUNNER=inngest` to avoid a paid cron service; Cloudflare retains its Worker Cron Trigger. Use one scheduler. Existing Jenkins jobs, webhooks, GitHub required checks and old host schedules must be disabled in their external dashboards; repository changes do not change those accounts.

## Documentation

- [Free ten-user prototype: hosting comparison and full deployment steps](docs/FREE_PROTOTYPE_DEPLOYMENT.md)
- [Rewarded ads, publisher approval and crypto payout options](docs/REWARDED_ADS.md)
- [Launch on Cloudflare Workers and validore.tech](docs/GO_LIVE.md)
- [Production configuration and database setup](docs/PRODUCTION_SETUP.md)
- [AI agent execution and limits](docs/AI_AGENTS.md)
- [Free model catalog and live checks](docs/AI_MODELS.md)
- [Report and document template](docs/REPORT_TEMPLATE.md)
- [Privacy, research and interview release evidence](docs/PRIVACY_DATA_RELEASE_2026-11-01.md)
- [Security findings, fixes and remaining launch checks](docs/SECURITY_REVIEW_2026-11-01.md)
- [Earlier release evidence](docs/RELEASE_CANDIDATE_2026-11-01.md)
- [Cloudflare migration checks](docs/CLOUDFLARE_MIGRATION.md)
- [Current verification status](docs/IMPLEMENTATION_STATUS.md)
- [Brand and interface decisions](DESIGN.md)
- [Optional local presentation](docs/CLASSROOM_DEMO.md)

Earlier Render acceptance is archived in [historical release evidence](docs/RELEASE_EVIDENCE_2026-10-31.md); it does not verify this Cloudflare Workers release.

## Source layout

| Path | Responsibility |
| --- | --- |
| `src/app` | Pages, authenticated APIs, and metadata |
| `src/proxy.ts` | Auth/session refresh and dashboard protection |
| `src/lib/validation` | AI agents, evidence checks, and job lifecycle |
| `src/lib/interview` | Private answer schemas, question methodology, adaptive reviews and owner-scoped context |
| `src/data/market` | Official observations, source catalog, metadata and refresh evidence |
| `src/inngest` | Durable validation coordination |
| `src/db` | PostgreSQL client and schema |
| `tests` | Manual unit, regression, contract, and optional DB suites |
| `scripts` | Local verification, standalone packaging, and database tools |
| `drizzle` | Reviewed SQL deltas for existing databases |
| `public/logo` | Supplied Validore vector artwork adapted for web use |

Author: Shashank V, Dayananda Sagar Academy of Technology and Management (DSATM). Licensed under [Apache 2.0](LICENSE).
