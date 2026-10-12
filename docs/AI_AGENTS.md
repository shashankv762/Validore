# Validore agent architecture

The project keeps its specialist validation engine and adds a deterministic evidence supervisor plus a durable job coordinator. Agents generate structured proposals and analysis; they cannot run shell commands, change accounts, make purchases, or deploy software.

## Workflow

1. Authenticate the user and verify ownership of the editable idea.
2. Lock/check monthly usage and reserve the validation's credits before accepting work.
3. Persist the job and send only user/job IDs to Inngest. Keys stay in server storage.
4. Run market, customer, competitor, finance, risk, and synthesis agents. Search results and founder text are untrusted data.
5. Check citation URLs against retrieved sources. Missing/invented links become weak and unverified; matching a URL does not verify its claim.
6. Compute weighted scores and financial formulas deterministically from the stated assumptions.
7. Save the report and terminal job status together. Partial agent results are labeled partial.
8. After terminal failure, restore the original credit sources and update failed status in the same transaction. A refunded job cannot later publish a new report.

The Inngest function has two retries, job-ID idempotency, one simultaneous durable validation per user, and a configurable global concurrency limit (default two). Its generation step currently reruns the analysis on retry; provider spending can exceed the cost of a single attempt. Save is idempotent through job locks and a unique job/report index.

Local development uses Next.js after(). Process shutdown can interrupt local work, so public operation should use the configured queue and monitor stale/failed jobs. This implementation is not a general-purpose autonomous agent platform.

## Provider controls

Each request has a finite overall budget (default 120 seconds), at most 45 seconds per attempt, at most 20 attempts, explicit output-token bounds, and no automatic SDK retries. Official providers use AI SDK structured output. Generic gateways use chat completions and JSON instructions, then validate the complete JSON value against the same Zod schema; invalid JSON or schema failures trigger fallback. Surrounding prose is rejected.

Free-only mode restricts gateways to the explicit *_FREE_MODELS allowlists, then tries configured OpenRouter free routing. All-model mode tries configured gateways, followed by official provider fallbacks. A free label/allowlist is an operator declaration, not a verified price guarantee. Custom-key mode only uses that user's OpenRouter key and does not silently fall back to shared credentials.

## Compatible gateway configuration

Three optional profiles are supported: KIOS, SEEKAI, and AGENTROUTER. Each has its own API_KEY, BASE_URL, MODELS and FREE_MODELS variables in .env.example. Models are exact comma-separated IDs, deduplicated and bounded to 30 per profile. Missing/invalid profile settings disable that profile. Keys are not interchangeable between hosts. HTTPS is required; URL credentials, query strings and fragments are rejected. Catalog and completion requests reject redirects.

The supplied configuration contains 13 candidates:

| Gateway | Candidate IDs |
| --- | --- |
| Kios | agnes-3.0-flash, glm-5.3-flash-free, atria-dawn-preview, step-5-preview-free, qwen3.8-flash-free |
| SeekAI | minimax-m2.7:free, moonshotai/kimi-k3, MiniMax-M2.7-highspeed, claude-sonnet-4-6, claude-sonnet-4-20250514, deepseek-ai/DeepSeek-V4-Flash-0731, deepseek-v4.1-flash |
| AgentRouter | deepseek-v4-flash |

A readable /models catalog filters out IDs the provider does not advertise and is cached for five minutes. Failed/malformed/unsupported catalogs leave availability unknown, so configured candidates can still be tried. A catalog authorization rejection is cached briefly. Catalog responses are limited to 1 MB. Model failures use a 30-second cooldown; completion authorization failures pause that host. Requests interleave hosts so the first host cannot consume every fallback slot. Specialist roles rotate the first host; AI_AGENT_*_MODELS can prioritize configured IDs within a host. No model capability ranking is claimed without acceptance tests.

The supplied AgentRouter root URL is normalized to /v1 on the same host for OpenAI chat compatibility. Confirm this path in the account's dashboard. No key is forwarded to a different gateway hostname. The keys are stored only in ignored .env.local; they must be supplied separately to a future host's secret manager.

Read-only catalog requests could not reach the three supplied endpoints in this session. All 13 IDs remain unverified; no live generation was executed. Routing and focused mock regressions are authored, but their latest automated verification is blocked by the required R-only worker environment.

OpenRouter free routing selects available models; operators can pin approved model IDs with OPENROUTER_FREE_MODELS. Review provider retention/usage settings before accepting confidential founder inputs. Availability, quotas, and pricing are provider-controlled. See [OpenRouter free models](https://openrouter.ai/collections/free-models/).

Custom keys are encrypted with AES-GCM using a server-only 32-byte hex key. Saved key values are not returned by /api/me and are not kept in browser storage. Browser settings only display whether a key is present.

## Scaling boundaries

Keep VALIDATION_GLOBAL_CONCURRENCY low on the free host. Increase it only after measuring memory, DB connections, provider quotas, and queue capacity. DB_MAX_CONNECTIONS bounds each app process's PostgreSQL pool; application replicas multiply this number. Redis enforces production abuse controls and local module concurrency.

History queries are bounded and the database delta adds the common owner/status/history indexes. Persistence, credit spending, refunds, and payment fulfillment use database transactions. Purchased module packs pay for a module run without a second universal-credit debit; other module charges commit with their saved result.

Before launch, exercise enqueue/retry/failure/partial paths and multi-user ownership in staging. CI mocks and source review do not validate hosted queue delivery, provider compatibility, RLS, or concurrent real database transactions.
