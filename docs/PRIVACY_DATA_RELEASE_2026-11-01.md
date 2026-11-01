# Privacy, research and agent pipeline release evidence

Updated **November 1, 2026 (India)**. This extends the earlier [account and market-memory release](RELEASE_CANDIDATE_2026-11-01.md). Changes are local and uncommitted. No production migration, research database seed, deployment, Git push, DNS change, account creation or customer message was performed in this extension.

## Implemented behavior

- Five policy pages share **Shashank V**, **India**, **aegixchainai@gmail.com**, and notice version `2026-11-01`: terms, privacy, essential cookies, refund and acceptable use. The essential-storage acknowledgment lasts 180 days and can be reopened. Optional analytics/advertising are not enabled.
- An optional founder interview saves answers before AI work, adapts follow-ups, labels self-reported evidence and falls back to guided questions. Owner and version checks protect updates and deletion. It informs validation and all four planning modules without pooling private founder answers across users.
- Settings offers a bounded, paginated owner-only account export. Interview clearing is implemented. Full account closure/erasure remains an operator-assisted process, accurately disclosed in the policies.
- Tool-enabled research uses a separate public brief. Private answers, startup names, invention details and prior private-derived findings reach the final tool-free output phase. Provider and Inngest processing are disclosed.
- The server recalls bundled or stored official evidence and can persist newly retrieved eligible public sources. Expiry, metadata, source restrictions and revision history prevent stale or untrusted records from silently becoming fresh evidence.
- Route skeletons, real validation progress, pending controls, recoverable interview errors, conflict reloads and narrow-screen layouts cover waiting and failure states.
- Origin/body validation, private response caching, dynamic-page CSP, device-abuse limits, duplicate-job checks and database access declarations were strengthened. See the [security report](SECURITY_REVIEW_2026-11-01.md).
- Git, Vercel and Docker ignore rules now cover private keys, browser sessions, exports, test artifacts, backups and generated files. A manual release-file check keeps required public data, migrations, fonts, templates and the lockfile included. No CI or automatic deployment pipeline was reintroduced.

## Live public data collected with Astra

The user-requested GPT-6 Astra research pass fetched official public endpoints and saved **48 numerical WDI observations** plus **10 source-directory references**. It did not use the application's AI API tokens or paid data APIs. Refreshing them uses Node HTTPS requests, not a model.

| Property | Evidence |
| --- | --- |
| Geography | India, US, UK, Singapore, Brazil, World |
| Indicators | Population, GDP, GDP per capita, internet use, inflation, real GDP growth, urban share, unemployment |
| Observation years | 2024–2025; year is stored separately from retrieval time |
| WDI revision | 2026-10-08 |
| Retrieval | 2026-10-31 around 19:11 UTC, November 1 in India |
| Coverage | 48/48 pairs; no missing pair or failed request in the final refresh |
| Freshness | 30-day retrieval window; no claim of real-time annual observations |
| Outage behavior | A simulated network failure preserved the previous numerical snapshot byte-for-byte |

The catalog references do not supply verified numeric tables. The snapshot is macroeconomic context, not an exhaustive dataset for every industry, a startup TAM, customer demand or willingness to pay. Agents still need relevant live sources for material sector, competitor and pricing gaps. [DATA_SOURCES.md](DATA_SOURCES.md) preserves provenance, requests, limitations, licensing and discovery failures.

## Current local checks

| Check | Result / scope |
| --- | --- |
| Full unit/regression/contract suite | **487 passed, 8 skipped**; 55 files passed and one DB suite skipped |
| ESLint | Passed with zero allowed warnings |
| Generated route types and TypeScript | Passed |
| Production build | Passed; **53/53** pages generated with Turbopack |
| Built standalone smoke | 14 groups on the reviewed production build; includes policy, CSP, consent and API privacy boundaries |
| Production dependency audit | Zero vulnerabilities reported across 422 production dependencies; point-in-time audit |
| Full dependency audit | **20 moderate development-tool findings**, no high/critical findings; compatible upstream fixes remain pending |
| Responsive/browser review | **60 checks passed**, no page errors or CSP console errors; 1440, 768, 390 and 320px where applicable |
| Release-file boundaries | 108 inclusion/exclusion cases passed across Git/Vercel rules; no currently tracked ignored files |
| Client packaging and documentation | 41 browser asset files: no exact configured private-value or selected server-research marker matches; all 67 local file links across nine current documents resolve |
| Common secret signatures | No matching private-key blocks or selected live-key formats in nonignored source; this is a limited pattern check |

