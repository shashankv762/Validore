# Release evidence — 2026-10-31

> Historical Render checkpoint. This record predates the Vercel release preparation and removal of CI automation. For the current code and launch path, use [Implementation status](IMPLEMENTATION_STATUS.md) and [GO_LIVE.md](GO_LIVE.md). The original evidence below is retained unchanged.

This record persists the release checkpoint outside the volatile R-drive workspace. It contains no test credentials, sessions or private API keys.

## Released application

| Field | Value |
| --- | --- |
| Public beta | https://validore.onrender.com |
| Application commit | `6538a6bad5c612290cf6b3e027e759c22c314208` |
| Render deployment | `dep-dbiqa12jnfac73bb4bgg` — live |
| Render service | `srv-dbipj6142hec73b5bor0` — Free, Singapore, automatic deployment off |
| Successful CI | https://github.com/shashankv762/Validore/actions/runs/41184069984 |
| Latest hosted health/history check | 2026-10-31 08:39 UTC; health reports the exact application SHA above |

Later documentation commits are not new application deployments.

## Verification results

- Strict lint, generated Next.js route types and TypeScript passed.
- Regression suite: **307 passed, 8 skipped**. Five skipped database release tests ran separately against real PostgreSQL and **all five passed**; three legacy database tests remain skipped. The isolated schema was removed afterward.
- Production build and standalone smoke passed locally on R, in GitHub CI and on Render. Smoke covered health, landing, the explicitly fictional demo, static logo and cache policy.
- Production dependency audit: **zero high/critical**, **five moderate transitive** findings.
- Both SQL deltas were applied. All **14 application tables** have RLS; effective anon/authenticated grants and actual direct-role queries deny access. Owner reads and existing row counts were preserved.
- Hosted auth checked at 08:29 UTC: email/password sign-in and profile retrieval returned 200; fresh recovery returned to the Render callback/reset page; password update and changed-password sign-in returned 200. The original test password was restored.
- Confirmation delivery was verified during local signup integration. Google initiation redirects to Supabase authorize and Google is enabled; interactive consent/login completion was not tested.
- Hosted Inngest registration returned 200. A real queued **lite** report went from pending to running to complete, was retrieved successfully and scored 38. The authorized account's balance moved **100 to 50**, matching one charge. Completion was recorded at 08:29 UTC.
- At 08:39 UTC, rendered report history returned 200 and contained the saved report link. The owner's report API returned 200; the same anonymous request returned 401. The test session was then signed out successfully.
- A separate real **full** six-agent report on R completed in **96.5 seconds**, with all six agent statuses `ok`, 23,918 tokens and score 52. It used the native Google fallback chain (`gemini-3.5-flash`, `gemini-3.1-flash-lite`, `gemini-3.6-flash`). Its synthetic report was not inserted into production.

## Operational evidence and open work

Render still reports both custom domains unverified. Public DNS has no apex A answer and `www` is NXDOMAIN. Required records: A `@` → `216.24.57.1`, CNAME `www` → `validore.onrender.com`; preserve Resend records. Dashboard access was stopped/unavailable, so DNS/TLS remains incomplete.

Billing is unconfigured. Interactive Google completion, custom-domain HTTPS, browser accessibility/responsiveness and induced production failure/refund are unverified. Free hosting and provider quotas remain limits. Exposed credentials still require rotation; five moderate dependency findings remain.

Detailed evidence is in `R:\Validore-Astra-20261031\reports`: `final-release-ci.log`, `database-release-final.log`, `database-access-before.json`, `database-access-after.json`, `production-audit.log`, `production-smoke.json`, `live-ai-native.log`, `live-ai-progress.json`, `live-auth-checks.json`, `live-validation.json`, `live-history-checks.json`, `render-release.json` and `render-status.json`. R is volatile; this committed record and the linked CI run are the durable summary.
