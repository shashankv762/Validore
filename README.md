# Validore

> Know it's gold before you dig.

Validore helps founders examine startup ideas, market assumptions, pricing, and launch plans before investing in them. It combines a guided idea form, specialist AI agents, report history, saved manual/AI Lean Canvas versions, pricing simulation, crowdfunding analysis, pitch decks, and exports.

The original Validore logo, navy/gold/cream palette, and product modules are preserved. AI conclusions are estimates: source matching establishes citation provenance, not proof of market demand.

## Classroom presentation

For the local app and a Jenkins demonstration using the current working tree, follow [Classroom demo](docs/CLASSROOM_DEMO.md). Start-ClassroomApp.ps1 runs the real app on localhost; /demo is a clearly labeled read-only sample. Start-ClassroomJenkins.ps1 prepares a portable loopback controller after Java 21/25 is installed. Jenkinsfile.classroom copies source without private environment files, runs strict CI, and starts/checks/stops the built standalone artifact. Public deployment is deferred.

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

## Jenkins for the classroom and releases

The [Jenkinsfile](Jenkinsfile) supports a Windows or Linux classroom run using BUILD_PROFILE=demo and SKIP_DOCKER=true. It checks the environment, installs dependencies, runs strict lint/types/tests, audits production dependencies, builds the app, and smoke-tests the built server. It archives actual JUnit results.

A configured Linux release agent adds Docker and Trivy. Publishing is opt-in and limited to trusted main/master multibranch jobs. Container staging requires approval and an existing deployment job accepting the scanned image digest. The separate Render release stage deploys the tested Git commit and verifies the live revision, with guarded rollback.

Follow [Jenkins setup and demo](JENKINS_SETUP.md), then see [Pipeline stages and release contract](CICD.md). No live Jenkins controller, registry, or deployment target is configured by this repository alone.

## Quality gates

~~~powershell
npm run lint:ci
npm run typecheck
npm run test:ci
npm run build
npm run smoke:production
npm audit --omit=dev --audit-level=high
~~~

Tests in CI use mocks for external providers; database integration suites can be skipped without a configured test database. A passing mock suite does not establish live payment, email, queue, or database behavior. Codex Luna execution must use its configured R-only runner; these ordinary developer commands are not a workaround for that agent restriction.

Before pushing, review the staged diff and confirm it contains only intended files. Keep .env.local, credentials, local controller state, generated reports, and build output out of the commit. Run the CI checks, production build, production smoke check, and production dependency audit shown above; record any checks that could not run and why.

## Deployment and current evidence

Deployment work is deferred until after the classroom presentation.

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
