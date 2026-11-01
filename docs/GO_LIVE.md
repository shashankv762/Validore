# Launch Validore on Vercel and validore.tech

This is the current launch path: **Namify/.TECH keeps your domain; Vercel hosts both the website and its Next.js API routes**. Supabase, Redis, Inngest, and the AI provider remain separate services. No domain transfer or separate backend web host is required.

Updated November 1, 2026 for the privacy, founder-interview and stored-research extension. See [current release evidence](PRIVACY_DATA_RELEASE_2026-11-01.md) for the latest checks and their limits. The earlier 405-test and live-model runs describe the preceding revision. This extension collected public data without application AI calls; hosted authentication, database and queue acceptance still need to be completed. No code has been pushed, deployed to Vercel, or connected through DNS in this task. Operator: **Shashank V, India**; support/privacy: **aegixchainai@gmail.com**.

## 1. Prepare the accounts and release

1. Sign in to [Vercel](https://vercel.com/dashboard) and [Namify/.TECH](https://namify.get.tech/dashboard/manage-domain). Keep `validore.tech` renewed and accessible in your domain account.
2. For a commercial Validore launch, use a Vercel **Pro** team. [Hobby is restricted to personal, noncommercial use](https://vercel.com/docs/plans/hobby#fair-use-usage-guidelines). Review the current plan price and usage controls in your own account before purchasing.
3. Review the local diff and run the manual checks below. Commit only intended source changes and push them to https://github.com/shashankv762/Validore. Keep `.env.local`, `.env.test.local`, credentials, reports, and build output out of Git. `opusplan.md` is existing unrelated work and is not part of this release by default.
4. Keep the previous working deployment available for rollback. Before switching the shared production Inngest app, let existing jobs finish. Pause new submissions on the old deployment during the switch so it cannot keep enqueueing work to a changing endpoint.

```powershell
npm ci
npm run verify:release-files
npm run lint
npm run typecheck
npm test
npm run build
npm run smoke:production
npm audit --omit=dev
```

`npm run verify:agents` is an optional focused rerun of the local agent pipeline tests; the full `npm test` command already includes them. These tests use synthetic external services and no application AI tokens. Live provider checks in [AI_AGENTS.md](AI_AGENTS.md#repeatable-acceptance) consume provider allowance and are separate from the token-free data refresh.

## 2. Import the project into Vercel

Choose **Add New → Project → Import Git Repository**, then select `shashankv762/Validore` and the reviewed production branch/commit.

| Vercel setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | Repository root (`./`) |
| Node.js version | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | Framework default; do not set it to `out` or `.next/standalone` |
| Fluid Compute | Enabled; the AI handlers declare a 300-second maximum |

The checked-in `vercel.json` already sets Next.js, install/build commands, and disables automatic deployments on Git pushes. Vercel detects and deploys the Next.js API routes with the site. The standalone output is also used by local smoke checks; Vercel still uses its native Next.js deployment.

## 3. Add production environment variables

In **Project → Settings → Environment Variables**, select the **Production** environment. Copy values directly from each provider's dashboard or your private secret store. Never paste secrets into chat, commit them, or prefix a private value with `NEXT_PUBLIC_`.

| Variable | What to enter / where it comes from |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://validore.tech` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project's public URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key; the legacy public `NEXT_PUBLIC_SUPABASE_ANON_KEY` is an alternative |
| `DATABASE_URL` | Supabase **Connect → Transaction pooler** connection string, including its real username and URL-encoded password. The app already uses `prepare: false` |
| `DB_MAX_CONNECTIONS` | Start with `2` for Vercel; tune against the database's total connection allowance |
| `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST details; required for production signup and costly API limits |
| `PIXROUTER_API_KEY` | Your working PixRouter key; configure `PIXROUTER_BASE_URL=https://pixrouter.com/v1` |
| Free model policy | `AI_FREE_ONLY=true`, `AI_GATEWAY_ENABLED=pixrouter,opencode,openrouter`, `AI_GATEWAY_ORDER=pixrouter,opencode,openrouter`, `AI_GATEWAY_ROTATE=false`, `AI_DIRECT_FIRST=false` |
| `PIXROUTER_REQUESTS_PER_HOUR` | `55`; shared Redis allowance below the observed 60/hour provider maximum |
| PixRouter models | Copy the four approved IDs in `PIXROUTER_FREE_MODELS` and `PIXROUTER_MODELS` from `.env.example`; use [model acceptance](AI_MODELS.md) when changing the selection |
| Optional fallback keys | `OPENCODE_API_KEY` and `OPENROUTER_API_KEY`; restore working access/quota and verify them before relying on fallback |
| `VALIDATION_RUNNER` | `inngest`; the local runner is rejected for production validation |
| `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` | Matching keys from your production Inngest environment |
| `VALIDATION_GLOBAL_CONCURRENCY` | Start with `2` and increase only after capacity checks |
| `CRON_SECRET` | A strong random secret from your password manager; Vercel sends it to the scheduled credit-maintenance route |
| `ENCRYPTION_KEY` | Exactly 64 hexadecimal characters (32 random bytes), required if customers save their own OpenRouter keys |
| `TRUSTED_PROXY_HOPS` | `1` for the direct Vercel ingress; reassess if adding another proxy |
| `RESEARCH_STORE_ENABLED` | `true`; enables the bundled official observations and optional durable public-source storage |
| `MARKET_MEMORY_ENABLED` | `true`; enables reviewed historical context and the official source catalog |

Public research sources work without search API keys. Keep your restored `TAVILY_API_KEY`, `SERPER_API_KEY`, and `SERPAPI_API_KEY` as limited fallbacks: `SEARCH_KEYED_ENABLED=true`, `SEARCH_KEYED_MAX_PER_REPORT=2`, `SEARCH_KEYED_DAILY_LIMIT=30`, with the provider order from [.env.example](../.env.example). The limits are combined across those providers and use Redis; successful results are cached for six hours. Initial shared searches never spend keyed-search quota.

The bundled snapshot already contains 48 official observations and works without database seeding while unexpired. Redis caches public searches and pages; PostgreSQL retains eligible official source revisions. Private interviews use their own owner-scoped table and never become shared research. Optional SearXNG and Ollama configuration is documented in [Market memory and free tools](MARKET_MEMORY.md). Self-host those services separately; a Vercel function cannot use Ollama running on your personal computer's localhost.

Earlier acceptance found PixRouter working with an allowance suited to a controlled pilot; OpenRouter returned “User not found” and OpenCode's free allowance was exhausted. Those account states were not re-tested during this extension. Resolve current limits and measure concurrent report throughput before inviting a large audience. The selected live acceptance commands in the agent guide consume provider allowance; data refresh and local mocked tests do not.

Do not set `INNGEST_DEV` in production. A Supabase service-role key is not needed by normal app routes. If moving an existing database, retain its encryption key so saved custom API keys can still be decrypted. Review the SQL deltas in [Production setup](PRODUCTION_SETUP.md), including `0002_free_model_default.sql` and **`0003_founder_interviews_research.sql`**. Neither was applied to the live database in this task. The new application requires the interview table before taking traffic.

Public variables are embedded at build time. **Redeploy after changing them**, and after any private configuration that a prerendered page uses, such as the public pricing availability flags.

For the temporary Vercel production hostname, add its exact HTTPS origin to `AUTH_ALLOWED_ORIGINS` and Supabase's redirect list if you use it for acceptance testing. Do not allow every `*.vercel.app` host. Preview deployments should have separate service credentials.

## 3a. Prepare the database and public research

1. Create or select a separate Supabase staging project. Take a verified backup of an existing production database and confirm how to restore it. Keep customer data out of development/test fixtures.
2. For an empty database, review the schema proposed by `npm run db:push`, then create the base tables and seed plan configuration with `npm run db:seed`. That seed also creates clearly labeled synthetic crowdfunding fixtures; these are not real campaign evidence. Do not blindly run schema push or reseed an existing production database.
3. With the base tables present, open Supabase's SQL Editor for the **reviewed target project**. Apply the reviewed SQL deltas in order: `0000_credit_payment_idempotency.sql`, `0001_application_access_and_indexes.sql`, `0002_free_model_default.sql`, and `0003_founder_interviews_research.sql`. These are standalone SQL files, not an automatically journaled migration history. Investigate any duplicate-row/index errors instead of deleting customer records.
4. Migration `0003` creates `founder_interviews` and `research_sources`, their indexes, size constraints and RLS. Browser roles `anon` and `authenticated` receive no table access. The server uses the existing private database connection and performs owner checks. Test both anonymous and authenticated Data API reads/writes are denied, and that each signed-in account can access only its own app data.
5. Set the private `DATABASE_URL` to the intended target and run `npm run db:verify`. It checks expected tables, enums, seed configuration, RLS, grants and important indexes. It does not prove that unrelated views, RPC functions, storage buckets or provider dashboards are secure; inspect those separately.
6. Review `src/data/market/refresh-status.json` and [DATA_SOURCES.md](DATA_SOURCES.md). The checked-in snapshot has 48 records for IN, US, GB, SG, BR and WLD. Run `npm run data:refresh` when it is due or before a release using an expired snapshot. Inspect the resulting diff, missing combinations, dates and exit status. Failed retrieval must not be relabeled as fresh evidence.
7. To copy that reviewed public snapshot into PostgreSQL, run `npm run db:seed:research` with the reviewed target connection. It writes public research only, is idempotent, and refuses expired/invalid snapshots. This command **does** write to the database; it is separate from the token-free refresh command. Bundled retrieval works without this optional seed.
8. Repeat the verified SQL rollout against the backed-up production project before deploying the new app. Keep the existing data and indexes during application rollback; do not drop these tables to roll back a UI release.

Schedule a monthly operational reminder to refresh and review the public snapshot. Vercel functions do not persist edits to repository JSON files. Publish an updated bundle in a reviewed release, or explicitly seed the reviewed new observations into PostgreSQL. The daily maintenance cron removes sufficiently old stored revisions; it does **not** run the local snapshot refresh script.

For the eight optional integration tests, use a dedicated disposable database with the application schema and test plan configuration. Select an isolated schema whose name starts with `validore_test_` using the test connection's search path, and store that connection as `TEST_DATABASE_URL` in ignored `.env.test.local`. The database-release suite checks `current_schema()` and refuses ordinary schemas; do not bypass that safeguard. These tests create and modify synthetic accounts/jobs. Run `npm test` after preparing the isolated environment, confirm the DB cases execute, and separately verify the actual staging application's grants and two-account ownership behavior. Never point test configuration at a customer database.

## 3b. Finalize privacy operations

1. Confirm `src/lib/legal.ts` identifies **Shashank V**, **India**, and **aegixchainai@gmail.com**. The five policy pages share this identity and version. Have the operating business's legal review cover applicable Indian requirements, any required address/tax details, target countries, refund terms and processor agreements before accepting paying customers. The source does not invent an address or claim legal certification.
2. Verify the actual hosting, database, queue, search and AI providers match the privacy notice. Review gateway/downstream model retention, training and transfer terms; a free model is not automatically a zero-retention service. Keep optional analytics, advertising and session replay disabled unless the notice and required choices are implemented first.
3. Decide and record retention periods for Supabase backups/auth logs, Vercel logs, Redis and Inngest history. Inngest durable preparation includes the relevant private interview context; clearing an interview does not purge already created reports or queue history. Configure those processors accordingly.
4. Test Settings → **Download my data**, interview **Clear interview**, and the privacy contact workflow. Assign responsibility for verifying ownership, handling correction/closure/erasure requests, recording statutory exceptions, deleting data from active systems and providers where required, and answering within applicable deadlines. Full account erasure is an operator-assisted workflow, not an implemented self-service delete button.
5. Confirm email signup requires the current terms acknowledgment and both signup UIs include the 18+ notice. Email signup records acceptance in Supabase user metadata; this is not immutable legal audit evidence. Google sign-in can provision accounts, so review acceptance requirements across OAuth and any direct Supabase access before relying on a formal consent audit.

## 4. Deploy and connect background validation

1. Click **Deploy** for the initial import and wait for a successful build. Check the build and function logs for configuration errors. Record the deployment URL and source commit.
2. Decide which stable public origin Inngest will call. Before domain DNS is ready, you can set `INNGEST_SERVE_ORIGIN=https://YOUR-PROJECT.vercel.app` and register `https://YOUR-PROJECT.vercel.app/api/inngest` in Inngest. Replace the placeholder with the actual production hostname. After DNS is live, `https://validore.tech` is also suitable.
3. **Do not copy `INNGEST_SERVE_ORIGIN=https://validore.onrender.com` into Vercel.** An explicit old origin would send executions to the old host. Match the origin, registered endpoint, and production event/signing keys; redeploy changed environment settings, then sync the Inngest app.
4. Make sure Inngest can reach that endpoint. If a temporary hostname is protected by Vercel Deployment Protection, configure the provider's supported bypass integration or use the public production domain. A registration response alone does not prove job execution.

The [official Inngest Vercel integration](https://www.inngest.com/docs/durable-execution/deploying-functions/platforms/vercel) can supply event/signing keys and sync deployments automatically. Use either that integration or the explicit registration above consistently. Consult Vercel's current [automation protection bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) and [function duration](https://vercel.com/docs/functions/configuring-functions/duration) documentation; streaming does not remove the configured execution deadline.
5. Run a real queued validation. Confirm pending → running → complete/partial, a saved report, correct credit deduction, and report history. In staging, check retries and terminal failure refunds. Each full-report agent is now a separate durable step with its own request budget; completed steps are reused on replay.
6. Check **Vercel → Cron Jobs** for `/api/cron/reset-credits` on the daily `0 0 * * *` UTC schedule. It requires `CRON_SECRET`, reaps stale jobs, resets due allowances, prunes public research more than 90 days past expiry and browser activity older than 30 days in bounded batches. Monitor failures and backlog. This is product functionality, not CI.

Keep one active production endpoint for the shared Inngest application during cutover. Do not let old Render and new Vercel workers or cron schedulers compete. Start with a short controlled cutover window and retain a rollback path.

## 5. Point validore.tech to Vercel

1. In **Vercel → Project → Settings → Domains**, add `validore.tech` and `www.validore.tech`.
2. Choose `validore.tech` as the canonical domain and configure `www.validore.tech` to redirect to it.
3. Vercel will show the DNS records required for **your project**. Keep that screen open.
4. In **Namify/.TECH → validore.tech → Manage → DNS Service / Manage DNS**, add the corresponding records below. Labels can vary in the domain dashboard.

| Type | Host/name in Namify | Target/value |
| --- | --- | --- |
| A or ALIAS/ANAME, as instructed by Vercel | `@` or the root-domain field | Copy the exact apex target displayed by Vercel |
| CNAME | `www` | Copy the exact CNAME displayed by Vercel |
| TXT, only if Vercel requests ownership verification | Exact host displayed | Exact verification value displayed |

Use the default TTL. If Namify asks for a full hostname instead of `@`, follow that field's format. If your nameservers point to a different DNS provider, edit the records there; records in an inactive DNS zone will not take effect.

Replace conflicting web records only at the apex or `www`, including obsolete parking/Render targets and conflicting AAAA records. Preserve existing nameservers, MX, SPF, DKIM, DMARC, and unrelated TXT records. **Do not use the old Render IP or guess Vercel's IP/CNAME from another project.** Current Vercel targets can be project-specific.

Save, return to Vercel, and wait for **Valid Configuration** and certificate issuance for both names. DNS can take minutes to propagate and occasionally 24–48 hours. Verify `https://validore.tech` loads over HTTPS and `https://www.validore.tech` redirects to it. Vercel supplies and renews the HTTPS certificate; a separate SSL purchase is unnecessary.

Official reference: [Add a domain to Vercel](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## 6. Finish authentication and payments

In **Supabase → Authentication → URL Configuration**:

- Site URL: `https://validore.tech`.
- Redirect URLs: `https://validore.tech/auth/callback**`. The narrow suffix match accommodates safe `?next=...` values used by signup, Google sign-in, and password recovery.
- If using the temporary production hostname, add `https://YOUR-PROJECT.vercel.app/auth/callback**` explicitly. Keep only the specific development/staging URLs you need.
- Click **Save**. Adding a URL in an unsaved dialog does not configure it.

In **Supabase → Authentication → Providers → Google**, use the Google client ID/secret and enable the provider. Google's authorized redirect URI remains `https://YOUR-SUPABASE-PROJECT.supabase.co/auth/v1/callback`, copied from Supabase. Google redirects to Supabase; Supabase then redirects to Validore. Add `https://validore.tech` as an authorized JavaScript origin if required by your Google configuration. Check the OAuth consent screen's audience and publishing status so intended users can sign in.

In **Google Cloud → Google Auth Platform → Branding** (called **OAuth consent screen** in some consoles), select the OAuth project used by Supabase. Set the app name to Validore and upload [`public/logo/validore-google-consent.png`](../public/logo/validore-google-consent.png) as the app logo. Set the homepage to `https://validore.tech`, privacy policy to `https://validore.tech/legal/privacy`, and terms to `https://validore.tech/legal/terms`; save and complete any review Google requires. The in-app sign-in/signup logos are updated. Google's external consent branding is controlled by this console and was not changed in this task. The Google sign-in button keeps Google's own standard symbol.

Use real production SMTP for confirmation and reset mail. Gmail is the public support contact; that alone does not configure Supabase email delivery. Preserve the sender domain's existing verification records. Test signup, confirmation, password sign-in, Google completion, sign-out, reset delivery, expired links, and saving a new password on the final domain.

Paid plans remain marked unavailable until the required Stripe configuration exists. A free-user launch can proceed while billing is disabled. For paid launch:

1. Set the live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`, and `STRIPE_MAX_PREMIUM_PRICE_ID` after verifying the same flow with Stripe test mode in staging.
2. Create the webhook endpoint `https://validore.tech/api/webhooks/stripe`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `customer.subscription.created`, `.updated`, `.deleted`.
3. Create recurring **monthly USD** prices: Premium **$29** and Max Premium **$79**, each with an interval count of one. Keep Free at **$0**. New checkout rejects mismatched amounts, currencies or billing intervals and replaces open checkouts that reference an outdated price. Configure the Stripe Customer Portal. Existing subscriptions keep the terms already agreed in Stripe; changing display constants does not migrate subscriptions.
4. Redeploy, then verify purchases, paid-event fulfillment, duplicate-event idempotency, credit balances, cancellation, and portal access. A return from Checkout is not proof of payment.

Razorpay checkout remains disabled. See [Production setup](PRODUCTION_SETUP.md) for billing lifecycle limits.

## 7. Disable old automation

Repository cleanup is complete: Jenkinsfiles, Jenkins setup helpers/docs, the GitHub Actions CI workflow, and the Render deployment helper/blueprint are removed. Manual testing tools remain. `vercel.json` has `git.deploymentEnabled: false`, so pushes do not automatically publish changes.

Complete these account-level steps yourself where applicable:

1. Disable the Validore Jenkins jobs, scheduled triggers, SCM polling, and multibranch scans. Archive logs/artifacts you need before deleting jobs. Uninstall Jenkins only if it is dedicated to this project; removing repository files does not uninstall a service.
2. In **GitHub → Repository → Settings → Webhooks**, remove only the Validore Jenkins/old deployment hooks. Revoke project-specific Jenkins or Render deployment credentials that are no longer used.
3. In GitHub branch protection/rulesets, remove required status checks belonging to the deleted workflow/Jenkins jobs, or merges will wait for checks that never run. Keep unrelated review/security rules.
4. Confirm old Render automatic deploys, deploy hooks, and external cron schedulers are disabled. Retire the old worker/endpoint after queued work is drained and the Vercel acceptance checks pass.
5. Confirm Vercel automatic Git deployments stay disabled. Do not create replacement Jenkins/GitHub pipelines.

For subsequent releases, deploy a reviewed commit manually. The Vercel CLI supports `npx vercel --prod` from a clean, reviewed checkout linked to this project. Keep environment values in Vercel. The checked-in `.vercelignore` excludes local environment files, account/session fixtures, downloaded reports, caches and build output from manual CLI uploads. The dashboard's **Redeploy** action rebuilds the selected deployment's source; it does not by itself select a newer Git commit. Official references: [Git deployment settings](https://vercel.com/docs/project-configuration/git-configuration), [Vercel CLI deploy](https://vercel.com/docs/cli/deploy).

## 8. Launch acceptance and rollback

Before announcing the domain, confirm:

- HTTPS on both hostnames, canonical redirect, favicon, social preview, and correct links/contact email.
- Desktop and phone layouts, menu, report tabs, keyboard focus, reduced motion, form validation, and recovery pages.
- End-to-end email/Google login and password recovery on the final domain.
- Real queued Full (nine specialists) and Lite reports, owned report access/history, PDF and editable Word downloads, exact credit accounting, and staging failure/refund behavior. Check PDF fonts, logo and page numbers from the hosted build, the source-review section, and both blank template downloads on Reports and Research team pages.
- Production cron, database capacity, provider quotas, job failures, and mail/webhook delivery are monitored.
- If billing is enabled, live prices and fulfillment match the advertised plan.
- Credits and Usage appear above Settings. After a validation, refund, plan change or confirmed top-up, verify the same balance across tabs and in another open browser tab. Confirm module credits buy one module run without an extra universal debit. Usage is owner-only and reflects recorded validation tokens, not an estimate of provider billing.
- Check memory source periods and expiry, one World Bank lookup, cached-page reuse, and the keyed-search cap. If Ollama or SearXNG is configured, verify it from the deployed runtime as well as locally.
- Complete a founder interview with a test account: consent, answer, tailored follow-up, unknown answer, saved history, finish, reload, stale-brief warning and confirmed clearing. Confirm the same account's answers inform each planning module. Try another account's idea/interview/export references and confirm denial. Check failure and daily-limit behavior saves answers and uses guided questions.
- Verify cookie acknowledgment and reopening, private/no-store responses, changing CSP nonces on auth/dashboard pages, cross-origin write rejection and oversized-body rejection on the hosted build. Review the [security report](SECURITY_REVIEW_2026-11-01.md) for source fixes versus hosted checks.

`/api/health` reports liveness and the Vercel Git revision where available. It does not verify Supabase, Redis, Inngest, AI, or payment readiness. Current local verification and its limits are recorded in [Implementation status](IMPLEMENTATION_STATUS.md).

For a bad release, use Vercel's previous known-good production deployment/rollback action. If reverting to the old host, restore the matching Inngest endpoint and environment configuration as part of the same rollback. Application rollback does not undo database writes or schema changes. Verify login, a saved report, and job processing after rollback.
