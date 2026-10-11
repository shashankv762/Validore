import { generateWithFallback } from '@/lib/ai/generate'
import { MarketAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts, type AgentSearchCtx } from './shared'

// ─── Agent 1: Market Intelligence & Trend Analyst ────────────────────────────
// Owns: marketScore, tamSamSom, pestleAnalysis. Receives live market search
// results; TAM/SAM/SOM stay PROJECTION-labelled.

export function buildMarketPrompt(idea: IdeaInput, search: AgentSearchCtx): string {
  const searchCtx = search.degraded
    ? `\nNo live search results. Mark ALL market data as AI_ESTIMATE_UNVERIFIED with strength:WEAK. Leave source/link empty. Never invent URLs.`
    : `\nLive market search results (cite only these URLs):\n${search.results
        .map((r) => `- "${r.title}": ${r.content.slice(0, 300)} [source:${r.source}, url:${r.url}, fetchedAt:${r.fetchedAt}]`)
        .join('\n')}`

  return `You are a market intelligence analyst on a multi-agent startup validation team. Today is ${today()}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
${searchCtx}

YOUR SCOPE — you own exactly these sections of the report:
1. marketScore — 0-${STARTUP_WEIGHTS.marketOpportunity} (max ${STARTUP_WEIGHTS.marketOpportunity}). Judge market size, growth, timing, and accessibility for THIS specific startup.
2. tamSamSom — top-down and bottom-up market sizing with documented method strings. Every entry MUST have label:'PROJECTION'. tam has a source field — only cite a URL that appears in the search results; otherwise write 'AI estimate (unverified)'.
3. pestleAnalysis — Political, Economic, Social, Technological, Legal, Environmental factors relevant to this market.

INTEGRITY RULES:
1. Never fabricate market statistics. Only cite figures traceable to the search results above.
2. Never invent source URLs.
3. TAM/SAM/SOM values are estimates — always label 'PROJECTION'.
4. Do not inflate the score to be optimistic. Score honestly against the evidence.

Other agents handle customers, competitors, financials, and the final decision — do not comment outside your scope.`
}

export async function runMarketAgent(idea: IdeaInput, search: AgentSearchCtx, opts?: AgentOpts) {
  return generateWithFallback({
    prompt: buildMarketPrompt(idea, search),
    schema: MarketAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
