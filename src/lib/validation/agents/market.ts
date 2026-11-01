import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief } from '@/lib/ai/research-brief'
import { MarketAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts, type AgentSearchCtx } from './shared'

// ─── Agent 1: Market Intelligence & Trend Analyst ────────────────────────────
// Owns: marketScore, tamSamSom, pestleAnalysis. Receives live market search
// results; TAM/SAM/SOM stay PROJECTION-labelled.

export function buildMarketPrompt(idea: IdeaInput, search: AgentSearchCtx): string {
  const searchCtx = search.results.length === 0
    ? `\nNo live search results. Mark ALL market data as AI_ESTIMATE_UNVERIFIED with strength:WEAK. Leave source/link empty. Never invent URLs.`
    : `\nLive market search results (cite only these URLs or successful research tool results):\n${search.results
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
5. Size the reachable customer segment for THIS product. A figure for all software, all education, or the entire economy is context, never this startup's TAM or SAM.
6. Prefer target customer count multiplied by annual spend, and a capacity-based 1-3 year SOM. State every input assumption and use the calculator for arithmetic. Do not choose an arbitrary large percentage of a broad industry.
7. When segment counts or spending evidence are missing, write 'Not established' and explain the missing inputs. Do not replace missing evidence with an impressive number.
8. Distinguish global benchmarks from the launch country and segment. Preserve source units, data vintage, denominator, methodology and uncertainty; a current retrieval date does not make an annual observation current.
9. Examine buyer segments, adoption barriers, distribution access, regulation and a downside scenario. Compare the founder's assumptions with evidence and name the inputs that could change the conclusion. Sources that repeat the same underlying report are not independent corroboration.
10. Review the public dataset catalog and saved official observations before requesting new searches. Use live retrieval for material time-sensitive gaps, especially competitor pricing; never spend a model call generating a statistic that can be read from an official data API.

Other agents handle customers, competitors, financials, and the final decision — do not comment outside your scope.`
}

export async function runMarketAgent(idea: IdeaInput, search: AgentSearchCtx, opts?: AgentOpts) {
  return generateWithFallback({
    researchPrompt: publicResearchBrief(idea),
    agentRole: 'market',
    researchMode: opts?.reuseResearch ? 'reuse' : 'auto',
    sources: opts?.sources ?? search.results,
    prompt: buildMarketPrompt(idea, search),
    schema: MarketAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    privateContext: opts?.privateContext,
    researchBudgetId: opts?.researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
