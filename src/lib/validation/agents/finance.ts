import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief } from '@/lib/ai/research-brief'
import { FinanceAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts } from './shared'

// ─── Agent 4: Financial Modeler & Unit Economics Analyst ─────────────────────
// Owns: financialScore, businessModelScore, unitEconomicsAssumptions.
// Only the assumptions come from the LLM — all derived metrics (LTV, CAC, etc.)
// are computed deterministically by the orchestrator via src/lib/financial.ts.

export function buildFinancePrompt(idea: IdeaInput, researchDigest: string, asOfDate?: string): string {
  return `You are a financial modeling analyst on a multi-agent startup validation team. Today is ${today(asOfDate)}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
${researchDigest}

YOUR SCOPE — you own exactly these sections of the report:
1. financialScore — 0-${STARTUP_WEIGHTS.financialFeasibility} (max ${STARTUP_WEIGHTS.financialFeasibility}). Feasibility of reaching sustainable unit economics given the assumptions.
2. businessModelScore — 0-${STARTUP_WEIGHTS.businessModel} (max ${STARTUP_WEIGHTS.businessModel}). Clarity and viability of the stated business model.
3. unitEconomicsAssumptions — explicit scenario inputs for: estimatedSellingPrice, estimatedVariableCost, estimatedFixedCostMonthly, estimatedCACMonthly (cost PER NEW customer), estimatedMonthlyCustomers (month-one cohort), estimatedChurnRate (monthly decimal, e.g. 0.03), currency (one ISO three-letter code). Optional estimatedMonthlyGrowthRate is gross monthly NEW-customer acquisition as a fraction of the previous active cohort, before churn; omit it or use zero when no acquisition assumption is supplied. assumptionLabel MUST be 'ASSUMPTION'.

IMPORTANT — MATH IS NOT YOURS TO DO:
The system will compute contribution margin, break-even, LTV, LTV:CAC, payback, and the 12-month projection from your assumptions using exact formulas. Do not calculate them yourself — only provide honest input assumptions.

INTEGRITY RULES:
1. These are assumptions, not verified data. assumptionLabel must be 'ASSUMPTION'.
2. Do not invent traction, revenue, or customer numbers.
3. Estimation should be grounded in the research digest above when it contains market pricing evidence.
4. Score honestly — if the numbers don't work (e.g. variable cost near price), the financialScore should reflect it.
5. Declare one currency for all monetary inputs, grounded in the supplied market/pricing context (for example INR for an Indian rupee scenario). Never combine currencies or imply that a conversion occurred. Legacy inputs without a currency are treated as USD.
6. estimatedCACMonthly keeps its historical field name but always means acquisition cost per NEW customer, never the monthly marketing budget. The projection acquires the month-one cohort once and charges CAC for those customers; later months pay CAC only on new acquisitions.
7. Do not assume 10% growth. Distinguish hypothetical acquisition growth from observed sales. Zero new acquisitions means the active cohort declines according to the explicit churn assumption; do not silently replenish churned customers.
8. Zero churn does not prove an infinite lifetime or justify a made-up 24-month lifetime. The system leaves LTV undefined when a finite lifetime cannot be established. Do not supply invented cash reserves or runway inputs.

Other agents handle market, customers, competitors, and the final decision — stay in your scope.`
}

export async function runFinanceAgent(idea: IdeaInput, researchDigest: string, opts?: AgentOpts) {
  return generateWithFallback({
    researchPrompt: publicResearchBrief(idea),
    agentRole: 'finance',
    researchMode: opts?.reuseResearch ? 'reuse' : 'auto',
    sources: opts?.sources,
    prompt: buildFinancePrompt(idea, researchDigest, opts?.asOfDate),
    schema: FinanceAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    privateContext: opts?.privateContext,
    researchBudgetId: opts?.researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
    maxTokensPerCall: opts?.maxTokensPerCall,
  })
}
