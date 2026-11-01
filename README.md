# Validore

> Know it's gold before you dig.

Validore helps founders examine startup ideas, market assumptions, pricing, and launch plans. It combines a guided idea form, specialist AI agents, saved reports, Lean Canvas versions, pricing simulation, crowdfunding analysis, pitch decks, and exports. AI conclusions are estimates; source matching establishes citation provenance, not proof of demand.

The release target is **https://validore.tech on Vercel**. The domain stays with Namify/.TECH. Follow the [Vercel and domain launch guide](docs/GO_LIVE.md) for account settings, environment variables, DNS, and final acceptance checks. These changes have been prepared locally; they have not been deployed to Vercel or connected to the domain.

Operator: **Shashank V, India**. Public support and privacy contact: **aegixchainai@gmail.com**.

The brief now includes an optional private founder interview. Saved answers guide follow-up questions, identify evidence gaps, and inform validation, Lean Canvas, pricing, crowdfunding and pitch analysis. Questions assess the clarity of submitted answers, not personal ability. Settings includes an account-data download; each interview can be cleared separately. Terms, privacy, refund, acceptable-use and essential-cookie notices describe the implemented processing.

The project also includes **48 official World Bank observations** for India and five comparison geographies, plus **10 official source references**, collected using GPT-6 Astra in the development session. The observations cover 2024–2025 and retain actual retrieval dates, units, provenance and 30-day expiry. Fetching them did not use the application's AI API tokens. Refresh the public snapshot with:

```powershell
npm run data:refresh
```

The refresh command uses direct public HTTPS requests and does not load application keys, call models, or access the database. Review [data provenance](docs/DATA_SOURCES.md) and [memory behavior](docs/MARKET_MEMORY.md). Agents still consume model tokens when analyzing a plan or tailoring questions. **Apply `drizzle/0003_founder_interviews_research.sql` before running this application against an existing database.** Optional `npm run db:seed:research` copies the reviewed snapshot to the configured database; it is a separate write operation.

## Start locally

Use Node.js 24 LTS and npm. Install from the lockfile:

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Set the public Supabase URL and publishable/anon key, private `DATABASE_URL`, and at least one AI provider in `.env.local`. Keep `VALIDATION_RUNNER=local` and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100` for local development. Run `npm run dev` and open http://127.0.0.1:3100. This explicit address avoids another old app that may still answer on `localhost:3000`. The public `/demo` sample needs no account or AI request.

The research team uses three specialists for Lite reports and nine for full reports. Fourteen tools cover dated market memory, official country indicators, public research, source review, market sizing, financial scenarios, cash runway, feature priorities, survey planning, and conversion analysis. Each specialist receives the tools relevant to its role. PixRouter's four approved free aliases are the primary candidates; OpenCode and OpenRouter are configured fallbacks. [AI agents and model policy](docs/AI_AGENTS.md) describes quotas, source handling and current live verification.

Credits, Usage, Settings and planning tools share refreshed account balances. Prices remain Free $0, Premium $29/month and Max Premium $79/month, with 100, 1,500 and 4,500 plan credits respectively. Usage separates recorded validation tokens from app credits. The [market-memory guide](docs/MARKET_MEMORY.md) explains evidence reuse, expiry, bounded search spending and optional self-hosted tools.

Every authenticated owner can download their saved validation, Lean Canvas, pricing, crowdfunding and pitch content as PDF or editable Word documents. Selected canvas/deck versions stay selected during export. CSV and other advanced export entitlements are unchanged.

The Reports and Research team pages also offer a reusable five-page report template in PDF and Word. It covers the decision, customer and market evidence, product, economics, experiments, and founder review. See [the template guide](docs/REPORT_TEMPLATE.md) for the structure and regeneration command.

For a **new development database**, review the schema before running `npm run db:push` and `npm run db:seed`. These commands modify the configured database. For existing databases, follow [Production setup](docs/PRODUCTION_SETUP.md), including the explicit browser-role access restrictions in the reviewed SQL deltas.

## Architecture

- Vercel serves the Next.js frontend and API routes. A separate backend web server is unnecessary.
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
npm run build
npm run smoke:production
npm audit --omit=dev
```

The smoke command starts the built standalone app on a loopback port, verifies public pages, branding, generated images, metadata, headers, sign-in rendering, and error recovery, then stops it. Results are written to ignored `reports/production-smoke.json`.

Tests use mocks unless a dedicated `TEST_DATABASE_URL` is set in ignored `.env.test.local`. Tests do not load the application's `.env.local`. Never use a customer database for tests. A passing mock suite does not establish hosted email, payment, queue, or database behavior.

For a focused check of search reuse, agent tool execution, usage accounting, private context, fallback and job replay, run `npm run verify:agents`. It includes the real coordinator and AI SDK with synthetic external services, so it uses no application AI tokens. The current suite passes **487 tests** with **8 database tests skipped**; see [release evidence](docs/PRIVACY_DATA_RELEASE_2026-11-01.md) for build, browser and security scope. Historical live-model runs are identified separately.

`.gitignore` and `.vercelignore` exclude local credentials, browser sessions, account exports, test screenshots, logs, backups and generated output. `verify:release-files` checks those rules and confirms that public research snapshots, SQL migrations, fonts, templates and the lockfile remain included. Ignore rules do not remove files already tracked in Git or replace a secret-content scan. Keep deployments manual and review the diff before committing.

## Deployment automation removed

Jenkins pipelines, Jenkins setup scripts, the GitHub Actions CI workflow, and the Render deployment helper/blueprint have been removed. Vercel automatic Git deployments are disabled in `vercel.json`. Releases are manual; the lint, test, build, and smoke commands remain available for local verification.

The daily credit-maintenance cron and Inngest jobs are application features. They are retained so customer credits and reports work. Existing Jenkins jobs, webhooks, GitHub required checks, and old host schedules must be disabled in their external dashboards; repository changes do not change those accounts. See [the removal checklist](docs/GO_LIVE.md#7-disable-old-automation).

## Documentation

- [Launch on Vercel and validore.tech](docs/GO_LIVE.md)
- [Production configuration and database setup](docs/PRODUCTION_SETUP.md)
- [AI agent execution and limits](docs/AI_AGENTS.md)
- [Free model catalog and live checks](docs/AI_MODELS.md)
- [Report and document template](docs/REPORT_TEMPLATE.md)
- [Privacy, research and interview release evidence](docs/PRIVACY_DATA_RELEASE_2026-11-01.md)
- [Security findings, fixes and remaining launch checks](docs/SECURITY_REVIEW_2026-11-01.md)
- [Earlier release evidence](docs/RELEASE_CANDIDATE_2026-11-01.md)
- [Current verification status](docs/IMPLEMENTATION_STATUS.md)
- [Brand and interface decisions](DESIGN.md)
- [Optional local presentation](docs/CLASSROOM_DEMO.md)

Earlier Render acceptance is archived in [historical release evidence](docs/RELEASE_EVIDENCE_2026-10-31.md); it does not verify this Vercel release.

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
