# Production setup

For the ten-user prototype, follow [the Render Free guide](FREE_PROTOTYPE_DEPLOYMENT.md). The current domain layout is **static marketing at `https://validore.tech` and the SaaS at `https://validore.onrender.com`**; see [the publishing guide](../static%20webpage/README.md). Keep app/auth/Inngest origins on the SaaS host. GitHub Actions verifies pushes and pull requests; deployment to the existing Render service remains manual. Public launch requires hosted integration checks.

## Configuration

Use `.env.production.example` as a reference for Render settings. Store private keys and database credentials in Render's environment settings. The Supabase publishable key is the browser-facing credential.

| Setting | Requirement |
| --- | --- |
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Real public project configuration at build time; a legacy public NEXT_PUBLIC_SUPABASE_ANON_KEY is also supported; never use a private key |
| NEXT_PUBLIC_APP_URL | Exact HTTPS origin in production; rebuild when it changes |
| DATABASE_URL | Supabase transaction pooler connection string. URL-encode reserved password characters. The app sets `prepare: false`. |
| DB_MAX_CONNECTIONS | Start with 2 connections per Render instance. Size the pool to fit the database capacity. |
| UPSTASH_REDIS_REST_URL / TOKEN | Production abuse controls; unavailable/missing Redis blocks costly calls and signup |
| AI provider keys | Working `PIXROUTER_API_KEY`; OpenCode/OpenRouter are optional fallbacks after access/quota is restored |
| Free model policy | `AI_FREE_ONLY=true`, gateway enable/order `pixrouter,opencode,openrouter`, rotation and direct paid priority disabled; use the curated IDs in `.env.example` |
| `PIXROUTER_REQUESTS_PER_HOUR` | The default budget is 55 per hour. Catalog and generation calls share that budget through Redis. |
| Search keys | Tavily, Serper and SerpAPI are optional sparse-evidence fallbacks after public search; combined defaults are 2/report and 30/day, cached for six hours |
| ENCRYPTION_KEY | Exactly 64 hex characters, securely generated; required to store/use custom provider keys |
| VALIDATION_RUNNER | inngest for public operation; local is rejected for production validation |
| VALIDATION_GLOBAL_CONCURRENCY | Default 2; keep low on free hosting and raise only with capacity/provider quotas |
| INNGEST_EVENT_KEY / SIGNING_KEY | Target environment's queue keys; do not enable INNGEST_DEV in production |
| CRON_SECRET | Strong private bearer token for the daily job that resets due credit allowances and prunes expired records |
| Stripe secret / webhook secret / price IDs | Secret and webhook keys enable credit checkout; each subscription also needs its configured price ID; rebuild to update public plan availability |

Generate a random encryption key with a trusted password/secret manager or crypto tool and store it outside source control. Keep its previous value available while re-encrypting any existing saved keys during rotation; changing it immediately makes old keys unreadable. Legacy CBC keys can be read only with their original encryption key; new writes use authenticated AES-GCM. Plaintext saved key values are rejected.

The service-role env slot is reserved for administration; ordinary app routes use Supabase Auth plus the private PostgreSQL connection and do not require that key.

New Google, email-confirmation, and direct Supabase identities complete `/auth/complete-signup` before an application profile or initial credits are created. This server POST verifies the authenticated email, current terms acceptance, permanent email address, and the shared `validore:registration_ip` weekly quota. It does not trust Auth user metadata as registration approval. Email signup has a separate pre-send quota to bound confirmation requests. Missing trusted ingress IP or Redis fails closed in production; configure `TRUSTED_PROXY_HOPS` for the actual ingress chain and `SIGNUP_MAX_PER_IP_WEEK` for the pilot network. Existing application profiles sign in without this new-account gate. Configure Supabase's own signup controls separately: the app admission gate prevents workspace/credit creation but does not disable the provider's public Auth endpoints.

Report links under `/share/` require the authenticated application owner. Their responses are private/no-store and use generic non-indexable metadata; a random token alone does not authorize access.

## Database rollout

Use a separate staging database and take a verified backup before changing an existing deployment. The repository does not contain a complete versioned baseline migration history. For a fresh development database, review Drizzle's proposed schema, apply npm run db:push, and run npm run db:seed. For an existing database, review/apply SQL deltas in order after the base tables exist:

