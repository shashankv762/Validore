# Validore

> Know it's gold before you dig.

Validore helps founders examine startup ideas, market assumptions, pricing, and launch plans before investing in them. It combines a guided idea form, specialist AI agents, report history, saved manual/AI Lean Canvas versions, pricing simulation, crowdfunding analysis, pitch decks, and exports.

The original Validore logo, navy/gold/cream palette, and product modules are preserved. AI conclusions are estimates: source matching establishes citation provenance, not proof of market demand.

## Classroom presentation

For the local app demonstration using the current working tree, follow [Classroom demo](docs/CLASSROOM_DEMO.md). Start-ClassroomApp.ps1 runs the real app on localhost; /demo is a clearly labeled read-only sample. The current release target is a Render beta at validore.tech.

## Start locally

Use Node.js 24 LTS, or a supported version matching the package's engines field, and npm. Install from the committed lockfile:

~~~powershell
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
~~~

Fill the public Supabase URL/publishable key and private DATABASE_URL in .env.local. Configure at least one AI provider before generating analyses. All other integrations can remain empty during setup; production abuse controls, queue, payments, and email delivery need their own configuration.

For a new development database, review the schema changes before applying them:

~~~powershell
npm run db:push
npm run db:seed
npm run dev
~~~

Open http://localhost:3000. These database commands modify the configured database. Never point development seeds at a live customer database. Existing deployments need the reviewed SQL changes described in [Production setup](docs/PRODUCTION_SETUP.md), including explicit Data API grant restrictions.

## Product and architecture

- Supabase Auth handles sessions, confirmation, sign-in, and password recovery; server APIs verify identity and idea/report ownership.
- Drizzle and PostgreSQL store ideas, jobs, reports, billing references, and a credit ledger. Credit reservation uses row locks and arithmetic updates.
- Full validation runs market, customer, competitor, finance, risk, and synthesis agents. A deterministic supervisor checks citations against the retrieved sources.
- VALIDATION_RUNNER=inngest provides retries, per-user concurrency, durable job steps, and failure refunds. Local development uses Next.js after().
- Custom OpenRouter keys are encrypted on the server with AES-GCM; the browser does not persist or receive stored key values.
- Stripe checkout, customer portal, cancellation, and signed webhooks handle configured billing. Razorpay checkout is currently unavailable; its legacy webhook path must not be advertised as a complete purchase flow.
- Crowdfunding benchmarks are synthetic data, not a dataset of verified historical campaigns.

## Continuous integration

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push to main/master and on pull requests. It validates the environment and public build configuration, installs from the committed lockfile, runs strict lint/types/tests, audits production dependencies, builds the app, and smoke-tests the built standalone server. Actual JUnit results and the smoke report are uploaded as artifacts.

Demo defaults use nonfunctional public Supabase build fixtures and no live service keys. Override them with repository variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_APP_URL), or run the workflow manually to select the release profile, which requires real HTTPS public origins and rejects a private Supabase key.

Container publishing and the Render release remain operator configuration. The workflow is never given registry or deployment credentials; scripts/render-deployment.mjs is available for an operator-run release and is documented in [Free beta launch](docs/GO_LIVE.md). No registry or deployment target is configured by this repository alone.

## Quality gates

~~~powershell
npm run lint:ci
npm run typecheck
npm run test:ci
npm run build
npm run smoke:production
npm audit --omit=dev --audit-level=high
~~~

Tests in CI use mocks for external providers; database integration suites can be skipped without a configured test database. A passing mock suite does not establish live payment, email, queue, or database behavior. This session's local execution uses the R-drive workspace; see the implementation status for the RAM-disk compiler setup and actual verification results.

Before pushing, review the staged diff and confirm it contains only intended files. Keep .env.local, credentials, generated reports, and build output out of the commit. Run the CI checks, production build, production smoke check, and production dependency audit shown above; record any checks that could not run and why.

## Deployment and current evidence

Render deployment is in preparation. Provider setup and live acceptance remain necessary; consult the current status below.

- [Free beta launch on validore.tech](docs/GO_LIVE.md)
- [Production setup and remaining release requirements](docs/PRODUCTION_SETUP.md)
- [Agent execution, evidence, and scaling](docs/AI_AGENTS.md)
- [Implementation and verification status](docs/IMPLEMENTATION_STATUS.md)
- [Brand and interface decisions](DESIGN.md)

Use separate staging and production Supabase, Redis, AI, queue, and billing credentials. Public environment variables are embedded during the build; private runtime keys stay out of source control and container images.

## Source layout

| Path | Responsibility |
| --- | --- |
| src/app | Product pages and authenticated APIs |
| src/proxy.ts | Dashboard/auth session refresh and route protection |
| src/lib/validation | Specialist agents, synthesis, evidence supervision, job lifecycle |
| src/inngest | Durable validation orchestration |
| src/db | PostgreSQL client and schema |
| tests | Unit, regression, contract, and optional DB integration suites |
| scripts | CI checks, production smoke test, and developer DB tools |
| infra/nginx | Local container reverse proxy |
| drizzle | Reviewed SQL deltas for existing application databases |

Author: Shashank V, Dayananda Sagar Academy of Technology and Management (DSATM). Licensed under [Apache 2.0](LICENSE).
