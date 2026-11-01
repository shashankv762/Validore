# Production setup

The release target is Vercel at `https://validore.tech`. Follow [GO_LIVE.md](GO_LIVE.md) for the account and DNS steps. The source has durable validation jobs, billing availability controls, transactional credits, and refreshed UI/branding. Jenkins and GitHub CI automation have been removed; verification and releases are manual. Public launch still requires hosted integration checks.

## Configuration

Use .env.example as the field reference. Keep .env.local ignored and out of source control or a Docker context. The earlier release evidence records private credentials shared during setup; their rotation remains unverified. Rotate any such credentials in their provider dashboards and update dependent services together. A public publishable/anon key is intended for the browser; a service-role/secret key and DB credentials are server-only.

| Setting | Requirement |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Real public project configuration at build time; a legacy public NEXT_PUBLIC_SUPABASE_ANON_KEY is also supported; never use a private key |
| NEXT_PUBLIC_APP_URL | Exact HTTPS origin in production; rebuild when it changes |
| DATABASE_URL | Target Supabase transaction-pooler string for Vercel; URL-encode reserved password characters; the app sets prepare: false |
| DB_MAX_CONNECTIONS | Start with 2 on Vercel (code default 5); total instances times pool size must fit database capacity |
| UPSTASH_REDIS_REST_URL / TOKEN | Production abuse controls; unavailable/missing Redis blocks costly calls and signup |
| AI provider keys | Working `PIXROUTER_API_KEY`; OpenCode/OpenRouter are optional fallbacks after access/quota is restored |
| Free model policy | `AI_FREE_ONLY=true`, gateway enable/order `pixrouter,opencode,openrouter`, rotation and direct paid priority disabled; use the curated IDs in `.env.example` |
| `PIXROUTER_REQUESTS_PER_HOUR` | Default 55, below the observed account maximum of 60 per rolling hour; catalog and generation calls share Redis capacity |
| Search keys | Tavily, Serper and SerpAPI are optional sparse-evidence fallbacks after public search; combined defaults are 2/report and 30/day, cached for six hours |
| ENCRYPTION_KEY | Exactly 64 hex characters, securely generated; required to store/use custom provider keys |
| VALIDATION_RUNNER | inngest for public operation; local is rejected for production validation |
| VALIDATION_GLOBAL_CONCURRENCY | Default 2; keep low on free hosting and raise only with capacity/provider quotas |
| INNGEST_EVENT_KEY / SIGNING_KEY | Target environment's queue keys; do not enable INNGEST_DEV in production |
| CRON_SECRET | Strong private bearer token for the daily job that resets due credit allowances and prunes expired records |
| Stripe secret / webhook secret / price IDs | Secret and webhook keys enable credit checkout; each subscription also needs its configured price ID; rebuild to update public plan availability |

Generate a random encryption key with a trusted password/secret manager or crypto tool and store it outside source control. Keep its previous value available while re-encrypting any existing saved keys during rotation; changing it immediately makes old keys unreadable. Legacy CBC keys can be read only with their original encryption key; new writes use authenticated AES-GCM. Plaintext saved key values are rejected.

The service-role env slot is reserved for administration; ordinary app routes use Supabase Auth plus the private PostgreSQL connection and do not require that key.

## Database rollout

Use a separate staging database and take a verified backup before changing an existing deployment. The repository does not contain a complete versioned baseline migration history. For a fresh development database, review Drizzle's proposed schema, apply npm run db:push, and run npm run db:seed. For an existing database, review/apply SQL deltas in order after the base tables exist:

1. drizzle/0000_credit_payment_idempotency.sql adds unique provider-payment references.
2. drizzle/0001_application_access_and_indexes.sql enables RLS, revokes application-table access from PUBLIC/anon/authenticated, and adds report/job/history indexes.
3. drizzle/0002_free_model_default.sql changes the default AI preference for new accounts to free_models; existing preferences are preserved. The API also normalizes legacy paid preferences while free-only mode is active.
4. drizzle/0003_founder_interviews_research.sql adds private founder interviews and durable public research, indexes, bounded JSON state, RLS and browser-role revocations. **Apply before serving this application revision.** It does not modify existing customer records.

These files are reviewed SQL deltas, not an automatically journaled migration chain. The second migration targets Supabase roles and is required even after db:push because the explicit grants are not represented by that command. Unique indexes deliberately fail if duplicate historical payments/reports need reconciliation. Inspect those rows and reconcile accounting; do not automatically delete customer records to satisfy an index.

Browser clients use Supabase Auth only. Application tables are accessed through Next.js APIs with ownership checks. Confirm that DATABASE_URL uses the table owner or a separately reviewed server role with the required grants/RLS policy. Do not use FORCE ROW LEVEL SECURITY blindly or apply browser ownership policies invented for a different access architecture.

