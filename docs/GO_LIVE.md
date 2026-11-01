# Publish Validore on Cloudflare and validore.tech

**Alternative architecture only.** The current requested setup uses a separate static marketing website on `validore.tech` and the SaaS on `validore.onrender.com`. Follow [the static website publishing guide](../static%20webpage/README.md) for that setup. Do not attach the Worker below to `validore.tech` while that domain serves the marketing site. Cloudflare **Pages Free can host the new static folder**; the full SaaS described below still needs a server runtime.

This is the **paid Cloudflare option**. For the requested ten-user prototype with a $0 hosting budget, use [FREE_PROTOTYPE_DEPLOYMENT.md](FREE_PROTOTYPE_DEPLOYMENT.md). Database migration 0004 is required on either host, even when ads are disabled.

Use **Cloudflare Workers with Static Assets**, via OpenNext, for this full Next.js application. The Worker serves pages, APIs, authentication callbacks, exports and the Inngest endpoint on one domain. Supabase, Upstash, Inngest and AI providers stay separate. Domain registration/renewal stays with Namify/.TECH; Cloudflare becomes the DNS provider.

**Do not create a Pages project for the main app or upload .next as a Pages output directory.** Pages static exports cannot run its server routes. The downloadable HTML portfolio is static and can independently use Pages. A Pages frontend plus a separate API Worker would require an application rewrite.

Cloudflare's current default Next.js recommendation is beta vinext. This release uses the maintained [OpenNext path](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/) to retain the installed Next.js runtime. Review [migration verification](CLOUDFLARE_MIGRATION.md); local checks do not prove hosted database, authentication, payments or queue behavior.

## 1. Accounts and costs

