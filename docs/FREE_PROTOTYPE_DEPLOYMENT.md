# Publish the ten-user Validore prototype for $0 in hosting fees

Reviewed 1 November 2026. **Recommended starting point: Render Free + Supabase Free + Upstash Free + Inngest Free, using only available free AI models.** This can cost $0 while you stay within each service's free allowances. The built-in `onrender.com` address and HTTPS avoid buying a domain. Your already-owned domain can be connected later.

**Current requested domain layout:** the independent [static marketing website](../static%20webpage/README.md) serves `validore.tech`; this SaaS stays on `validore.onrender.com`. Keep Auth callbacks, `NEXT_PUBLIC_APP_URL` and `INNGEST_SERVE_ORIGIN` on the Render host. The static guide also fixes the stale Render build command referencing the deleted `scripts/ci-config.mjs` and `npm run ci`.

Render is one option, not the only compatible host. This recommendation fits a small commercial prototype whose users can tolerate cold starts. Render explicitly recommends Free instances for testing, not production applications. A free deployment cannot promise uninterrupted service, immediate first loads, unlimited AI calls or guaranteed ad earnings.

## 1. Choose the host

| Host | Fit for this version | Free commercial prototype? | Decision |
| --- | --- | --- | --- |
| Render Free Web Service | Runs the existing Node server, APIs and exports together | Free instance available; standard terms/quotas apply | Simplest starting point for this pilot |
| Cloudflare Pages static hosting | Cannot execute this full app's authenticated server/database/AI routes as a static export | Static hosting is free, but another backend would still be needed | Not the complete deployment |
| Cloudflare Workers Free | OpenNext is integrated. This bundle is 20,351.99 KiB uncompressed, within the current 64 MiB limit | Possible candidate, but the checked-in CPU setting targets Paid and Free allows only 10 ms CPU/request | Qualify the real workload first, especially SSR and exports; local smoke does not prove Free-plan CPU compatibility |
| Cloudflare Workers Paid | Existing Worker adapter, domain and cron configuration remain supported | Paid, starting at US$5/month plus applicable usage | Reasonable later option for a hosted service without Render Free's idle sleep; verify workload limits |
| Vercel | Next.js is compatible, subject to runtime limits and configuration | Hobby is restricted to personal, non-commercial use | Vercel Pro is an option; Hobby does not fit this commercial request |
| Netlify Free | Supports Next.js and permits commercial projects | Free allowance is 300 platform credits/month | Requires adapting/testing long AI calls: synchronous functions have a 60-second limit, while this app allows longer work |
| Google Cloud Run | Can run the existing container with external database and Inngest | Free usage allowance, with a billing account; overages and other cloud services can cost money | Compatible alternative, not a guaranteed zero-bill choice |
| Oracle Always Free VM | Can run Node or Docker | Eligible Always Free resources are available subject to capacity/account conditions | More server administration; idle reclamation and regional capacity make it less convenient for this pilot |

This is a full Next.js 16 app, not only a frontend. Supabase stores the data; Inngest coordinates validation; Redis handles shared limits. Ten accounts alone do not determine hosting usage: long model calls, retries, exports and concurrent requests matter too.

**Correction to the earlier bundle-size advice:** Cloudflare [removed compressed bundle limits on 4 September 2026](https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/). Both plans now allow 64 MiB uncompressed. The latest local dry run is 20,351.99 KiB total / 4,986.50 KiB gzip; gzip is informational. Do not pay solely because this app exceeds the old 3 MB compressed threshold. The current `limits.cpu_ms: 300000` setting targets Paid, while Free allows 10 ms CPU per request, 128 MB memory and 50 external subrequests. AI network waiting does not count as CPU. Before choosing Workers Free, prepare a separate configuration without the Paid CPU override and test the complete workload on a Free staging Worker, checking its CPU/error metrics. Local `wrangler dev` does not enforce those hosted limits. Render is recommended here to avoid making unverified CPU promises.