Before launch, test anon and authenticated Data API SELECT/INSERT/UPDATE/DELETE denial on every application table, and successful authorized server operations. Inspect any live views, RPC functions, grants, storage buckets, and schemas beyond this repository. RLS source declarations do not prove the current hosted database is protected. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

Seeds include synthetic crowdfunding campaigns. They must remain labeled synthetic rather than being presented as historical research.

`npm run data:refresh` is a separate direct-public-data command: it writes the local 48-observation snapshot and provenance, without loading credentials, using a model or accessing PostgreSQL. `npm run db:seed:research` explicitly copies a reviewed, unexpired snapshot into the configured database after migration `0003`. The public bundle is also available without this seed. Keep `RESEARCH_STORE_ENABLED=true`; disabling it disables both bundled and durable research retrieval. Read [DATA_SOURCES.md](DATA_SOURCES.md) for country/indicator coverage and licensing limitations.

## Private founder interviews and retention

The interview API checks authenticated account and idea ownership on every request. Starting requires verified email and the current processing notice. Answer updates lock the idea and interview, save the answer before AI work, and use an optimistic version check for the model's later response. Identical retries do not consume another tailoring call. A changed brief invalidates its old interview for future analysis; users can review and clear it.

There are at most 12 answers, 3,000 characters each, eight interview mutations per minute and 60 tailoring attempts per day per account. Each tailoring attempt has a 22-second budget and at most two model calls, with no tools. Failure or exhausted daily capacity keeps the saved answer and guided questions. Provider limits apply even though the interview does not deduct workspace validation credits.

Private context is owner-scoped, bounded as valid JSON, and attached only to final tool-free analysis. Research calls use a separate redacted public-descriptor brief, so downstream specialists do not send private findings back through web tools. Public source persistence accepts only independently read, allowlisted official pages and structured observations; model summaries, private answers, snippets and arbitrary competitor pages are not durable shared records.

Account export is paginated, owner-scoped and private/no-store. Profile exports omit credentials and authentication/billing identifiers. Users can clear an interview; full account erasure and provider/backups cleanup require the operator's verified privacy-request workflow. Configure retention in Inngest because durable preparation includes private context. Deleting an interview does not rewrite existing reports or invalidate already running jobs; address those separately for a complete erasure request.

The daily maintenance cron prunes public records more than 90 days past expiry and browser activity more than 30 days old, at most 1,000 rows each per run. Monitor its success and catch-up backlog. Source expiry is a retrieval rule, not proof that every provider's copy has been deleted.

## Supabase authentication

Configure Site URL to the public origin and allow the app's /auth/callback redirect for confirmation and recovery, plus explicit localhost/staging origins as needed. Use production SMTP/delivery settings and test registration, confirmation, sign-in, expired reset links, reset completion, sign-out, and refresh cookies. The server uses a PKCE callback before the reset page; custom email templates must support that flow.

The included Nginx ingress replaces incoming forwarding headers. If deploying behind another ingress, configure equivalent trusted client-IP handling before relying on the signup IP quota. Signup retains the existing quota of three registrations per network in seven days; review that product policy for shared college/company networks before wider onboarding.

The app's updated logo is included on sign-in, signup, recovery and workspace screens. Google's external consent screen needs the project owner to upload `public/logo/validore-google-consent.png` in Google Auth Platform's Branding settings. See the exact callback, origin and branding steps in [GO_LIVE.md](GO_LIVE.md#6-finish-authentication-and-payments).

## Durable AI jobs

Set VALIDATION_RUNNER=inngest and configure the target Inngest environment to serve /api/inngest with matching signing/event keys. If INNGEST_SERVE_ORIGIN is set, use the reachable Vercel/canonical origin, not the old Render hostname. Drain the old deployment's queued work before switching the shared app endpoint.

Full validation has nine specialists: market, customer, competition, finance, risk, source review, product, growth and synthesis. Lite has market, customer and synthesis. Fourteen tools are assigned by role across the team, including dated market memory and official World Bank indicators. Both workflows use separate durable preparation, research, agent and persistence steps. Inngest checkpointing is disabled so separate steps are not batched into one long invocation. Completed results are reused on replay. Cached preparation contains idea fields and references, never private API keys. Individual interrupted steps can still repeat provider spending; durable steps do not guarantee exactly-once external API calls.

The /api/inngest handler and AI module routes declare maxDuration=300. Each specialist has a 240-second overall budget, at most six model calls, a 60-second research phase and individual final-report attempts capped at 120 seconds (150 for synthesis). SDK retries are disabled. Enable Vercel Fluid Compute and verify real execution under the chosen plan's limits. Check enqueue, retries, terminal failure refund, duplicate event handling, partial results, and report persistence in staging. Local after() work depends on the process/request lifetime and is only for development. See [Agent architecture](AI_AGENTS.md).

