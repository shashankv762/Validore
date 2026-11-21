# Validore

> Know it's gold before you dig.

Validore helps founders examine startup ideas, market assumptions, pricing, and launch plans. It combines a guided idea form, specialist AI agents, saved reports, Lean Canvas versions, pricing simulation, crowdfunding analysis, pitch decks, and exports. AI conclusions are estimates; source matching establishes citation provenance, not proof of demand.

The deployment uses **two independent sites**: the marketing website at `https://validore.tech`, entirely inside [static webpage](static%20webpage/README.md), and the full SaaS at `https://validore.onrender.com`. The static folder includes Vercel and Cloudflare Pages configuration, visitor-triggered wake-up checks, and publishing instructions. The [Render Free guide](docs/FREE_PROTOTYPE_DEPLOYMENT.md) covers the backend and its external services. Check `/api/health` on the SaaS for the live release revision.

Operator: **Shashank V, India**. Public support and privacy contact: **aegixchainai@gmail.com**.

The brief now includes an optional private founder interview. Saved answers guide follow-up questions, identify evidence gaps, and inform validation, Lean Canvas, pricing, crowdfunding and pitch analysis. Questions assess the clarity of submitted answers, not personal ability. Settings includes an account-data download; each interview can be cleared separately. Terms, privacy, refund, acceptable-use and essential-cookie notices describe the implemented processing.

The app includes a public World Bank snapshot for India and five comparison geographies with retrieval dates, units, source links and a 30-day expiry. Refresh it with the following command.

```powershell
npm run data:refresh
```

The refresh command fetches public data over HTTPS. To copy a reviewed snapshot into PostgreSQL, run the separate `npm run db:seed:research` command. See [data provenance](docs/DATA_SOURCES.md) and [market memory](docs/MARKET_MEMORY.md).

## Start locally

Use Node.js 24 LTS and npm. Install from the lockfile:

```powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Set the public Supabase URL and publishable/anon key, private `DATABASE_URL`, and at least one AI provider in `.env.local`. Keep `VALIDATION_RUNNER=local` and `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3100` for local development. Run `npm run dev` and open http://127.0.0.1:3100. This explicit address avoids another old app that may still answer on `localhost:3000`. The public `/demo` sample needs no account or AI request.

The research team uses three specialists for Lite reports and nine for full reports. The Render configuration enables PixRouter. Configure additional gateways only after verifying their model availability and quotas. See [Render setup](docs/FREE_PROTOTYPE_DEPLOYMENT.md).

Credits, Usage, Settings and planning tools share refreshed account balances. Premium costs ₹799 or US$8 per month, and Max Premium costs ₹1,999 or US$20 per month. Free, Premium and Max Premium include 100, 1,500 and 4,500 plan credits respectively. Usage separates recorded validation tokens from app credits. The [market-memory guide](docs/MARKET_MEMORY.md) explains evidence reuse, expiry, bounded search spending and optional self-hosted tools.

The Credits tab includes opt-in rewarded video: one signed AppLixir completion earns 10 credits. Earned balances carry forward; five rewards can fund an extra Lite validation beyond the Free plan's included runs. Ads remain unavailable until the publisher account, placement, signed callback and privacy settings are approved/configured. [Ad setup and crypto payout options](docs/REWARDED_ADS.md) explains the integration and why direct AppLixir crypto withdrawals cannot currently be promised.

Every authenticated owner can download their saved validation, Lean Canvas, pricing, crowdfunding and pitch content as PDF or editable Word documents. Selected canvas/deck versions stay selected during export. CSV and other advanced export entitlements are unchanged.

The Reports and Research team pages also offer a reusable five-page report template in PDF and Word. It covers the decision, customer and market evidence, product, economics, experiments, and founder review. See [the template guide](docs/REPORT_TEMPLATE.md) for the structure and regeneration command.

For a **new development database**, review the schema before running `npm run db:push` and `npm run db:seed`. These commands modify the configured database. For existing databases, follow [Production setup](docs/PRODUCTION_SETUP.md), including the explicit browser-role access restrictions in the reviewed SQL deltas.

## Architecture

- A Node standalone server on Render serves Next.js pages and API routes together.
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
npm run test:ci
# Requires an explicitly configured disposable loopback PostgreSQL database.
npm run test:postgres
npm run build:deploy
npm run smoke:production
npm audit --omit=dev
```

The smoke check starts the built standalone app on a loopback port, verifies public pages, branding, generated images, metadata, headers, sign-in rendering and error recovery, then stops it. Results go to ignored `reports/production-smoke.json`.

Most tests use synthetic services. PGlite accounting and persistence tests run actual SQL and transactions without hosted credentials. `npm run test:postgres` runs transaction, ownership, migration and concurrency checks in a fresh schema on an explicitly supplied loopback `TEST_DATABASE_URL`; it never loads `.env.local` and refuses a hosted database. GitHub CI provisions PostgreSQL for this gate. Hosted email, payment and queue behavior need separate integration checks.

For a focused check of search reuse, agent tool execution, usage accounting, private context, fallback and job replay, run `npm run verify:agents`. It uses the real coordinator and AI SDK with synthetic external services. See [GitHub checks](https://github.com/shashankv762/Validore/actions).

`npm run verify:release-files` checks that Git excludes local credentials, browser sessions, backups and generated output while retaining the files needed to build and test the app.

## Deployment

GitHub Actions runs lint, types, regressions, real PostgreSQL concurrency/migration tests, a production dependency audit, the standalone build, asset/privacy smoke checks and static marketing JavaScript checks. The workflow runs for main pushes, pull requests and manual requests. Deploy the exact passing commit to the existing Render service using [render.yaml](render.yaml); this file also documents its build/start commands and required environment. Render deployment remains manual.

Before deploying to an existing database, back it up and apply outstanding SQL deltas through `0015_ai_execution_leases.sql`. Apply `0016_subscription_prices.sql` and verify the corresponding Stripe prices before enabling paid checkout. See the [database rollout guide](docs/PRODUCTION_SETUP.md#database-rollout).

Render uses Inngest for validation, queue reconciliation and daily credit maintenance. Use one maintenance scheduler and resync the Inngest app after rollout. Follow the [Render deployment guide](docs/FREE_PROTOTYPE_DEPLOYMENT.md) for the build commands, environment variables and hosted checks.

## Documentation

- [Deploy the app on Render](docs/FREE_PROTOTYPE_DEPLOYMENT.md)
- [Publish the separate static marketing site](static%20webpage/README.md)
- [Rewarded ads, publisher approval and crypto payout options](docs/REWARDED_ADS.md)
- [Production configuration and database setup](docs/PRODUCTION_SETUP.md)
- [Report and document template](docs/REPORT_TEMPLATE.md)

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
