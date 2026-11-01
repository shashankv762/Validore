# Free models and live acceptance

Checked on October 31, 2026 against the configured accounts. Keys stay in ignored local environment variables or the deployment secret store. This document contains no credentials.

## PixRouter selection

Base URL: `https://pixrouter.com/v1`, using its OpenAI-compatible chat-completions interface.

The returned catalog contained **682 model IDs, including 30 free-labelled aliases**. Every catalog entry was inspected for its free label. The catalog did not supply usable pricing or tool-capability metadata, so availability and capability were checked separately. Only the four requested candidates below are enabled for PixRouter.

| Model ID | Selected use | Live tool-result and JSON check |
| --- | --- | --- |
| `qwen/qwen3.8-27b:free` | First choice for market, customer, finance, product and source review | Passed; 39.5 seconds for the small probe |
| `thinkingmachines/inkling:free` | First choice for competition, risk, growth and synthesis | Passed; 40.9 seconds for the small probe |
| `z-ai/glm-4.5-flash:free` | Named free fallback | Passed; 9.4 seconds for the small probe |
| `openrouter/free` | Last PixRouter fallback; underlying model can vary | Passed; 3.7 seconds for the small probe |

Each probe required an actual structured tool call, a returned calculation result, and valid JSON using that result. Probe times describe a small test and should not be treated as report latency or a model-quality ranking. `openrouter/free` here is an alias served by **PixRouter**; it does not use the separate OpenRouter key.

The latest fresh full workflow completed all nine specialists with Qwen and Inkling in 31 seconds at 2026-10-31 18:28 UTC. It used the World Bank indicator tool and one additional agent search, and reported 69,209 tokens. The earlier nine-specialist run reported 84,307 tokens in 39 seconds; cache/provider conditions differ, so this is not a controlled benchmark or a guaranteed saving. Failed calls may not be included in provider usage summaries. Lite previously completed market, customer and synthesis. These runs establish completion on the tested inputs, not a latency guarantee or factual certification. See [current release evidence](RELEASE_CANDIDATE_2026-11-01.md) for the runs, test counts and review limits. GLM and the automatic router passed the small protocol checks; a complete specialist workflow has not been benchmarked on each of them.

Role preferences reflect this application's tested workflow. The other 26 free-labelled aliases have not passed live application acceptance and are excluded from the initial PixRouter selection. No exhaustive comparative quality benchmark has been run.

## Account capacity and fallback behavior

PixRouter explicitly returned a **maximum of 60 requests in a rolling 60-minute window**. The default `PIXROUTER_REQUESTS_PER_HOUR=55` shares an atomic rolling Redis allowance across catalog queries, agents, users, workers and fallback attempts. The five-request margin leaves some room for account operations outside the app. The provider's own counter remains authoritative.

Free research typically needs several requests per specialist. A nine-specialist report can consume a substantial part of this allowance. Start with a controlled pilot and measure capacity before broad public onboarding. Increasing the application limit does not increase the provider allowance.

Production blocks PixRouter calls if the Redis budget cannot be checked. A PixRouter 429 pauses the whole provider; the system does not retry every alias against the same exhausted account. Authentication errors also pause the failing key. Available configured providers can still be used through the bounded fallback chain.

The app defaults to `AI_FREE_ONLY=true`, `AI_GATEWAY_ORDER=pixrouter,opencode,openrouter`, no rotation and no direct paid-provider priority. The server restricts PixRouter to the four approved free aliases. Check account pricing and allowance in the provider dashboard before launch because the catalog omits price metadata.

## OpenCode and OpenRouter

| Provider | Configuration | Last observed access |
| --- | --- | --- |
| OpenCode | `https://opencode.ai/inference/openai/v1` | HTTP 429: free usage allowance exhausted |
| OpenRouter | `https://openrouter.ai/api/v1` | HTTP 401: “User not found” with the supplied replacement key |

The OpenCode Anthropic-compatible endpoint supplied by the owner is `https://opencode.ai/inference/anthropic`. This app uses the OpenAI-compatible endpoint consistently for its current gateway adapter.

OpenCode's approved IDs are `deepseek-v4.1-flash-free`, `glm-5.3-flash-free`, `mimo-v2.6-flash-free`, `nemotron-3.5-super-vl-free`, and `big-pickle`. Catalog/model policy is configured, but exhausted allowance prevents claiming live acceptance on this account.

OpenRouter's configured free candidates are `nvidia/nemotron-3.5-super-vl:free`, `nvidia/nemotron-3-ultra-550b-a55b:free`, and `google/gemma-4-31b-it:free`. When the catalog is readable, the adapter filters for zero-price, tool-capable candidates. Restore working account access before relying on this fallback.

## All free-labelled IDs returned by PixRouter

This is a catalog snapshot, not a guarantee that every entry accepts the same input modality, supports tools, or is available to this key. Speech, safety, small and specialized aliases are not automatically added to the research team.

```text
cohere/north-mini-code:free
dots-studio/dots-3-note-preview:free
google/gemma-4-26b-a4b-it:free
google/gemma-4-31b-it:free
liquid/lfm-2.5-2.6b:free
meta-llama/llama-prompt-guard-2-22m:free
meta-llama/llama-prompt-guard-2-86m:free
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
nvidia/nemotron-3-super-120b-a12b:free
nvidia/nemotron-3-ultra-550b-a55b:free
nvidia/nemotron-3.5-content-safety:free
nvidia/nemotron-3.5-lightning:free
nvidia/nemotron-3.5-super-vl:free
openai/gpt-oss-120b:free
openai/gpt-oss-20b:free
openai/gpt-oss-safeguard-20b:free
openai/whisper-large-v3-turbo:free
openai/whisper-large-v3:free
openrouter/free
poolside/laguna-s-2.1:free
poolside/laguna-xs-2.1:free
qwen/qwen3.8-27b:free
recursive/flint-v1.0:free
sdaia/allam-2-7b:free
thinkingmachines/inkling-small:free
thinkingmachines/inkling:free
xingchen-agi/xing4.0-29b-a4b:free
z-ai/glm-4.5-flash:free
z-ai/glm-4.6v-flash:free
z-ai/glm-4.7-flash:free
```

## Recheck after changing access or model selection

```powershell
npm run verify:ai -- --live --provider=pixrouter
npm run verify:validation -- --live --mode=full --provider=pixrouter
npm run verify:validation -- --live --mode=lite --provider=pixrouter
```

Run checks selectively within the provider allowance. They use a synthetic idea and consume external provider/search quota, but do not create customer reports or charge workspace credits. Model checks fail if any selected model fails. Workflow checks fail if any required specialist fails. Saved evidence goes to ignored `reports/`.

Schema/protocol acceptance establishes that a workflow completes; factual interpretation, relevance and business assumptions still require review. Citation provenance, unsupported market-size handling and deterministic calculations provide additional safeguards, described in [AI_AGENTS.md](AI_AGENTS.md).