1. drizzle/0000_credit_payment_idempotency.sql adds unique provider-payment references.
2. drizzle/0001_application_access_and_indexes.sql enables RLS, revokes application-table access from PUBLIC/anon/authenticated, and adds report/job/history indexes.
3. drizzle/0002_free_model_default.sql changes the default AI preference for new accounts to free_models; existing preferences are preserved. The API also normalizes legacy paid preferences while free-only mode is active.
4. drizzle/0003_founder_interviews_research.sql adds private founder interviews and durable public research, indexes, bounded JSON state, RLS and browser-role revocations. **Apply before serving this application revision.** It does not modify existing customer records.
5. drizzle/0004_rewarded_ads.sql adds the nonnegative earned balance, reward sessions, replay-protection index and browser-role restrictions. **Required before this release even with ads disabled**, because account queries include the new column. It does not rewrite plan or purchased balances.
6. drizzle/0005_credit_cycle_start.sql adds explicit cycle start and monthly-pool consumption, preserving existing balances and ledger history. The additive backfill uses the known cycle's recorded monthly debits/refunds and a conservative balance-derived floor; it does not treat purchased/earned spending as monthly spending. Paid starts are reconciled from Stripe's exact period when credit operations next run. Apply before starting the updated application.
7. drizzle/0006_admin_command_center.sql adds the pinned owner grant, account status, cycle allowance snapshot, configurable plans, private platform settings and an admin audit log. Apply before deploying the command center. Existing Free PDF access is preserved once; repeated application retains saved admin plan choices.
8. drizzle/0007_starting_daily_manual_plans.sql adds one-time signup/daily-claim indexes and updates only the legacy, unedited Free allocation policy; existing user balances and ledger entries remain unchanged.
9. drizzle/0008_customer_feedback.sql adds private feedback records and analyses, ownership indexes, bounded content, RLS and browser-role restrictions.
10. drizzle/0009_planning_module_requests.sql adds the durable planning request registry and replay/lease constraints.
11. drizzle/0010_planning_stage_checkpoints.sql adds bounded saved planning stages for interrupted generation.
12. drizzle/0011_validation_entitlement_snapshot.sql adds a nullable entitlement snapshot; existing jobs retain their legacy runner behavior.
13. drizzle/0012_public_research_focus.sql adds the optional, bounded public research topic without copying existing private idea fields.
14. drizzle/0013_planning_context_snapshot.sql adds bounded saved planning context.
15. drizzle/0014_validation_dispatch_outbox.sql adds dispatch timestamps and leases for durable validation delivery.
16. drizzle/0015_ai_execution_leases.sql adds private, expiring feedback-analysis leases and their index.
17. drizzle/0016_subscription_prices.sql sets saved Premium and Max Premium monthly prices to 800 and 2,000 USD cents. It preserves credits, limits, Stripe price IDs and price history, but intentionally replaces saved subscription amounts. Review the matching provider prices before enabling paid checkouts; this SQL does not change a Stripe subscription or create provider prices.

**Apply outstanding deltas through 0015 before serving this application revision, and 0016 before enabling its paid checkouts.** The Render build and start commands do not apply SQL. After confirming the intended database target, run `npm run db:verify`; it reads `.env.local`. The DB-free `/api/health` route proves process liveness only, so a passing Render health check does not prove schema readiness. Verify authenticated account and idea loading, then the validation workflow after rollout.

Plan scores are rounded to bounded whole points before PostgreSQL persistence. Credit debits record cycle start, tier and subscription identity. Paid renewals and signed Stripe events use the same account lock and authoritative period start/end, so repeated events preserve spending in that period. An expired paid period must be reconciled before new plan credits become available; an unavailable provider returns a recoverable request failure. Purchased and earned credits retain their source on refunds. Verify delayed/duplicate renewal, 28-/30-/31-day periods and cancellation with staging billing before enabling sales.

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

Verify the client IP supplied by Render before relying on the signup IP quota. Review `TRUSTED_PROXY_HOPS` if you add another proxy. `SIGNUP_MAX_PER_IP_WEEK` defaults to three registrations per network in seven days, accepts 1–20, and can be set to ten for the shared-network pilot. Invalid settings fall back to three.

The app's updated logo is included on sign-in, signup, recovery and workspace screens. Google's external consent screen needs the project owner to upload `public/logo/validore-google-consent.png` in Google Auth Platform's Branding settings. See the [Render sign-in setup](FREE_PROTOTYPE_DEPLOYMENT.md#6-finish-sign-in-and-email) for the OAuth origins and callback.

## Durable AI jobs

Set VALIDATION_RUNNER=inngest and configure the target Inngest environment to serve /api/inngest with matching signing/event keys. INNGEST_SERVE_ORIGIN must be the active host/canonical origin. Drain the old deployment's queued work before switching the shared app endpoint. On Render Free, use global concurrency one and `CREDIT_MAINTENANCE_RUNNER=inngest`, then resync the existing app after deployment. Confirm all three functions are registered: `validate-startup`, `daily-credit-maintenance` and `reconcile-validation-queue`. Queue reconciliation runs every five minutes to reap expired jobs and retry dispatching admitted pending jobs; it is registered only when `VALIDATION_RUNNER=inngest`. The daily maintenance function requires `CREDIT_MAINTENANCE_RUNNER=inngest`.

Full validation has nine specialists: market, customer, competition, finance, risk, source review, product, growth and synthesis. Lite has market, customer and synthesis. Fourteen tools are assigned by role across the team, including dated market memory and official World Bank indicators. Both workflows use separate durable preparation, research, agent and persistence steps. Inngest checkpointing is disabled so separate steps are not batched into one long invocation. Completed results are reused on replay. Cached preparation contains idea fields and references, never private API keys. Individual interrupted steps can still repeat provider spending; durable steps do not guarantee exactly-once external API calls.

