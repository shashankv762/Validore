# Production setup

The source now has configurable CI, durable validation jobs, billing endpoints, safer credit handling, and UI corrections. Public launch still requires real infrastructure configuration and final verification; this document is not a claim that deployment is complete.

## Configuration

Use .env.example as the field reference. Keep .env.local ignored and never include it in a Docker context or Jenkins checkout. The screenshot-supplied Supabase private key/database password have been exposed; rotate them in Supabase and replace the local values before public use. A public publishable/anon key is intended for the browser; a service-role/secret key and DB credentials are server-only.

| Setting | Requirement |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY | Real public project configuration at build time; never a private key |
| NEXT_PUBLIC_APP_URL | Exact HTTPS origin in production; rebuild when it changes |
| DATABASE_URL | Server connection string copied from the target project; URL-encode reserved password characters |
| DB_MAX_CONNECTIONS | Per-process pool bound, default 5; total replicas times pool size must fit database capacity |
| UPSTASH_REDIS_REST_URL / TOKEN | Production abuse controls; unavailable/missing Redis blocks costly calls and signup |
| AI provider keys | At least one configured provider compatible with the selected chain |
| Search keys | Configure Tavily/Serper for retrieved evidence; absent search means limited evidence |
| ENCRYPTION_KEY | Exactly 64 hex characters, securely generated; required to store/use custom provider keys |
| VALIDATION_RUNNER | inngest for durable public operation; local for development |
| VALIDATION_GLOBAL_CONCURRENCY | Default 2; keep low on free hosting and raise only with capacity/provider quotas |
| INNGEST_EVENT_KEY / SIGNING_KEY | Target environment's queue keys; do not enable INNGEST_DEV in production |
| CRON_SECRET | Strong private bearer token for monthly credit maintenance |
| Stripe keys / webhook secret / two price IDs | Required before enabling paid subscription and credit checkout |

Generate a random encryption key with a trusted password/secret manager or crypto tool and store it outside source control. Keep its previous value available while re-encrypting any existing saved keys during rotation; changing it immediately makes old keys unreadable. Legacy CBC keys can be read only with their original encryption key; new writes use authenticated AES-GCM. Plaintext saved key values are rejected.

The service-role env slot is reserved for administration; ordinary app routes use Supabase Auth plus the private PostgreSQL connection and do not require that key.

## Database rollout

Use a separate staging database and take a verified backup before changing an existing deployment. The repository does not contain a complete versioned baseline migration history. For a fresh development database, review Drizzle's proposed schema, apply npm run db:push, and run npm run db:seed. For an existing database, review/apply SQL deltas in order after the base tables exist:

1. drizzle/0000_credit_payment_idempotency.sql adds unique provider-payment references.
2. drizzle/0001_application_access_and_indexes.sql enables RLS, revokes application-table access from PUBLIC/anon/authenticated, and adds report/job/history indexes.

These files are reviewed SQL deltas, not an automatically journaled migration chain. The second migration targets Supabase roles and is required even after db:push because the explicit grants are not represented by that command. Unique indexes deliberately fail if duplicate historical payments/reports need reconciliation. Inspect those rows and reconcile accounting; do not automatically delete customer records to satisfy an index.

Browser clients use Supabase Auth only. Application tables are accessed through Next.js APIs with ownership checks. Confirm that DATABASE_URL uses the table owner or a separately reviewed server role with the required grants/RLS policy. Do not use FORCE ROW LEVEL SECURITY blindly or apply browser ownership policies invented for a different access architecture.

Before launch, test anon and authenticated Data API SELECT/INSERT/UPDATE/DELETE denial on every application table, and successful authorized server operations. Inspect any live views, RPC functions, grants, storage buckets, and schemas beyond this repository. RLS source declarations do not prove the current hosted database is protected. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Seeds include synthetic crowdfunding campaigns. They must remain labeled synthetic rather than being presented as historical research.

## Supabase authentication

