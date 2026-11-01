# Validore research agents

Validore uses a bounded team of research specialists. Authenticated users submit an owned idea, the server reserves credits, and Inngest runs durable steps before saving a report. Research tools read public sources; the server can cache responses and persist eligible official excerpts internally. Agents cannot publish content or write arbitrary shared records. Arithmetic and financial projections run in code.

## Workflows

| Stage | Full validation | Lite validation |
| --- | --- | --- |
| Shared research | Market, competitor and problem searches | Market search |
| Independent specialists | Market, customer and competitor, in parallel | Market and customer, in parallel |
| Analysis and planning | Finance, risk, source review, product and growth use the research digest, in parallel | Included in the final Lite synthesis |
| Final report | Synthesis reconciles the eight earlier specialists | Synthesis reconciles market and customer |
| Deterministic review | Citation provenance, unsupported sizing, founder hypotheses, score clamps and financial formulas | Citation provenance, unsupported sizing and score clamps |

Full validation has nine specialists; Lite has three. The full team is market, customer, competition, finance, risk, source review, product, growth and synthesis. Later specialists receive earlier findings and the collected sources. Retrieved pages, tool results, founder descriptions and agent summaries are untrusted data. Proposed personas, market sizing, financial assumptions and campaign projections must not be presented as observed traction.

The product strategist proposes value propositions, MVP scope, feature priorities and landing-page copy. The growth planner proposes experiments with owners and measurable thresholds. The source reviewer interprets retrieved text and records unresolved gaps. These agents perform research and planning; they do not publish a page, launch a campaign or conduct interviews. Their useful plans survive a failed final review, with an explicitly cautious recommendation.

Each researching specialist gets up to two research calls, then a separate tool-free JSON report call. Finance, product and growth work directly from the shared research digest; the coordinator checks financial arithmetic in code. Risk and source review retain focused research tools. Synthesis reuses completed research even when another specialist fails, preserving missing-evidence labels. Only structured SDK tool calls execute. Text such as `<tool_call>` never executes. The final call carries retrieved evidence and real calculation results; it does not replay pseudo-tool instructions. A complete JSON value, optionally inside one Markdown fence, must pass its Zod schema. A valid fenced response rejected by SDK JSON mode is validated locally without another provider call. An unfamiliar descriptive hypothesis category becomes `OTHER`; critical report fields remain validated.

Each model call receives a ranked evidence selection of at most twelve sources and 12,000 serialized characters. Source URLs, dates and memory limitations survive selection. Full-page readings supersede snippets for the same URL. This bounds repeated context rather than sending every source to every specialist. The reported token total still comes from provider usage; the app does not invent a percentage saved.

## Research tools and limits

| Tool | Behavior |
| --- | --- |
| `recall_market_memory` | Retrieves relevant, scoped, dated public knowledge from the private server library without a search or model request |
| `read_market_indicator` | Reuses stored World Bank population, GDP, GDP per capita, internet use, inflation, real growth, urban share or unemployment for an explicit country or WLD; fetches missing/expired evidence and preserves units and observation year |
| `search_web` | Searches public indexes first; can escalate only when the evidence is insufficient |
| `read_page` | Reads a discovered public URL using Mozilla Readability and linkedom, without executing page scripts |
| `list_evidence` | Reviews the team's existing source register |
| `inspect_evidence` | Checks source coverage, domains and retrieval dates; a retrieval date is not a publication date |
| `calculate` | Performs bounded add, subtract, multiply and divide operations |
| `calculate_financials` | Checks unit economics and a 12-month illustrative scenario |
| `compare_financial_scenarios` | Compares two to four explicit financial scenarios using the same formulas |
| `calculate_runway` | Calculates cash runway from stated cash, setup costs and constant monthly cash flows |
| `estimate_market` | Calculates annual TAM/SAM/SOM from nested customer counts and annual spend; inputs still need sources |
| `rank_priorities` | Ranks features or experiments by explicit reach, impact, confidence and effort assumptions |
| `estimate_sample_size` | Estimates a survey sample for a population proportion at 95% confidence, with optional finite-population correction |
| `analyze_conversion` | Calculates conversion and a Wilson 95% interval from supplied counts |

There are fourteen tools across the team. Shared research, memory, official-data and arithmetic tools are available to every researching role. Financial tools go to finance, risk, growth and synthesis; market sizing to market, finance, growth and synthesis; priority ranking to product, growth, risk and synthesis; survey/conversion tools to customer, product, growth, source review and synthesis. Tools are available when useful, not called merely to increase an activity count. Statistical tools assume appropriate independent sampling and do not establish real traction from hypothetical inputs.