The application retains explicit AI call/step deadlines. Each specialist has a 240-second overall budget, at most six model calls, a 60-second research phase and individual final-report attempts capped at 120 seconds (150 for synthesis). SDK retries are disabled. Verify real execution under production CPU, memory and Inngest request limits. Check enqueue, retries, terminal failure refund, duplicate event handling, partial results, and report persistence in staging. Local after() work depends on the process/request lifetime and is only for development.

Requests across workers share the Redis budget and fail closed when it cannot be checked. Keyed-search budgets also fail closed. Missing or exhausted providers return a controlled error/partial result through the existing credit/refund lifecycle. Before wider launch, restore working OpenRouter/OpenCode fallback access or arrange enough provider capacity, then measure real concurrent workloads.

## Report documents

Authenticated account owners can export their saved validation, canvas, pricing, crowdfunding and pitch content as paginated PDF and editable DOCX. PDF access follows the configured plan benefit and is enabled for Free accounts by default; DOCX remains available across plans. Export queries enforce ownership and the selected module/version; requests are limited to eight per minute and responses are private/no-store. Oversized documents are bounded and visibly marked when abbreviated.

Retain the document fonts, their licenses and the logo in `public/`. The standalone build includes these assets. Word documents use Arial for broad office compatibility. Test both formats on the hosted app, including documents with non-Latin text.

The Reports and Research team pages also link to public blank PDF/Word templates. Their source is `src/lib/exports/template.ts`; regenerate both files with `npm run templates:build` when the structure or renderers change, then include `public/templates/` in the release. The [template guide](REPORT_TEMPLATE.md) describes the five-page structure and document review requirements.

## Billing

Configure Stripe test mode in staging first, including recurring prices for the displayed plans and the Customer Portal configuration. Subscribe the signed webhook endpoint /api/webhooks/stripe to checkout.session.completed, checkout.session.async_payment_succeeded, and customer.subscription.created/updated/deleted.

Apply `drizzle/0016_subscription_prices.sql` to update saved plan prices before enabling paid checkouts. Configure a flat monthly Stripe Price with USD as the default currency and INR as a currency option for each paid plan. Premium uses 800 USD cents and 79,900 paise. Max Premium uses 2,000 USD cents and 199,900 paise. Set the new IDs in **Plans & limits**, or use `STRIPE_PREMIUM_PRICE_ID` and `STRIPE_MAX_PREMIUM_PRICE_ID` where no owner override is saved. If existing subscriptions use environment-only IDs, save the new IDs in the console before replacing the environment values so the app records the previous IDs for renewals. [Stripe price setup](https://docs.stripe.com/products-prices/manage-prices#present-local-currencies)

Plan checkout stores server-created customer ownership, serializes requests per account, reuses open plan checkout, and routes existing subscriptions to the portal. Only signed, paid credit events matching server catalogue amounts/currency grant credits. Duplicate provider references must be protected by the SQL indexes before accepting payments. A checkout return URL is not proof of payment.

Test delayed/duplicate/out-of-order events, successful/failed payments, portal changes, period-end cancellation, renewal credits, and invoice failure behavior. Confirm the hosted Stripe Checkout amount in each currency before enabling sales. Refund/chargeback reconciliation remains an operational requirement; automatic payment-refund entitlement reversal is not implemented.

Razorpay checkout remains unavailable. Its legacy webhook supports captured credits and activation, but a complete renewal/cancellation/refund lifecycle is not implemented. Keep Razorpay sales disabled until that flow has independent staging verification.

## Daily maintenance

For Render, `CREDIT_MAINTENANCE_RUNNER=inngest` registers the midnight-UTC Inngest maintenance function; no separate paid Render Cron Job is needed. Other Node hosts can use the same function or a scheduler calling /api/cron/reset-credits with Authorization: Bearer CRON_SECRET. Use only one scheduler. Resets use a lock and due-date check and process at most 500 due accounts per call; schedule additional batches as the user base grows. Abandoned ad sessions are pruned more than seven days after expiry, in batches of 1,000; successful references are retained for accounting.

## Release evidence

GitHub CI runs strict lint, generated route types/TypeScript, regressions, real PostgreSQL concurrency/migrations, the production dependency audit, `npm run build:deploy`, `npm run smoke:production`, and static marketing JavaScript checks. Deploy its exact passing commit to Render, then verify the hosted revision, registration, queue, report persistence, exports and balances. Billing and rewarded ads require independent configured-provider acceptance before enabling sales or ad delivery.

Record backup/restore evidence and monitor failed/stale jobs, provider errors/costs, Redis outages, webhook failures, DB connections, and cron backlog. /api/health is a DB-free liveness endpoint; it does not prove database/queue readiness. Separate uptime from dependency monitoring.

The Render configuration enables PixRouter. Check account quotas and authentication before enabling other gateways.