Configure Site URL to the public origin and allow the app's /auth/callback redirect for confirmation and recovery, plus explicit localhost/staging origins as needed. Use production SMTP/delivery settings and test registration, confirmation, sign-in, expired reset links, reset completion, sign-out, and refresh cookies. The server uses a PKCE callback before the reset page; custom email templates must support that flow.

The included Nginx ingress replaces incoming forwarding headers. If deploying behind another ingress, configure equivalent trusted client-IP handling before relying on the signup IP quota. Signup retains the existing quota of three registrations per network in seven days; review that product policy for shared college/company networks before wider onboarding.

## Durable AI jobs

Set VALIDATION_RUNNER=inngest and configure the target Inngest environment to serve /api/inngest, with signing/event keys. Verify enqueue, retries, terminal failure refund, duplicate event handling, partial agent results, and report persistence. The generation step currently reruns the full analysis on retry; budget for repeated provider charges.

Run on a platform with sufficient request execution time for the /api/inngest handler (maxDuration=600) or use a long-running Node deployment. Local after() work is bounded by the hosting process/request lifecycle and is not a durable replacement for the queue. Follow [Agent architecture](AI_AGENTS.md).

## Billing

Configure Stripe test mode in staging first, including recurring prices for the displayed plans and the Customer Portal configuration. Subscribe the signed webhook endpoint /api/webhooks/stripe to checkout.session.completed, checkout.session.async_payment_succeeded, and customer.subscription.created/updated/deleted.

Plan checkout stores server-created customer ownership, serializes requests per account, reuses open plan checkout, and routes existing subscriptions to the portal. Only signed, paid credit events matching server catalogue amounts/currency grant credits. Duplicate provider references must be protected by the SQL indexes before accepting payments. A checkout return URL is not proof of payment.

Test delayed/duplicate/out-of-order events, successful/failed payments, portal changes, period-end cancellation, renewal credits, and invoice failure behavior. Confirm the live recurring price amounts match the displayed plan prices. Refund/chargeback reconciliation remains an operational requirement; automatic payment-refund entitlement reversal is not implemented.

Razorpay checkout remains unavailable. Its legacy webhook supports captured credits and activation, but a complete renewal/cancellation/refund lifecycle is not implemented. Keep Razorpay sales disabled until that flow has independent staging verification.

## Container and public deployment

For local Docker development with configured external services:

~~~powershell
docker compose --env-file .env.local up --build --wait
~~~

Nginx is on http://localhost:8081, with the app bound to loopback port 3000. Choose NEXT_PUBLIC_APP_URL to match the browser origin used for authentication. This local stack provides HTTP only. A public target must supply HTTPS, trusted forwarding headers, runtime secrets, restart/rollout behavior, persistence in external PostgreSQL, and monitoring. Container support was not exercised in this workspace because Docker/Trivy are unavailable.

Configure a cron scheduler to request /api/cron/reset-credits with Authorization: Bearer CRON_SECRET. Vercel's checked-in daily schedule does not configure an external Node/container scheduler. Resets use a lock and due-date check and currently process at most 500 due accounts per call; schedule additional batches as the user base grows.

## Release evidence

Require successful strict lint, types, the full CI suite, production build/smoke, dependency/container audits, Jenkins controller validation and a demo run, and live staging acceptance. Check mobile/desktop layout, keyboard focus, form error recovery, report history, account preferences, billing, and credit balances using a real staging account.

Record backup/restore evidence and monitor failed/stale jobs, provider errors/costs, Redis outages, webhook failures, DB connections, and cron backlog. /api/health is a DB-free liveness endpoint; it does not prove database/queue readiness. Separate uptime from dependency monitoring.

The selected domain is validore.tech. A Render Free beta blueprint is prepared; the hosting account, DNS routing, Jenkins controller, and production integrations are not configured yet. [Implementation status](IMPLEMENTATION_STATUS.md) lists completed changes and checks still pending.
