# Account, usage and research release evidence

> Earlier checkpoint. The privacy/interview extension and new SDK pipeline checks are recorded in [PRIVACY_DATA_RELEASE_2026-11-01.md](PRIVACY_DATA_RELEASE_2026-11-01.md). Counts and live-model runs below describe the preceding revision and are preserved as historical evidence.

Updated November 1, 2026 (Asia/Kolkata). This completes the continuation for synchronized prices, credits and usage, more efficient specialist research, server-side market memory, and free research tools. Changes remain local and uncommitted. Deployment instructions are in [GO_LIVE.md](GO_LIVE.md); no previous-host deployment, DNS change, customer database migration or payment was performed.

## Completed behavior

- Credits and Usage appear above Settings. The sidebar, account pages and planning modules share one account state, refresh after analysis and across tabs, and recover from expired sessions or temporary failures. Manual refresh makes one usage/ledger request; account updates arriving during an existing request are not lost. A previous account's usage, credit history and idea list are not displayed after an account change.
- Existing amounts are preserved: Free **$0 / 100 credits**, Premium **$29 / 1,500 credits**, Max Premium **$79 / 4,500 credits**. Plan prices, action costs and add-on packages have shared definitions. Top-ups do not bypass feature or validation limits. New subscription checkout checks the configured monthly USD price and replaces an open checkout referencing an outdated price.
- Usage queries are authenticated and scoped to the owner and credit cycle. Recorded validation tokens, app credits and module credits remain separate. Refund entries record the credits actually restored; expired or capped plan credits cannot inflate the ledger or erase spending in a new cycle. Duplicate refunds remain idempotent.
- Full reports use nine specialists and Lite uses three. Fourteen tools include dated market-memory retrieval and official World Bank observations, alongside deterministic planning calculations. Finance, product and growth reuse prior research; synthesis reuses partial findings. Evidence context is limited to twelve sources and 12,000 serialized characters per generation call. Read pages take precedence over snippets, and a memory is omitted if its complete limitations will not fit.
- Public pages and official observations are cached with their original retrieval dates. Search-key fallbacks retain the combined default limits of two calls per report and thirty per day. Optional Ollama and SearXNG setup, source dates and limitations are documented in [MARKET_MEMORY.md](MARKET_MEMORY.md).

## Verification

| Check | Result |
| --- | --- |
| Strict ESLint | Passed |
| Next route generation and TypeScript | Passed |
| Full Vitest suite | **405 passed, 8 skipped**; 49 files passed, one skipped |
| Production build | Passed; **51/51** pages generated |
| Standalone smoke | All **10** groups passed |
| Production dependency audit | **0** reported vulnerabilities |
| Browser layout checks | Credits, Usage, Settings and Research team at **1440, 768, 390 and 320px**; no horizontal page overflow or unlabeled visible form controls |
| Browser interactions | Refresh deduplication, pending-update replay, cross-tab balances, session recovery, account isolation, price consistency and post-analysis balance refresh passed; no uncaught browser errors |
| Public data tool | Live India population retrieval returned the **2025** observation; repeat used the cache and preserved the retrieval date |
| Source/client packaging | No exact configured private credentials found in checked source or client files; server-memory markers absent from the 46 checked client files |
| Diff whitespace | Passed |

The eight skipped tests require a dedicated `TEST_DATABASE_URL`. No isolated database was configured; Docker's database runtime was not running. Tests did not use the customer database. SQL refund checks validate generated queries and accounting boundaries, but do not replace staging transaction/concurrency acceptance.

The browser run used a local synthetic authentication endpoint and intercepted account/module APIs. It exercised the actual application pages without changing a real plan, charging credits or requesting AI generation. Its evidence is under ignored `.tmp/ui-account-resume/`. Earlier real owned-report downloads and document layout review are recorded in the [October 31 checkpoint](RELEASE_CANDIDATE_2026-10-31.md).

The private-value packaging check is focused, not a comprehensive security audit. The last full dependency audit recorded twenty moderate development-tool findings; the production audit above was rerun for this continuation.

## Fresh live full workflow

The same synthetic startup-research scenario completed with Qwen and Inkling through PixRouter, using the approved free aliases. All nine specialists succeeded, with no reused CLI checkpoint steps.

| Run | Completed at UTC | Elapsed | Reported tokens |
| --- | --- | --- | --- |
| Earlier nine-specialist checkpoint | 2026-10-31 15:02:47 | 39 seconds | 84,307 |
| Current research implementation | **2026-10-31 18:28:17** | **31 seconds** | **69,209** |

The latest run successfully called `read_market_indicator` and one additional `search_web` tool. It retained seventeen source entries, including one dated memory and one official indicator, while keeping unsupported TAM/SAM/SOM as **Not established**. A separate live public-data check confirmed cache reuse without advancing the source's date.

These are individual runs with different cache/provider conditions, not a controlled performance benchmark or a guaranteed saving. Provider token totals can omit failed requests. Completion and citation provenance do not establish that every interpretation is correct. The checks use provider/search allowance but do not write customer reports or spend workspace credits.

Local evidence:

- `.tmp/resume-tests.json`
- `.tmp/ui-account-resume/audit.json`
- `reports/validation-acceptance-full.json`
- `reports/validation-acceptance-full-before-market-memory.json`
- `reports/open-data-acceptance.json`
- `reports/production-smoke.json`
- `reports/resume-release-package-check.json`

These files are excluded from Git and previous-host uploads. The dated document preserves the summary independently of the temporary evidence.

## Remaining launch work

Follow the current [Cloudflare launch guide](GO_LIVE.md) for deployment, nameservers, secrets and hosted acceptance. Earlier checks above do not verify the current Worker build.

The latest fallback-account checks remain OpenRouter HTTP 401 and exhausted OpenCode allowance; those accounts were not retested here. Ollama and SearXNG adapters have not been accepted against a deployed instance. Restore sufficient provider capacity and complete hosted acceptance before a broad launch.