An agent has six tool executions in total, at most three searches and two page reads. Budgets and evidence survive model fallback. Page reads are limited to 10 seconds and 1 MB. Private/local/reserved IPs, undiscovered URLs and unsafe schemes are blocked. DNS results are checked and pinned; redirect destinations are checked again. No user cookies or provider credentials go to research sites.

Tavily, Serper and SerpAPI are enabled as optional, limited fallbacks. They are not used for the initial shared searches. An explicit agent search can escalate when public results are sparse or degraded. Provider keys remain on their matching hosts. The combined default allowance is **two keyed searches per report and 30 per day**, enforced atomically in Redis in production. Successful results are cached for six hours; empty/keyed attempts have a short cache to avoid repeated spending. A configured SearXNG instance is also supported.

The [market memory](MARKET_MEMORY.md) contains sourced public context, not founder briefs or generated reports. Expired records are excluded. Readable public pages are cached for six hours (pricing URLs: one hour), and World Bank observations for one day, with shared Redis storage when configured. Reuse preserves the original retrieval timestamp. Cache failure falls back to retrieval; it never relaxes keyed-search budgets.

## Free model policy

The default is `AI_FREE_ONLY=true`. The configured order is PixRouter, OpenCode, then OpenRouter; provider rotation is opt-in. Role preferences favor Qwen for market/customer/finance/product/source review and Inkling for competition/risk/growth/synthesis. GLM and the automatic free router remain fallback candidates. See [model catalog and acceptance](AI_MODELS.md).

- PixRouter: `https://pixrouter.com/v1`, with four curated free aliases.
- OpenCode: `https://opencode.ai/inference/openai/v1`, with the five explicitly approved free IDs.
- OpenRouter: `https://openrouter.ai/api/v1`, with curated zero-price, tool-capable catalog entries.
- Paid native models require both `AI_FREE_ONLY=false` and an explicit paid preference.
- Optional Ollama supports explicitly enabled, installed models via its OpenAI-compatible endpoint. Set `OLLAMA_ENABLED=true`, `OLLAMA_MODELS`, `OLLAMA_FREE_MODELS`, and include `ollama` in the gateway allowlist/order. HTTP is restricted to loopback; remote endpoints require HTTPS and an operator-provided authentication key. Local inference still needs hardware or hosting. See [setup and source licenses](MARKET_MEMORY.md).
- A customer's custom OpenRouter key stays isolated from shared keys and providers. Saved keys are encrypted and never returned by `/api/me`.

A readable model catalog filters unavailable IDs and is cached for five minutes. Catalogs are bounded to 1 MB. HTTPS, host-bound credentials and no-redirect requests apply to official gateways. Authentication failures pause the key; PixRouter/OpenCode 429 responses pause the whole provider rather than retrying every model on the same exhausted account.

PixRouter reported **60 requests per rolling hour** on this account. `PIXROUTER_REQUESTS_PER_HOUR=55` reserves room for operations outside the app. Catalog and completion requests share one atomic rolling Redis budget across users and workers. Production calls fail closed if the distributed budget cannot be checked. Development without Redis uses a bounded in-memory counter. This is suitable for a controlled pilot, not an assurance of capacity for an unrestricted public launch.

Each specialist has a **240-second total budget**, at most **six model requests**, no SDK retries, a 60-second research-phase budget and a 120-second report attempt limit (150 seconds for synthesis). Explicit output-token limits and PixRouter's low reasoning setting prevent unbounded responses. Free availability and pricing remain provider-controlled; catalog presence alone is not acceptance.

## Durable execution and integrity

Inngest uses job-ID idempotency, two retries, one active validation per user and configurable global concurrency (default two). Full and Lite research, specialist and persistence steps are durable. Completed steps are reused on replay. Checkpoint batching is disabled so long steps stay within Vercel's 300-second handler limit. Keys are read on the server and excluded from saved step results. An interrupted individual step can still repeat external work, so shared request/search budgets also cover replay.

The coordinator saves reports and terminal job state together. Terminal failure refunds the original credit sources transactionally; a refunded job cannot later publish a report. Partial specialist results remain explicitly partial. Stale running jobs use a 15-minute threshold; queued jobs use a 60-minute threshold. Local `after()` execution is for development.

Citation review establishes that a URL was retrieved, not that the model's interpretation is true. Unmatched citations are downgraded. Market sizing must describe the actual reachable segment; a broad software industry total cannot stand in for the startup's TAM. A market size without a retrieved source is replaced with **Not established before finance and synthesis see it**, and Lite cannot reintroduce a number through final synthesis. Source presence still requires reviewing whether the cited passage supports the inputs.

The source review is saved in `evidenceReview`, shown in overview and narrative reports, and included in PDF/Word exports. Unknown source URLs become inconclusive with no active citation link. The reusable [report template](REPORT_TEMPLATE.md) includes an evidence register, unresolved assumptions and founder review using the same distinction between research, assumptions and proposed work.

