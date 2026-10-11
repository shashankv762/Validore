import { generateWithFallback } from '@/lib/ai/generate'
import { CompetitorAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts, type AgentSearchCtx } from './shared'

// ─── Agent 3: Competitor Intelligence & Moat Analyst ─────────────────────────
// Owns: competitiveScore, competitors, competitorPositioning, portersFiveForces.
// Receives competitor search results; dateChecked must be today.

export function buildCompetitorPrompt(idea: IdeaInput, search: AgentSearchCtx): string {
  const searchCtx = search.degraded
    ? `\nNo live search results. Build the competitor set from your knowledge, mark each entry with dateChecked=${today()}, and note in weaknesses when pricing/features are unverified (AI_ESTIMATE_UNVERIFIED).`
    : `\nLive competitor search results (cite only these URLs for pricing evidence):\n${search.results
        .map((r) => `- "${r.title}": ${r.content.slice(0, 300)} [source:${r.source}, url:${r.url}, fetchedAt:${r.fetchedAt}]`)
        .join('\n')}`

  return `You are a competitive intelligence analyst on a multi-agent startup validation team. Today is ${today()}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
${searchCtx}

YOUR SCOPE — you own exactly these sections of the report:
1. competitiveScore — 0-${STARTUP_WEIGHTS.competitiveDifferentiation} (max ${STARTUP_WEIGHTS.competitiveDifferentiation}). How strong is differentiation and moat potential?
2. competitors — 3-10 competitors: direct and indirect. Each needs name, targetCustomer, product, pricing, pricingModel, strengths, weaknesses, marketGap, and dateChecked (MUST be ${today()}).
3. competitorPositioning — 2x2 matrix coordinates (x, y each 0-100, consistent across entries; isOurStartup marks the idea under validation).
4. portersFiveForces — each force rated LOW/MEDIUM/HIGH with reasoning.

INTEGRITY RULES:
1. Never fabricate competitor pricing, features, or user reviews. Ground pricing claims in the search results; when unverified, say so in the entry.
2. Never invent source URLs.
3. dateChecked must equal ${today()} for every competitor entry.
4. Score honestly — a crowded market with weak differentiation should NOT score high.

Other agents handle market sizing, customers, financials, and the final decision — stay in your scope.`
}

export async function runCompetitorAgent(idea: IdeaInput, search: AgentSearchCtx, opts?: AgentOpts) {
  return generateWithFallback({
    prompt: buildCompetitorPrompt(idea, search),
    schema: CompetitorAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