PixRouter's current account capacity supports a controlled pilot. Requests across workers share the Redis budget and fail closed when it cannot be checked. Keyed-search budgets also fail closed. Missing or exhausted providers return a controlled error/partial result through the existing credit/refund lifecycle. Before wider launch, restore working OpenRouter/OpenCode fallback access or arrange enough provider capacity, then measure real concurrent workloads. [AI_MODELS.md](AI_MODELS.md) records tested IDs and account limits.

## Report documents

Authenticated owners can export saved validation, canvas, pricing, crowdfunding and pitch content as paginated PDF and editable DOCX, including on the free plan. Export queries enforce ownership and the selected module/version; requests are limited to eight per minute and responses are private/no-store. Oversized documents are bounded and visibly marked when abbreviated.

`next.config.ts` traces the Noto font files and `public/logo/validore-report.png` into the export functions. Retain those assets and `public/fonts/NOTO-LICENSE.txt` in the repository. Word documents use Arial for broad office compatibility. Test both formats on the hosted build; local export checks do not establish Vercel asset availability or Microsoft Word behavior.

The Reports and Research team pages also link to public blank PDF/Word templates. Their source is `src/lib/exports/template.ts`; regenerate both files with `npm run templates:build` when the structure or renderers change, then include `public/templates/` in the release. The [template guide](REPORT_TEMPLATE.md) describes the five-page structure and document review requirements.

## Billing

Configure Stripe test mode in staging first, including recurring prices for the displayed plans and the Customer Portal configuration. Subscribe the signed webhook endpoint /api/webhooks/stripe to checkout.session.completed, checkout.session.async_payment_succeeded, and customer.subscription.created/updated/deleted.

Plan checkout stores server-created customer ownership, serializes requests per account, reuses open plan checkout, and routes existing subscriptions to the portal. Only signed, paid credit events matching server catalogue amounts/currency grant credits. Duplicate provider references must be protected by the SQL indexes before accepting payments. A checkout return URL is not proof of payment.

Test delayed/duplicate/out-of-order events, successful/failed payments, portal changes, period-end cancellation, renewal credits, and invoice failure behavior. Confirm the live recurring price amounts match the displayed plan prices. Refund/chargeback reconciliation remains an operational requirement; automatic payment-refund entitlement reversal is not implemented.

Razorpay checkout remains unavailable. Its legacy webhook supports captured credits and activation, but a complete renewal/cancellation/refund lifecycle is not implemented. Keep Razorpay sales disabled until that flow has independent staging verification.

## Vercel and optional local containers

Vercel hosts the frontend and backend routes from one project. Its checked-in daily cron calls the credit-maintenance route with CRON_SECRET. Do not configure a second scheduler on the old host after cutover. Git pushes do not automatically deploy; invoke the reviewed release manually.

For local Docker development with configured external services:

~~~powershell
docker compose --env-file .env.local up --build --wait
~~~

Nginx is on http://localhost:8081, with the app bound to loopback port 3000. Choose NEXT_PUBLIC_APP_URL to match the browser origin used for authentication. This local stack provides HTTP only. A public target must supply HTTPS, trusted forwarding headers, runtime secrets, restart/rollout behavior, persistence in external PostgreSQL, and monitoring. Container support was not exercised in this workspace because Docker/Trivy are unavailable.

Configure a cron scheduler to request /api/cron/reset-credits with Authorization: Bearer CRON_SECRET. Vercel's checked-in daily schedule does not configure an external Node/container scheduler. Resets use a lock and due-date check and currently process at most 500 due accounts per call; schedule additional batches as the user base grows.

## Release evidence

Run strict lint, generated route types/TypeScript, the manual test suite, production build, standalone smoke, and the production dependency audit. Use the selective live provider/workflow commands in [AI_AGENTS.md](AI_AGENTS.md) within the available quota. Container checks are relevant only if you choose to use Docker. Complete live staging acceptance for mobile/desktop layout, keyboard focus, form recovery, report history, account preferences, billing, and credit balances. No CI workflow is required or configured.

Record backup/restore evidence and monitor failed/stale jobs, provider errors/costs, Redis outages, webhook failures, DB connections, and cron backlog. /api/health is a DB-free liveness endpoint; it does not prove database/queue readiness. Separate uptime from dependency monitoring.

Vercel setup, final-domain DNS/TLS, and the current hosted integration checks remain pending. Prior Render/database acceptance is historical evidence and must not be presented as verification of the new Vercel release. [Implementation status](IMPLEMENTATION_STATUS.md) records the completed local checks and remaining limits.
