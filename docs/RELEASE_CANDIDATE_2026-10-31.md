# Validore release candidate evidence

> Earlier checkpoint, before account usage and market-memory completion. See the [November 1 release evidence](RELEASE_CANDIDATE_2026-11-01.md) for the current verification results.

This records the local Vercel release preparation on October 31, 2026. It covers the refreshed auth/workspace, nine-agent validation, bounded free-provider research, shared report exports and reusable document templates. The source is uncommitted. No Vercel deployment, domain change, live schema migration or production payment acceptance is claimed.

## Automated checks

| Check | Result |
| --- | --- |
| Node and Next.js | Node 24.14.1; Next.js 16.4.3 |
| Strict lint | Passed |
| Next route generation and TypeScript | Passed |
| Full Vitest suite | 373 passed, eight skipped; 43 files passed, one skipped |
| Export checks after final Word formatting | Ten passed |
| Production build | Passed; 50/50 pages generated |
| Standalone smoke | All ten groups passed |
| Production dependency audit | Zero reported vulnerabilities |
| Full dependency audit | 20 moderate development-dependency findings; no high or critical findings |
| Credential packaging check | No matching private credentials in 265 candidate source files or 42 built client files; public Supabase keys classified separately |
| Diff whitespace check | Passed |

The eight skipped cases require an isolated `TEST_DATABASE_URL`: three auth-sync integration cases and five database-release cases. The test suite does not load customer database credentials from `.env.local`. Mock/contract tests are not hosted acceptance.

## Live provider and workflow evidence

The PixRouter catalog returned 682 IDs, including 30 free-labelled aliases. Four selected aliases passed small, actual tool-call/result/JSON round trips: Qwen 3.8 27B, Inkling, GLM 4.5 Flash and `openrouter/free`. Other free-labelled aliases were catalogued, not exhaustively benchmarked. The [model document](AI_MODELS.md) lists the exact IDs and account limitations.

| Workflow | Finished at UTC | Specialists | Elapsed | Reported tokens | Agent search calls |
| --- | --- | --- | --- | --- | --- |
| Current full, fresh run | 2026-10-31 15:02:47 | 9/9 | 39 seconds | 84,307 | One additional successful search |
| Earlier Lite run | 2026-10-31 13:59:23 | 3/3 | 160 seconds | 43,098 | Four successful searches |

Both used Qwen and Inkling through PixRouter. Shared initial research is separate from the agent tool log and can use the search cache. Reported token totals may omit failed attempts; these are not exact billing totals or capacity guarantees. The current full run reused no CLI checkpoint steps.

The current report retained 15 source entries, matched four evidence citations with no unknown URL, left unsupported market sizing as **Not established**, and kept all founder hypotheses unvalidated. The source reviewer produced four interpretations and three evidence gaps. Citation matching and a completed schema do not establish that every interpretation is accurate; original passages and business assumptions still require review.

An earlier six-specialist run completed in 207 seconds. A later intermediate six-specialist run completed five specialists but failed synthesis on unexpected descriptive hypothesis categories. The subsequent fix keeps critical fields strict, maps unfamiliar descriptive categories to `OTHER`, recovers valid fenced JSON without an extra provider call, and reuses completed research in synthesis. The passing nine-specialist run above follows those fixes. Intermediate failure evidence was retained rather than relabeled as a pass.

OpenRouter last returned HTTP 401 with “User not found”; OpenCode last returned HTTP 429 with exhausted free allowance. PixRouter reported 60 requests per rolling hour; the app's shared Redis limit is 55, including catalog requests. Restoring backup access and testing hosted throughput remain owner launch work.

Local raw evidence is in ignored `reports/ai-provider-acceptance-pixrouter.json`, `reports/validation-acceptance-full-before-market-memory.json`, `reports/validation-acceptance-lite.json` and the synthetic workflow checkpoints. These CLI checks do not write customer reports or charge workspace credits.

## Browser and document review

Authenticated browser checks cover workspace navigation, owned report access, settings, credits and module screens. Pricing, crowdfunding and pitch interactions used local browser fixtures to exercise premium screens without changing the user's plan or invoking paid analysis. Checks include loading recovery, field labels and removal of stale pricing exports when inputs change.

The expanded nine-card Research team, source-review panel, and report overview/narrative passed at 1440, 768, 390 and 320 pixels without horizontal overflow or uncaught browser errors. The source-review UI test used the saved synthetic live result as a browser-only fixture. Actual report downloads used an existing owned record: both PDF and DOCX returned 200 with `private, no-store` responses. Blank template links downloaded byte-for-byte copies of the generated files.

The reusable PDF and Word templates have five A4 pages. Every page was rendered and inspected. A split PDF field that created a nearly empty page and a Word font substitution were corrected. The downloaded owned report had four pages in each format, also inspected page by page. Word now uses Arial; its layout was reviewed through an isolated LibreOffice renderer, not Microsoft Word. PDF uses the shipped Noto font files. The [template guide](REPORT_TEMPLATE.md) records the structure and regeneration command. Existing saved report findings were preserved; exporting an older record does not rerun it through the newer agents.

Browser evidence is retained locally under ignored `.tmp/ui-acceptance/`, `.tmp/ui-modules/` and `.tmp/ui-research/`. Document review images and private downloaded reports remain under `.tmp/`; they are excluded from Git and Vercel uploads. The production smoke summary is `reports/production-smoke.json`.

The credential check used known provider-key patterns in candidate source files and exact configured private values in built client assets. It is a focused packaging check, not a comprehensive security audit. Its redacted result is `reports/release-secret-check.json`.

## Hosted work still required

Follow [GO_LIVE.md](GO_LIVE.md) for Vercel import, server secrets, Supabase/Redis/Inngest, Google consent branding, exact project-specific apex/www DNS records, and rollback. Review the SQL deltas and database access against staging before changing a backed-up deployment. Complete final-domain email/Google/recovery, real queued reports, credit reservation/refunds, owned exports and billing acceptance if payments are enabled. Preserve existing mail DNS and keep one active production job/cron endpoint during cutover.

This evidence supports a local release candidate and a controlled launch process. It does not establish unrestricted free-provider capacity, independent fact verification, real-device behavior or a zero-defect production system.