1. Sign in to [Cloudflare](https://dash.cloudflare.com/) and [Namify/.TECH](https://namify.get.tech/dashboard/manage-domain).
2. Use the **Free website/DNS plan** for the domain. This is separate from the Workers subscription.
3. This guide uses **Workers Paid**, currently from **US$5/month per account plus usage**, before tax, with the checked-in 300,000 ms CPU allowance. Free allows only 10 ms CPU/request; SSR and report/export workloads need hosted CPU testing before a Free deployment can be recommended. Both plans now allow 64 MiB uncompressed, with no compressed size limit, following the [4 September 2026 change](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/). This app fits that bundle limit; the old 3 MB/10 MB comparison is obsolete. Network/AI waiting time is distinct from CPU time.
4. Review [current pricing](https://developers.cloudflare.com/workers/platform/pricing/) and [limits](https://developers.cloudflare.com/workers/platform/limits/). Static asset requests are free; dynamic requests and CPU have allowances/overages. Configure usage notifications. The per-invocation CPU cap is not a monthly spending cap. External services have separate prices/quotas.

No plan has been purchased, account configured, or deployment made by these repository changes. No R2, KV, D1, Durable Object or separate Pages project is required. Public prerendered pages use the build-time asset cache; research caches use Redis/PostgreSQL. Configure a writable cache and revalidation queue before adding ISR later.

## 2. Prepare build and runtime configuration

Use Node.js 24 LTS and run commands from the project root:

~~~powershell
npm ci
~~~

OpenNext recommends Linux/WSL. The Cloudflare build uses webpack to avoid Turbopack's traced Windows junctions.

For production, use a clean checkout with no development .env.local. Copy .env.production.example to an ignored .env.production.local and fill it with production settings. **Next.js gives .env.local priority over .env.production.local.** Conflicting development settings can embed the wrong domain/project. Shell environment variables take priority over both files. Never commit a filled environment file.

| Variable | Production setting |
| --- | --- |
| NEXT_PUBLIC_APP_URL | https://validore.tech |
| NEXT_PUBLIC_SUPABASE_URL | Real Supabase project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Public publishable key; legacy public NEXT_PUBLIC_SUPABASE_ANON_KEY is also supported |
| APP_ENV | production; preview at build time blocks staging search indexing |
| DATABASE_URL | Supabase **transaction pooler** connection string with URL-encoded password and TLS (sslmode=require); prepare:false is already set |
| DB_MAX_CONNECTIONS | Start at 2; each concurrent Worker request gets its own pool |
| UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN | Required production rate limits, signup, concurrency and budgets |
| VALIDATION_RUNNER | inngest |
| VALIDATION_GLOBAL_CONCURRENCY | Start at 2 |
| INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY | Matching keys for the target Inngest environment |
| INNGEST_SERVE_ORIGIN | https://validore.tech after DNS; the exact temporary Worker origin before cutover |
| CRON_SECRET | Strong random secret for daily maintenance |
| ENCRYPTION_KEY | Exactly 64 hex characters; preserve the current key when existing encrypted customer keys must remain readable |
| TRUSTED_PROXY_HOPS | 1; the Worker replaces forwarding headers with the Cloudflare visitor IP |
| AUTH_ALLOWED_ORIGINS | Optional exact HTTPS origins, comma-separated; only your specific temporary Worker hostname if testing there |
| RESEARCH_STORE_ENABLED | true after applying the SQL deltas |
| AI provider settings | Working keys, enabled gateways and model allowlists from .env.example; keep AI_FREE_ONLY=true unless intentionally enabling paid models |
| BUILD_COMMIT_SHA | Optional reviewed Git revision for /api/health |

Leave INNGEST_DEV unset in production. The service-role Supabase key is not needed for ordinary app authentication. Leave optional billing/search keys empty until configured. See .env.example for all model lists and settings.

**Build settings and Worker runtime settings are separate.** NEXT_PUBLIC_* values are embedded at build time and must match the runtime settings. Changing these, APP_ENV, or public billing availability requires a rebuild. Private keys must never use a NEXT_PUBLIC_ prefix. A local .env file is not an automatic upload of runtime secrets.

Authenticate the CLI:

~~~powershell
npx wrangler login
npx wrangler whoami
npx wrangler secret put DATABASE_URL
~~~

Wrangler prompts for the secret without putting it in shell history. If validore does not exist, it may offer to create the named Worker. Add the remaining values in **Workers & Pages → validore → Settings → Variables and Secrets**. Mark database credentials, tokens, AI/payment keys, CRON_SECRET and ENCRYPTION_KEY as **Secrets**; public configuration and non-sensitive options/model lists can be variables. Alternatively repeat wrangler secret put NAME for each secret. Never pass values as command-line arguments.

With multiple accounts, explicitly set CLOUDFLARE_ACCOUNT_ID to the intended account. keep_vars:true preserves dashboard variables on CLI deployments; Wrangler also retains secrets. Copy production values only, not local URLs or developer settings.

## 3. Database and services

Follow [Production setup](PRODUCTION_SETUP.md) for the base schema, reviewed SQL deltas 0000 through 0003, server role, browser-role restrictions, backups and seeds. **Apply 0003_founder_interviews_research.sql before serving this revision.** Existing customer databases need reviewed migrations, not a blind db:push.

Copy the reachable transaction-pooler hostname/port from Supabase's Connect panel. Do not guess a hostname or substitute a direct IPv6-only address. This setup does not require Hyperdrive; evaluate it separately if needed. Validate email/Google configuration, Redis access and Inngest keys using isolated staging services. Ollama/SearXNG need separate reachable hosting; Worker localhost cannot reach your personal computer.

## 4. Build, preview and publish manually

~~~powershell
npm run verify:release-files
npm run lint
npm run typecheck
npm test
npm run build:cloudflare
npm run check:cloudflare
npm run smoke:cloudflare
~~~

build:cloudflare generates .open-next/worker.js and .open-next/assets. check:cloudflare performs a dry-run bundle and reports upload size without publishing. smoke:cloudflare starts and stops a local Worker, checks built routes and renders synthetic PDF/Word exports without customer data. Do not edit/commit generated output.

For local Workers preview, create an ignored .dev.vars with **staging** runtime values. Build first with matching public values and http://localhost:8787 as the app origin; allow that staging callback in Supabase. Then:

~~~powershell
npm run preview:cloudflare
~~~

Open Wrangler's printed loopback URL, usually http://localhost:8787. This runs the Workers runtime locally. npm run dev remains the ordinary Next.js development server. Do not use --remote with production services for a local test.

After rebuilding with production settings and saving runtime secrets:

~~~powershell
npm run deploy:cloudflare
~~~

**This is the publishing command.** It rebuilds/uploads the Worker and generated assets, and configures the daily cron. It does not run migrations or upload environment files. Record the printed https://validore.<your-subdomain>.workers.dev URL and deployment version.

Test the temporary hostname before DNS cutover. To authenticate there, add its exact HTTPS origin to AUTH_ALLOWED_ORIGINS and its /auth/callback URL to Supabase. Never allow every *.workers.dev hostname. Local preview does not enforce all production account/CPU/memory limits.

Manual releases are the default; no Git integration/CI is required. Keep automated builds disconnected unless deliberately enabling them. If using Workers Builds later, select a **Worker**, build command npm run build:cloudflare, deploy command npx opennextjs-cloudflare deploy, Node 24, and configure both build variables and runtime secrets. There is no Pages output-directory setting.

## 5. Cloudflare DNS and your custom domain

1. In Cloudflare choose **Add a domain/site**, enter validore.tech, and select the Free website/DNS plan. Registration/renewal remains at Namify/.TECH.
2. Import/review existing DNS. Preserve working web records until cutover and **MX, SPF, DKIM, DMARC and unrelated TXT records**. Record the current zone/nameservers for rollback. Keep mail records DNS-only. If DNSSEC is enabled, remove/disable the old registrar DS record before changing nameservers; enable Cloudflare DNSSEC and add its new DS record after activation.
3. Cloudflare assigns two authoritative nameservers. In Namify/.TECH's **Nameservers** settings, replace the old nameservers with exactly those two. This is a nameserver change, not an A-record edit. After activation, manage DNS in Cloudflare. Wait for the zone to show **Active**; propagation can take 24–48 hours.
4. Go to **Workers & Pages → validore → Settings → Domains & Routes → Add → Custom domain**. Add validore.tech and www.validore.tech. Resolve conflicting old web A/AAAA/CNAME records for those names only as instructed. Cloudflare creates Worker DNS records and HTTPS certificates. Do not guess an IP or manually CNAME the apex to workers.dev.
5. Before the next CLI release, persist both domains in wrangler.jsonc: add a comma after keep_vars:true and uncomment the documented routes array containing both custom_domain:true entries. Dashboard and repository routing should agree.
6. Verify https://validore.tech and the certificate. Verify https://www.validore.tech/some-path?x=1 redirects to the same path/query on the apex. The Worker supplies the 308 redirect. Do not attach a competing Pages project to these hostnames.

Custom Domains require an active zone in the same Cloudflare account. Certificates are managed automatically. If your actual domain differs, update cloudflare/handlers.ts, site metadata and NEXT_PUBLIC_APP_URL before publishing.

References: [full DNS setup](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/), [Workers Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

## 6. Finish authentication and payments

In Supabase **Authentication → URL Configuration**, set Site URL to https://validore.tech. Allow https://validore.tech/auth/callback and its explicit /auth/callback** query-suffix pattern if needed. Keep only specific local/staging/temporary URLs. Configure SMTP/PKCE-compatible email templates. Test signup confirmation, recovery, sign-in, refresh and sign-out on final-domain HTTPS.

Enable Google in Supabase. In Google Auth Platform, use https://validore.tech as the app origin and copy Supabase's exact https://<YOUR-SUPABASE-PROJECT>.supabase.co/auth/v1/callback as the OAuth redirect URI. Complete consent publication/domain verification, add public privacy/terms links, and upload public/logo/validore-google-consent.png under Branding. Google's callback to Supabase differs from Supabase's callback to the app.

Test Stripe before enabling checkout: prices, Customer Portal, and https://validore.tech/api/webhooks/stripe with its signing secret. Verify successful/failed/duplicate/out-of-order events and credit fulfillment. See [billing acceptance](PRODUCTION_SETUP.md#billing). Keep Razorpay sales disabled until its incomplete checkout/lifecycle is finished.

## 7. Connect jobs and disable old automation

1. Drain queued work at the previous host before moving the shared Inngest app. Keep one production endpoint during cutover.
2. Set VALIDATION_RUNNER=inngest, matching event/signing keys and INNGEST_SERVE_ORIGIN. Register/sync https://validore.tech/api/inngest in the matching Inngest environment. Before DNS, use the exact temporary Worker URL; change origin and registered endpoint together.
3. Keep signed webhooks and /api/inngest reachable without interactive Access/challenge pages. The handlers verify signatures. Test Full/Lite completion, replay/retry, saved report, progress and refunds. Registration alone does not prove execution.
4. Under **Settings → Triggers → Cron Triggers**, confirm 0 0 * * * (00:00 UTC / 05:30 India daily). The scheduled handler invokes credit maintenance internally with CRON_SECRET, independent of public DNS. Trigger changes may take several minutes to propagate.
5. Inspect scheduled-event logs. Each run handles at most 500 due accounts plus bounded retention batches. It does not refresh bundled market data; use npm run data:refresh locally and release the reviewed update separately.
6. Disable previous hosting deploy hooks, cron schedulers and Inngest endpoints after acceptance. Remove old projects/domain associations when rollback is no longer needed. Repository cleanup does not change external projects, accounts, subscriptions or DNS. Keep existing Jenkins/GitHub automatic release jobs disabled.

## 8. Acceptance and rollback

Check public pages, images, templates, legal pages, redirects, final-domain authentication, private interviews, real queued reports, saved history, credits/refunds and PDF/DOCX/PPTX/portfolio exports. Verify ownership and private/no-store responses. Do not add Cache Everything over /api, /auth, /dashboard or /share.

Monitor CPU/memory, errors, database connections, cron backlog, Redis/provider failures and Inngest retries. Worker log sampling is 10%; review retention and use Inngest execution history too. /api/health is database-free liveness, not dependency readiness.

Keep a known-good version and matching settings:

~~~powershell
npx wrangler deployments list
npx wrangler rollback <KNOWN_GOOD_VERSION_ID>
~~~

Use an actual listed version. Restore matching Inngest configuration if necessary. Code rollback does not reverse schema changes, data writes or secrets. Verify authentication, saved reports and queue execution after rollback.