Handoffs retain market methods, customer reasoning, competitor products/pricing and financial assumptions so the reviewer can assess consistency. Competitor lists may be short or empty instead of filling a minimum count with unrelated organizations. Founder hypotheses remain unvalidated because these agents perform desk research; they do not conduct interviews or experiments. Financial assumptions use USD in validation reports; the pricing simulator uses INR. Derived financial values are calculated deterministically.

## Stored research and private founder answers

The bundled snapshot contains **48 official WDI observations** for IN, US, GB, SG, BR and WLD, plus ten separately labeled official source references. Observation years are 2024–2025. Each observation retains its original retrieval date, units, geography, source URL and expiry. An official directory is a discovery reference, not a verified statistical table. Country totals do not establish a startup's TAM or willingness to pay. See [DATA_SOURCES.md](DATA_SOURCES.md).

`npm run data:refresh` fetches public HTTPS endpoints with no AI model, application API key, database connection or paid data API. It updates local project files. Review and release an updated bundle, or explicitly run the separate `npm run db:seed:research` command to write a reviewed snapshot to PostgreSQL. Runtime official reads can update the internal store after allowlist, size, metadata and freshness validation. Model output, snippets, arbitrary competitor pages, private answers and query-reflecting URLs cannot enter that durable shared store. Expired evidence is excluded, and maintenance prunes revisions more than 90 days past expiry. Vercel functions cannot persist changes to repository JSON.

An optional founder interview saves up to 12 answers across customer, problem, demand, solution, market, alternatives, pricing, economics, acquisition, execution, risk and experiment dimensions. Starting requires a verified account and the current processing notice. Answers are stored before tailoring. A request has a 22-second budget, at most two model calls and no research tools; unknown answers, limits and provider outages use guided questions. Limits are eight mutations per minute and 60 tailoring attempts per account per day. Identical retries do not generate again. Version checks prevent an old tab or late model response from overwriting newer answers or restoring a deleted interview.

Owner-scoped answers inform validation, Lean Canvas, pricing, crowdfunding and pitch generation. Outdated briefs and notices are excluded from new analysis. The interview assesses submitted clarity and self-reported evidence, not the person's competence or probability of success. Founder-specific answers are never pooled into a shared question dataset; reusable question methodology is source-controlled separately.

Tool-enabled research receives a separate public brief containing bounded industry, geography and generic customer descriptors. Startup names, invention descriptions, prior private-derived findings and private answers enter only the final tool-free output call. Without a separate public research brief, a private-context request defaults to no research tools. Relevant private context is processed by configured AI providers and may be stored in Inngest durable history; processor retention is an operator responsibility described in the privacy notice.

## Repeatable acceptance

Run the local agent checks without external model calls:

```powershell
npm run verify:agents
npm run verify:release-files
```

`tests/agent-pipeline.test.ts` runs the real coordinator, agent wrappers, AI SDK, tool execution, search cache, bundled data and report schemas with synthetic provider/web boundaries. It verifies all nine full specialists, the three-specialist Lite flow, private-context separation, search sharing, JSON fallback accounting and durable replay. Its 19 full / 7 Lite model requests and synthetic token values are test conditions, not measured provider cost or latency. In this test, replay adds zero model requests and a second Lite report adds zero public fetches while still requiring model analysis. The release-file check verifies ignore rules against private/generated and required public inputs without uploading anything.

The [latest release evidence](PRIVACY_DATA_RELEASE_2026-11-01.md) separates these checks from hosted acceptance. Usage shows **recorded validation tokens**, not total provider billing. Interview and other planning-module tokens, failed calls without reported usage and unpersisted failed jobs are not included in that validation total. Provider dashboards remain the billing/capacity source of truth.

These commands use synthetic ideas, do not write customer reports or charge workspace credits, and do consume external provider/search allowance:

~~~powershell
npm run verify:ai -- --live --provider=pixrouter
npm run verify:validation -- --live --mode=full --provider=pixrouter
npm run verify:validation -- --live --mode=lite --provider=pixrouter
~~~

Tool/JSON verification fails if any selected model fails. Workflow acceptance fails if any required specialist fails. Results are saved under ignored `reports/`. Run within the provider allowance rather than repeatedly probing a rate-limited key.

The workflow CLI saves synthetic step checkpoints. To retry an interrupted full check without repeating successful specialists, add `--resume` to the full validation command. The saved checkpoint must match the mode/provider; non-null completed steps are reused, failed steps run again, and the keyed-search budget ID is retained. The result lists `resumedSteps`. A normal command without this flag starts a fresh run.

[Implementation status](IMPLEMENTATION_STATUS.md) records local checks. Final-domain authentication, real Inngest delivery, concurrent credit accounting and provider capacity still require hosted acceptance before launch.
