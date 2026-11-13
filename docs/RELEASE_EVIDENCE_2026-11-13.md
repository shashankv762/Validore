# Render release evidence - 13 November 2026

The application is deployed at **https://validore.onrender.com**. This record follows the [repair plan](RELEASE_REPAIR_PLAN_2026-11-12.md) and distinguishes hosted acceptance from synthetic tests.

| Release | Verified value |
| --- | --- |
| Application revision | `f11c803ea2081c6c1e67ef805e3e06750ef677a1` |
| GitHub CI | [43372855987 - all three jobs passed](https://github.com/shashankv762/Validore/actions/runs/43372855987) |
| Render deployment | `dep-dbrabnrtqb8s73dvpubg` - live |
| Existing service | `srv-dbipj6142hec73b5bor0`, Free plan, manual deployment |
| Runtime revision | `/api/health` matched the application revision |

Subsequent documentation-only commits can be deployed with identical application source, configuration and lockfile. Check the health revision and GitHub run for the current deployment.

## Repairs and automated gates

New identities complete server registration admission and consent before obtaining workspace profiles or credits. Report links require authenticated ownership and use private caching and generic metadata. Concurrent registrations resolve a single profile. Drafts recover after account failures; Free accounts can reuse their existing idea for a second validation. Saved pricing, crowdfunding and pitch results remain available after generation packs are exhausted, including selected-version exports and malformed-result recovery.

Scores are normalized to bounded whole points before PostgreSQL persistence. Explicit cycle identity and monthly-pool consumption preserve spending across billing periods, delayed events and tier changes. Purchased and earned refunds do not depend on payment-provider availability. Invalid model JSON/schema output can receive one tool-free correction within the existing deadline and six-call limit, without rerunning research or relaxing validation. Unavailable provider accounts remain disabled.

The exact application revision passed:

- Strict lint, generated route types, TypeScript, and **661 regression tests**.
- **17 real PostgreSQL tests**, with no skips, including concurrent spending, registration, persistence, refunds and additive SQL. The ordinary regression suite separately skips 16 opt-in external database cases; these are not additive unique-test counts.
- Production dependency audit with **zero reported production vulnerabilities**.
- Standalone production build and **17 smoke groups**, including actual JavaScript/CSS, metadata, authentication/privacy boundaries and marketing health CORS.
- Static marketing JavaScript and source-control release-boundary checks.

An earlier Windows/Linux lint difference in generated image routes was fixed with a narrowly scoped ESLint configuration. The final GitHub workflow passed all three jobs without suppressing their gates.

## Browser and database acceptance

Local production-browser acceptance passed **22/22 checks** with real disposable Supabase identities and an isolated PostgreSQL fixture. It exercised native sign-in, draft restoration after a failed account fetch, persisted PATCH edits to the same Free idea, saved modules with exhausted packs, malformed-result recovery, foreign-owner denial, and desktop/mobile rendering. Seven PDF, Word and PowerPoint files contained the selected saved content. There were no JavaScript, console or Next.js asset errors. Only the local validation enqueue request was intercepted; hosted validation was tested separately below.

The resumed Supabase project's public schema was backed up and restored locally. All **14 original tables** matched before migration. Additive deltas `0003`-`0005` passed staging and repeated application, then were applied live while preserving original records and balances. All **17 application tables** have RLS and server ownership. **136 anonymous/authenticated Data API read/write attempts** were denied. The inspected platform event-trigger function cannot be invoked as a REST RPC.

## Hosted acceptance

The controlled Free account was denied an application profile before consent, admitted after completing registration, and received the expected starting allowance. Native sign-in, idea creation, existing-idea reuse and actual Inngest dispatch succeeded. An initial pre-correction report was marked partial when one specialist returned an invalid enum and fallbacks were unavailable; that result led to the bounded output-recovery fix.

On the final application revision, the account's second included Lite validation completed in approximately **36 seconds**, with market, customer and synthesis specialists all `ok`. It persisted once with integer scores and reopened from report history. Each run debited exactly **50 credits**; the two runs accounted for 100 credits and two ledger debits. Reads and downloads did not consume further credits. Usage displayed both the earlier partial result and the complete result correctly.

The hosted PDF and Word downloads contained the saved report. Its mobile view fit a 390px viewport without horizontal overflow. Anonymous report access returned 401 and anonymous private-link access returned 404. A second authenticated account received 404 for the owner's report, private link, PDF and Word exports. Account-data export and Settings, Usage, Credits and Lean Canvas pages were reachable. No JavaScript or asset errors were recorded during report acceptance.

Password recovery passed using an administrator-generated recovery link: the hosted callback opened the reset form, a new password was saved, and a fresh session authenticated with it. Google initiation redirected through the configured Supabase provider with the correct Render callback. Signed Inngest inspection verified the validation function, generated failure handler, daily maintenance at `0 0 * * *`, and global validation concurrency one. The live Lite run also completed in Inngest's run history.

Both disposable Auth accounts and their application profiles, ideas, jobs, reports, ledgers and device records were removed after acceptance. Customer records were outside the cleanup scope. Credentials, browser sessions, backups and detailed verification artifacts are ignored and are not part of the release.

## Operating limits

Render Free sleeps when idle; its loading page and wake-up were observed during acceptance. PixRouter's free model capacity and the configured request budget limit throughput. The application preserves and labels partial reports when a specialist cannot complete.

Billing, Razorpay sales and rewarded ads remain unavailable until their provider setup and acceptance are completed. Current email delivery and interactive Google consent/login completion were not tested; the password recovery check generated a link without sending an email. The current hosted acceptance covers the public Free workflow, not a live paid Full report. The separate marketing domain and alternative Cloudflare deployment are outside this Render rollout.

The local sanitized evidence is under ignored `reports/browser-acceptance`, `reports/hosted-release`, `reports/database-release-20261112.json` and `reports/live-data-boundary.json`. GitHub's linked run is the durable automated-gate record.
