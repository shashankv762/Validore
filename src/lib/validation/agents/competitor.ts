import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief } from '@/lib/ai/research-brief'
import { CompetitorAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import type { SearchResult } from '@/lib/ai/search'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts, type AgentSearchCtx } from './shared'

// ─── Agent 3: Competitor Intelligence & Moat Analyst ─────────────────────────
// Owns: competitiveScore, competitors, competitorPositioning, portersFiveForces.
// Receives competitor search results; dateChecked must be today.

export function buildCompetitorPrompt(idea: IdeaInput, search: AgentSearchCtx, asOfDate?: string): string {
  const searchCtx = search.results.length === 0
    ? '\nNo live search results. Leave competitors and competitorPositioning empty. Explain that the competitor set is unverified; do not use memory to invent names or current pricing.'
    : `\nRetrieved competitor research (only successfully read pages can support a listed competitor):\n${search.results
        .map((r) => `- "${r.title}": ${r.content.slice(0, 1200)} [kind:${r.retrievalKind ?? 'snippet'}, source:${r.source}, url:${r.url}, fetchedAt:${r.fetchedAt}]`)
        .join('\n')}`

  return `You are a competitive intelligence analyst on a multi-agent startup validation team. Today is ${today(asOfDate)}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
${searchCtx}

YOUR SCOPE — you own exactly these sections of the report:
1. competitiveScore — 0-${STARTUP_WEIGHTS.competitiveDifferentiation} (max ${STARTUP_WEIGHTS.competitiveDifferentiation}). How strong is differentiation and moat potential?
2. competitors — up to 10 relevant competitors: direct and indirect. Each needs name, targetCustomer, product, pricing, pricingModel, strengths, weaknesses, marketGap, sourceUrl and dateChecked. A short or empty list is acceptable when evidence is insufficient.
3. competitorPositioning — 2x2 matrix coordinates (x, y each 0-100, consistent across entries; isOurStartup marks the idea under validation).
4. portersFiveForces — each force rated LOW/MEDIUM/HIGH with reasoning.

INTEGRITY RULES:
1. Never fabricate competitor pricing, features, or user reviews. Precise pricing/features require supporting text from a successfully read original source; a search snippet or discovered URL alone is insufficient. When that evidence is missing, say the detail is not established.
2. Never invent source URLs.
3. sourceUrl must be one of the supplied successfully read page URLs and its content must name that competitor. dateChecked must equal that page's fetchedAt UTC date; cached retrievals keep their actual original date.
4. Score honestly — a crowded market with weak differentiation should NOT score high.
5. Search first for products doing the same job for the same customer. Label each product description as a direct competitor or indirect substitute. Incubators, investors and advisers may be partners or alternatives to software, not equivalent software competitors.
6. Do not fill a quota with unrelated organizations. General-purpose tools can be indirect substitutes when a read page identifies them as relevant; explain that relationship and mark unsupported details as unknown.
7. Positioning entries must refer to the startup or a competitor retained from a read source. Coordinates are illustrative judgments, not measured market data.

Other agents handle market sizing, customers, financials, and the final decision — stay in your scope.`
}

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export function auditCompetitorSources(data: ReturnType<typeof CompetitorAgentSchema.parse>, sources: readonly SearchResult[]) {
  const pages = sources.filter(source => {
    if (source.retrievalKind !== 'page') return false
    try { return ['http:', 'https:'].includes(new URL(source.url).protocol) && Number.isFinite(Date.parse(source.fetchedAt)) }
    catch { return false }
  })
  const competitors = data.competitors.flatMap(competitor => {
    const name = normalize(competitor.name)
    if (name.length < 2) return []
    const candidates = competitor.sourceUrl ? pages.filter(source => source.url === competitor.sourceUrl) : pages
    const source = candidates.find(candidate => normalize(candidate.title + ' ' + candidate.content).includes(name))
    if (!source) return []
    return [{ ...competitor, sourceUrl: source.url, dateChecked: new Date(source.fetchedAt).toISOString().slice(0, 10) }]
  })
  const known = new Set(competitors.map(competitor => normalize(competitor.name)))
  return { ...data, competitors, competitorPositioning: data.competitorPositioning.filter(item => item.isOurStartup || known.has(normalize(item.name))) }
}

export async function runCompetitorAgent(idea: IdeaInput, search: AgentSearchCtx, opts?: AgentOpts) {
  const result = await generateWithFallback({
    researchPrompt: publicResearchBrief(idea),
    agentRole: 'competitor',
    researchMode: opts?.reuseResearch ? 'reuse' : 'auto',
    sources: opts?.sources ?? search.results,
    prompt: buildCompetitorPrompt(idea, search, opts?.asOfDate),
    schema: CompetitorAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    privateContext: opts?.privateContext,
    researchBudgetId: opts?.researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
    maxTokensPerCall: opts?.maxTokensPerCall,
  })
  return { ...result, data: auditCompetitorSources(result.data, opts?.sources ?? search.results) }
}
