# Market memory and free research tools

Validore reuses public research on the server, gives each specialist a bounded source selection, and reserves search-key calls for material gaps after public search fails. This reduces repeated retrieval and prompt context without treating old market information as current.

## What is stored

`src/data/market/seed-sources.json` contains **48 official World Bank observations**, collected with GPT-6 Astra in the development session: eight indicators each for India, United States, United Kingdom, Singapore, Brazil and World. The actual collection occurred on November 1, 2026 in India (October 31 UTC); observation years are **2024–2025**. `source-catalog.json` adds **10 official directory references**, with no numeric evidence inferred from application shells. [DATA_SOURCES.md](DATA_SOURCES.md) records URLs, definitions, timestamps, upstream agencies, known limitations and collection failures.

`src/lib/ai/market-memory.ts` also retains six reviewed contextual records listed below. Public research is imported by server code and has no browser Data API endpoint. The shared store contains no API keys, founder briefs, customer reports or private interview transcripts. The JSON sources can be reviewed in the repository; internal storage is an access boundary for the app, not a claim that public statistics are secret.

| Layer | How it is used |
| --- | --- |
| Bundled observations | Search recall and exact country/indicator lookups without a database or live request while unexpired |
| Reviewed history and catalog | Dated context and source discovery; directories are explicitly not observations |
| Redis caches | Short-lived public search/page reuse across instances |
| PostgreSQL `research_sources` | Eligible official page/indicator revisions reused across requests; optional seeding and automatic writes after eligible live retrieval |
| PostgreSQL `founder_interviews` | Private account/idea history used only for that owner's question selection and analysis; never shared market memory |

Run `npm run data:refresh` to refresh local public data using direct HTTPS, with **no AI API tokens**. Review the diff/status report. The script validates country/indicator/year, preserves earlier coverage when collection fails, and writes files atomically. It does not deploy or write a database. After migration `0003`, optional `npm run db:seed:research` writes the reviewed snapshot to the configured database. Updating repository JSON requires a new deployment to update a deployed bundle; updating PostgreSQL is a separate explicit maintenance operation.

The initial sources were reviewed on October 31, 2026:

| Source | Remembered scope | Observation period |
| --- | --- | --- |
| [World Bank WDI](https://datatopics.worldbank.org/world-development-indicators/) | Dataset availability, metadata and indicator methodology | Varies; numerical values must be fetched |
| [World Bank Enterprise Surveys](https://www.enterprisesurveys.org/en/methodology) | Formal-firm coverage, sampling and comparison limitations | Survey-specific |
| [RBI Digital Payments Index release](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=58371) | Historical index of 445.50, with March 2018=100 | March 2024; not a current payment-volume measure |
| [Government of India MSME backgrounder](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2278107&lang=1&reg=1) | Combined Udyam/UAP registrations above 8.7 crore | June 2026; registrations are not active paying customers |
| [Stanford AI Index 2026](https://hai.stanford.edu/ai-index/2026-ai-index-report/economy) | 88% adoption among surveyed organizations | 2025; a survey, not a population census |
| [U.S. Census County Business Patterns](https://api.census.gov/data/2023/cbp.html) | Employer establishments, employment and payroll by industry/geography | 2023 dataset; check current methodology before estimates |

Records expire after 30 or 90 days according to their source policy. An expired record is omitted, not silently given a new date. Historical records always retain their observation period. Current competitor prices, laws and market trends require fresh evidence. A source's presence is not proof that it supports a model's claim.

To update the library, open each original source, confirm the claim, denominator, geography and data period, and update the record and retrieval date. The current library uses a shared verification date: recheck **all** records before advancing it. Do not ingest model-written summaries as verified facts without source review. Keep `MARKET_MEMORY_ENABLED=true`, or set it to `false` to disable the starter library.

## Runtime memory and token limits

Public query results and successfully read pages use bounded process caches plus Redis when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. Query and URL keys are hashed. Only public evidence is shared between users; reports and startup briefs are not a shared cache. Serverless process memory is temporary, so configure Redis for reuse across instances.

| Memory | Lifetime |
| --- | --- |
| Successful search results | Six hours |
| Empty search responses | Three minutes |
| Public article text | Six hours |
| Pricing/subscription page text | One hour |
| World Bank observations in the short-lived cache | One day |
| Bundled/eligible durable World Bank observations | Up to 30 days from the original retrieval |
| Eligible durable official page excerpts | Seven days by default, never more than 30 |

Reused sources keep their original retrieval date. Dates are distinct from publication and observation periods. Cache storage is optional for free public retrieval; distributed Redis checks remain required for production keyed-search spending. Default combined search limits remain two keyed calls per report and 30 per day across Serper, Tavily and SerpAPI. Set `SEARCH_KEYED_ENABLED=false` for public-source-only research.

Exact indicator lookups check caches, eligible PostgreSQL records and the bundled country/indicator pair before fetching. General recall filters an explicit geography; requesting India does not silently substitute another country's value. WLD is global context. A live eligible official source can refresh the private server store without changing its observation period. Content digests preserve revisions; old writes cannot move retrieval dates backward. Expired records are excluded and eventually pruned by daily maintenance. Storing a page is not verification of the model's interpretation.

`RESEARCH_STORE_ENABLED=false` disables the bundled/durable observation layer; `MARKET_MEMORY_ENABLED=false` disables the reviewed contextual library/catalog. Neither is a provider-spending switch. The refresh script itself makes no model calls, but analyzing stored data, tailored questions and generated reports still consume model tokens. Local inference is an option below.

The evidence selector keeps at most twelve sources within 12,000 serialized characters per generation call. Finance, product and growth reuse the preceding research. The source reviewer can read original pages and the risk specialist can research important gaps. Partial research is reused in synthesis instead of automatically starting the research phase again. Provider token counts are recorded when returned; savings are not represented as an invented percentage.

## Free and open-source capabilities

The app includes deterministic arithmetic, unit economics, scenarios, runway, TAM/SAM/SOM, priority ranking, survey sample sizing and conversion intervals. These calculations require no model or search request. Inputs remain assumptions unless supported by evidence.

`recall_market_memory` retrieves public context and stored observations. `read_market_indicator` supports population, nominal GDP, GDP per capita, internet use, annual inflation, real GDP growth, urban population share and modeled unemployment, with an ISO country code or `WLD`. It reuses the exact stored indicator or makes a bounded official request. Negative inflation/growth is valid; missing values are not zero. Units, country and observation year remain attached. National GDP/population is not a startup's TAM.

The curated 12-topic question bank is reusable methodology, not survey results. Founder answers are stored separately with self-reported evidence labels and a brief fingerprint. AI follow-ups use the answer history to clarify important gaps; guided fallbacks do not invent a clarity score. Analysis research receives only public descriptors and source evidence; private answers and derived findings remain in the final tool-free stage. Shared memory never learns by pooling private founders' answers.

Mozilla Readability and linkedom extract readable public text without executing page scripts. SearXNG and Ollama are optional self-hosted services; they are not deployed inside a Cloudflare Worker function.

### SearXNG

1. Deploy your own instance using the [official container instructions](https://docs.searxng.org/admin/installation-docker.html).
2. Enable `json` under `search.formats` in its settings. The app calls `/search?q=...&format=json`; disabled formats return 403.
3. Set `SEARXNG_BASE_URL` to the reachable public HTTPS base URL. The research reader rejects private-network targets and nonstandard ports.
4. Keep upstream engine limits and instance access controls appropriate for your deployment. Public instances often disable API access; do not assume unlimited availability.

SearXNG is [AGPLv3](https://github.com/searxng/searxng/blob/master/LICENSE). See its [search API documentation](https://docs.searxng.org/dev/search_api.html).

### Ollama

1. Install Ollama and choose an installed model that supports tool calls and JSON output. Review that model's license and your machine's memory requirements.
2. Set the following server variables, replacing the model placeholder with its exact installed ID:

```dotenv
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://127.0.0.1:11434/v1
OLLAMA_MODELS=your-installed-model
OLLAMA_FREE_MODELS=your-installed-model
AI_GATEWAY_ENABLED=ollama,pixrouter,opencode,openrouter
AI_GATEWAY_ORDER=ollama,pixrouter,opencode,openrouter
AI_FREE_ONLY=true
```

3. For deployment on Cloudflare Worker, run inference on a separate server. Set an HTTPS `OLLAMA_BASE_URL` and `OLLAMA_API_KEY` for an authenticated gateway in front of it. The native local Ollama API does not authenticate requests, and Cloudflare Worker's localhost is not your computer. Do not expose an unauthenticated inference service publicly.
4. Verify tool-call and structured-report behavior with the selected model before relying on it. If it fails, the configured free-provider fallback and existing request budgets still apply. Customer BYOK mode remains isolated to the customer's OpenRouter key.

Ollama's runtime is [MIT licensed](https://github.com/ollama/ollama/blob/main/LICENSE); model licenses are separate. Local inference has hardware/hosting costs even when there is no per-token API charge. References: [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [authentication](https://docs.ollama.com/api/authentication).

## Account usage

Credits, Usage, Settings and planning tabs share `/api/me` account state. Balances refresh after analyses, on focus/navigation, and periodically while visible. The Usage page reads authenticated, owner-scoped database aggregates and displays recorded validation tokens separately from app credits. Unreported/failed provider requests and other modules are not included in that token number. No token-to-dollar estimate is invented.

Plan prices are defined in `src/lib/plans.ts`, action costs in `src/lib/credit-costs.ts`, and add-on prices in `src/lib/credit-packages.ts`. New subscription checkout verifies the configured Stripe monthly USD amount against the advertised plan. Existing subscribers can still reach the billing portal.