Sources: [Render Free](https://render.com/docs/free), [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Netlify Free commercial use](https://www.netlify.com/blog/introducing-netlify-free-plan/), [Netlify pricing](https://www.netlify.com/pricing/), [Netlify function limits](https://docs.netlify.com/build/functions/configuration/), [Cloud Run pricing](https://cloud.google.com/run/pricing), [Oracle Always Free](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm). Check the account dashboard before enabling a paid option; plans can change.

## 2. Prepare the services

Use existing accounts/projects where suitable; do not create duplicate paid resources.

| Service | What to create or retain | Free-plan consideration |
| --- | --- | --- |
| Render | One Free **Web Service**, Node runtime | Sleeps after 15 minutes without inbound traffic; waking takes about one minute. 750 instance hours per workspace/month; memory is limited to 512 MB. Build/bandwidth quotas also apply. |
| Supabase | One Free project for PostgreSQL and Auth | 500 MB database; 50,000 monthly active users. Free projects can pause after a week of inactivity; export backups yourself. |
| Upstash | One Free Redis database | Published Free allowance: 250 MB, 500,000 commands/month, 10 GB bandwidth. Use the REST URL/token. |
| Inngest | Free environment and an app connected to `/api/inngest` | Function runs/steps and concurrency use its allowance; confirm current limits in the dashboard. |
| AI | At least one working gateway with genuinely available free models | Free model availability, rate limits and provider terms are independent of hosting. Keep automatic funding/paid fallbacks disabled. |
| Email | Google sign-in, or a verified SMTP sender in Supabase | Supabase's default email service is restricted and unsuitable for inviting arbitrary public addresses. Resend Free allows 100 emails/day; sending to your users requires a verified sending domain. |

Do **not** use Render's Free PostgreSQL service for durable project data: its free database expires after 30 days. This app already supports external Supabase PostgreSQL.

Sources: [Render limits](https://render.com/docs/free), [Render compute specifications](https://render.com/docs/compute-plans), [Supabase pricing](https://supabase.com/pricing), [Supabase email setup](https://supabase.com/docs/guides/auth/auth-smtp), [Upstash pricing](https://upstash.com/pricing/redis), [Inngest limits](https://www.inngest.com/docs/durable-execution/limits), [Resend pricing](https://resend.com/pricing).

## 3. Prepare and review the repository

1. Keep the code in your Git repository, preferably private during the pilot. Review the existing uncommitted changes together with this release. No commit, push or deployment was performed in this implementation session.
2. Use Node.js 24 and install from the lockfile with `npm ci`.
3. Use `.env.example` for local configuration and `.env.production.example` as a **blank reference**, never as a filled file to commit. Files containing credentials must remain ignored.
4. Run the release checks locally:

```powershell
npm run verify:release-files
npm run lint
npm run typecheck
npm test
npm run build:deploy
npm run smoke:production
npm audit --omit=dev
```

`build:deploy` builds with webpack and copies public/static assets into the standalone output. This avoids the previously observed Windows Turbopack tracing problem and uses the same output that Render will start. Build success does not test live email, provider quotas or authentication callbacks.

## 4. Prepare PostgreSQL before deploying the new code

**Migration `drizzle/0004_rewarded_ads.sql` is mandatory even with ads disabled.** Application account queries now include `reward_credits`. Deploying without that column will break account loading.

For an **existing database**:

1. Take a database backup and verify the target project. Test on a separate staging database first.
2. Review which deltas are already applied. The repository does not contain a complete, automatic baseline migration chain.
3. In Supabase's SQL Editor, execute the contents of any unapplied files in this order after the base tables exist:
   - `drizzle/0000_credit_payment_idempotency.sql`
   - `drizzle/0001_application_access_and_indexes.sql`
   - `drizzle/0002_free_model_default.sql`
   - `drizzle/0003_founder_interviews_research.sql`
   - `drizzle/0004_rewarded_ads.sql`
4. Point your local `DATABASE_URL` at the intended database and run `npm run db:verify`. This command reads configuration from `.env.local`; check the target before invoking it.

For a **new, empty Supabase project**, first review Drizzle's proposed schema and run `npm run db:push`, then `npm run db:seed` for the plans and synthetic reference campaigns. Apply the reviewed SQL deltas above as well, particularly the browser-role revocations. The seed is for setup; do not use it as a repair command for an existing customer database.

In Supabase's **Connect** panel, select the PostgreSQL transaction pooler connection string, usually port 6543. Preserve its username/host and URL-encode special password characters. Store it only as `DATABASE_URL`. The app sets `prepare: false`, a pool of two connections and a statement timeout. Public publishable/anon credentials are for Auth; they must not give browser access to application tables. The private server connection must use an appropriately authorized database role. More detail: [production database setup](PRODUCTION_SETUP.md#database-rollout).

## 5. Create the Render service and enter its configuration

In Render, choose **New → Web Service**, connect the reviewed Git repository and select the branch/commit you intend to publish.

| Render setting | Value |
| --- | --- |
| Name | A unique name such as `validore-prototype` |
| Runtime | Node |
| Root directory | Repository root; leave blank when the app is at the root |
| Region | Near your Supabase region and users; Singapore is a reasonable India-facing choice if your database is nearby |
| Build command | `npm ci --include=dev --no-fund && npm run build:deploy` |
| Start command | `npm run start:standalone` |
| Instance | **Free**, not Starter |
| Health check | `/api/health` |
| Auto-deploy | Off; publish reviewed releases manually |

Enter these environment variables in Render. Values in angle brackets below are explanations: replace them, do not paste the brackets literally.

```dotenv
NODE_VERSION=24
NODE_ENV=production
HOSTNAME=0.0.0.0
NEXT_TELEMETRY_DISABLED=1
APP_ENV=production
NEXT_PUBLIC_APP_URL=https://<your-service>.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public publishable key>
DATABASE_URL=<private pooled PostgreSQL URL>
DB_MAX_CONNECTIONS=2
UPSTASH_REDIS_REST_URL=<Redis REST URL>
UPSTASH_REDIS_REST_TOKEN=<Redis REST token>
TRUSTED_PROXY_HOPS=1
SIGNUP_MAX_PER_IP_WEEK=10
VALIDATION_RUNNER=inngest
VALIDATION_GLOBAL_CONCURRENCY=1
CREDIT_MAINTENANCE_RUNNER=inngest
INNGEST_EVENT_KEY=<event key from your Inngest environment>
INNGEST_SIGNING_KEY=<signing key from the same environment>
INNGEST_SERVE_ORIGIN=https://<your-service>.onrender.com
AI_FREE_ONLY=true
AI_GATEWAY_ROTATE=false
AI_DIRECT_FIRST=false
SEARCH_KEYED_ENABLED=false
MARKET_MEMORY_ENABLED=true
RESEARCH_STORE_ENABLED=true
REWARDED_ADS_ENABLED=false
```

Also configure the **working** AI gateways using `.env.example`: set `AI_GATEWAY_ENABLED`, `AI_GATEWAY_ORDER`, each matching private API key, and the provider-confirmed free model lists. The existing preferred order is `pixrouter,opencode,openrouter`; keep only providers you can actually use. `PIXROUTER_REQUESTS_PER_HOUR=55` is the existing bounded budget, not a guarantee of provider access. A free-only flag cannot force a provider to keep a model free; verify its catalogue and disable paid auto-recharge in its dashboard.

Generate separate random server secrets for `ENCRYPTION_KEY` and `CRON_SECRET`. This command produces one 64-character hexadecimal secret; run it separately for each and place each result only in the corresponding secret setting:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not rotate `ENCRYPTION_KEY` on an existing deployment without a plan for saved custom AI keys: changing it makes those encrypted values unreadable. Render supplies `PORT`; do not hardcode port 3100. Leave `INNGEST_DEV` unset in production. A Supabase service-role key is not required for ordinary app routes. Leave Stripe/Razorpay keys empty until accepting payments is deliberately configured and tested.

The signup setting keeps protection enabled while allowing ten registrations from a shared network in seven days; its default remains three and maximum is twenty. This is an abuse limit, not a ten-member invitation system. Confirm that the ingress supplies a trustworthy client address; if you add another proxy, review `TRUSTED_PROXY_HOPS` instead of guessing a higher value.

Create/deploy the service. If Render assigns a different URL than expected, correct both app and Inngest origins and rebuild before sharing it. `NEXT_PUBLIC_*` values are compiled into the browser bundle: changing those requires a new build, not just a restart.

## 6. Finish sign-in and email

1. Supabase → Authentication → URL Configuration: set **Site URL** to the exact public origin.
2. Add `https://<your-service>.onrender.com/auth/callback` to allowed redirects. Add only deliberate staging/development URLs; avoid broad wildcards.
3. Keep email confirmation enabled. Configure custom SMTP in Supabase if you use email/password registration; test delivery to addresses outside your Supabase team. Your existing domain can supply a verified Resend sender. Without a sending domain, Google OAuth is a possible route for Google-account testers, subject to Google configuration; do not promise public password signup will work using Supabase's default mailer.
4. For Google sign-in, enable the Google provider in Supabase. In Google Auth Platform configure the client, branding and permitted test users if in testing mode. Google's authorized redirect URI is the **Supabase** callback `https://<project-ref>.supabase.co/auth/v1/callback`; Supabase then redirects to the app's `/auth/callback`. Use the app origin where an authorized JavaScript origin is requested.
5. Test confirmation, login, logout, Google login and password recovery using the final HTTPS URL. Existing credits and private data must appear for the correct account after each flow.

## 7. Connect jobs and the free maintenance schedule

1. Open the Inngest environment matching the keys in Render. Sync/connect the app at `https://<your-service>.onrender.com/api/inngest`.
2. Confirm both `validate-startup` and `daily-credit-maintenance` are registered. The second is included only when `CREDIT_MAINTENANCE_RUNNER=inngest`.
3. Daily maintenance runs at midnight UTC (05:30 in India). It renews due plan balances, recovers stale jobs and prunes expired records. Ad credits carry forward.
4. Trigger a small real Lite validation from your test account and watch its steps in Inngest. Confirm the job finishes, the report reopens and 50 credits are deducted once. This live step uses your provider quota; do it deliberately after configuration.
5. Use Inngest's dashboard to run/observe the maintenance function once and confirm success. Do not create a paid Render Cron Job for this free pilot.
6. If moving from another live host, finish/drain its active jobs, sync the app to the new origin and disable its old maintenance schedule. Keep one authoritative scheduler.

A sleeping Render instance can delay job delivery or cause an initial retry. Inngest's durable steps support retry/recovery, but you must test cold-start behavior on the deployed service. Local `VALIDATION_RUNNER=local` is for development, not the public prototype. Do not use artificial keep-alive traffic to evade idle sleep.

## 8. Enable ads only after approval and testing

The Credits tab now supports **one confirmed rewarded video → 10 earned credits** using AppLixir. It stays in an honest unavailable state until configured. You have not yet obtained an approved ad account, so real ads cannot be promised today.

Follow [rewarded ads, payout and crypto setup](REWARDED_ADS.md). Default caps are five rewards per user/day, fifty for the entire app/day, and a one-minute cooldown. A Free account can fund an extra 50-credit Lite validation with five earned rewards after using its included runs. Premium tools still require their existing entitlements.

## 9. Check the public deployment before inviting ten users

- Open `/`, `/demo`, sign-in, policies and `/api/health`. A healthy liveness response does not prove the database or AI gateway is reachable.
- Register/verify a real test account, sign in, create a brief, run Lite, reopen the report and download PDF/Word.
- Test two simultaneous starts from the same account; they must not create duplicate charges. Test a controlled failed job in staging and confirm its original credit sources return once.
- On desktop and mobile, check Credits, Usage and Settings after a completed action. Refresh/relogin must preserve balances.
- Verify the new SQL column/table and browser-role restrictions with `npm run db:verify` and the checks in the production guide.
- Confirm Inngest steps and daily maintenance succeed, and Redis/provider usage remains inside your allowance.
- Let the service sleep naturally, revisit it and record the cold-start experience. Inspect Render memory during a validation and export. 512 MB must be measured against your workload, not assumed sufficient for every concurrent task.
- After ad approval, use the provider's sanctioned test mode to check completion, skip, no fill, duplicate delivery and one `AD_REWARD` entry. Then verify real inventory under the provider's testing rules.

The local suite and browser fixtures cover application behavior; they do not certify your external accounts, real ads or a public deployment. This release was prepared locally and is not published by these instructions.

## 10. Keep the pilot free and recoverable

Reopen saved reports instead of regenerating them. Prefer Lite, leave keyed search and paid AI fallbacks off, use global validation concurrency one, and leave unused paid services disabled. Check each provider's usage dashboard during the pilot. Inngest steps, Redis commands, database storage, bandwidth and AI model quotas are separate meters from Validore credits.

Keep database exports in private storage outside Render's ephemeral filesystem. Apply future additive database changes before deploying code that needs them. For a faulty app release, use Render's recent-deployment rollback; do not delete the new reward column/table while any version still references it.

For a strict zero-bill setup, review Billing as well as the instance selector. Render documents supplementary bandwidth/build charges when a payment method is attached; without one, it suspends service or blocks builds when allowances run out. Use the no-payment-method route where available, keep paid upgrades and automatic top-ups off, and set available spending caps. An email budget alert is not a hard cap, and the build-pipeline cap does not automatically cap every other resource.

If quotas, sleep or memory become a problem, the honest next step is a measured architecture change or paid capacity. No free host can guarantee a top-tier commercial SLA. Rewarded ads also do not guarantee enough revenue to fund AI, especially with only ten users.

## Common problems

| Symptom | Check |
| --- | --- |
| `Cannot find module .../scripts/ci-config.mjs` | Replace the whole saved Build Command with the command in section 5, or deploy the restored `ci-config.mjs`, `test-ci.mjs` and updated `package.json` together. Root directory must be the app repository root. |
| First request shows a loading page | Expected Render Free wake-up; allow about a minute |
| Credits/account API fails after release | Apply migration 0004; verify PostgreSQL URL and grants |
| Signup says temporarily unavailable | Redis URL/token, trusted client IP and SMTP configuration |
| Fourth or later signup from one network is blocked | Use the reviewed pilot setting `SIGNUP_MAX_PER_IP_WEEK=10`; attempts and provider limits still apply |
| Google says redirect mismatch | Google's URI must be Supabase's `/auth/v1/callback`; Supabase must allow the app callback |
| Validation remains queued | Production runner, matching Inngest keys, app sync, reachable HTTPS endpoint and free-model quota |
| Maintenance function is missing | Set its runner to `inngest`, deploy, then sync Inngest again |
| CSS/images fail in standalone mode | Use `build:deploy`, which copies `public` and `.next/static` |
| Ad button says coming soon | Ads are disabled or configuration is incomplete; approval and real inventory are external requirements |
| Ad completed but reward is pending | Inspect verified webhook delivery; browser completion alone never grants credits |
| Process restarts during exports or simultaneous work | Inspect memory and reduce concurrency; evaluate a paid instance if Free cannot hold the measured workload |