Browser checks used real production policy/auth pages and actual private UI components with a synthetic backend and routing fixture. They covered cookie persistence/reopening, signup acknowledgment fields, interview consent, save/unknown/finish/history/confirmed clearing, stale-tab recovery, load-error recovery, account download, pending states, overflow and reduced motion. Representative desktop/mobile screenshots were visually inspected. They did not authenticate a new customer, call a model or write to a database.

The eight skipped cases need an isolated `TEST_DATABASE_URL`: three auth-sync integration cases and five database-release cases. No `.env.test.local` was present, and the user confirmed staging is not set up yet. The database-release suite requires `current_schema()` to start with `validore_test_`; prepare the application tables and test configuration in that isolated schema. These tests write synthetic rows. They were not silently run against the application's private database.

## Agent efficiency and pipeline checks

The new synthetic acceptance test runs the **real coordinator, agent wrappers, AI SDK generation, SDK tool calls, search cache, stored observation retrieval, schema validation, arithmetic and final merge**. Only external provider/web/DB boundaries are replaced. A global fetch guard rejects accidental external network calls.

| Scenario | Verified behavior |
| --- | --- |
| Full report | All nine specialists complete; valid full-report schema; 12-month calculation; unsupported market sizing remains unknown |
| Shared research | Five researching specialists request one identical query; one new public search occurs, in addition to three distinct initial queries |
| Stored indicator | India population is loaded from the bundled 2025 observation with no World Bank network request |
| Reuse by planning agents | Finance, product, growth and synthesis each use one report call and completed research |
| Full durable replay | Zero additional model or search requests; equivalent report content and usage, allowing parallel activity to arrive in a different order |
| Another Lite report | Three specialists complete; warm public cache adds zero public fetches; model analysis still runs |
| Invalid JSON | Only the failed report call is retried, and its reported usage is included |
| Private context | Private answers, inventions, names and private-derived findings are absent from every tool-enabled research prompt |

The controlled full fixture makes 19 model requests; Lite makes seven. Synthetic usage is fixed at 100 tokens per mocked request so accounting can be asserted. **These are not measurements of production token costs, latency or model quality.** Existing regression checks separately cover six-call model limits, six-tool-call budgets, concurrent provider quotas, keyed-search limits, duplicate reservations, atomic refund behavior, owner-only usage, no-store responses and interview idempotency.

The Usage page shows recorded validation tokens. It does not include every interview/planning-module call, provider usage omitted from errors, or unpersisted failed jobs. Credits are an application allowance, not a conversion to model billing. Live-model results in the preceding release remain historical evidence; this extension did not repeat those model calls.

## Before publication

1. Follow the [detailed Vercel launch guide](GO_LIVE.md), starting with a reviewed source release and isolated staging services.
2. Apply reviewed additive SQL, including **`drizzle/0003_founder_interviews_research.sql`**, before serving this revision against an existing database. Verify RLS/grants and owner boundaries in the actual target. Database seeding is separate and has not been run.
3. Complete final-domain auth/SMTP, Inngest delivery/retries, concurrent credit accounting, owned exports and optional Stripe acceptance. Synthetic local checks cannot establish hosted behavior.
4. Confirm processor retention, privacy request ownership, signup/consent paths, direct Supabase signup controls, backups and monitoring. Keep payments disabled until their full acceptance passes.
5. Run a bounded live Full/Lite check in staging when provider allowance is available, record actual requests/latency/usage and verify saved reports. The historically observed PixRouter allowance is a pilot constraint, not unlimited production capacity.

Artifacts under ignored `reports/` include `test-results-current.json`, `test-output-current.log`, `production-build-current.log`, `production-smoke.json`, `production-smoke-current.log`, `dependency-audit-current.json`, `dependency-audit-full-current.json`, `release-artifacts-current.json`, `diff-check-current.log` and `ui-fixture/verification.json`. Keep downloaded account/session artifacts private. Passing these checks does not certify zero defects or immunity from attacks.
