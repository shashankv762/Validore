import { generateWithFallback } from '@/lib/ai/generate'
import { FinanceAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts } from './shared'

// ─── Agent 4: Financial Modeler & Unit Economics Analyst ─────────────────────
// Owns: financialScore, businessModelScore, unitEconomicsAssumptions.
// Only the assumptions come from the LLM — all derived metrics (LTV, CAC, etc.)
// are computed deterministically by the orchestrator via src/lib/financial.ts.

export function buildFinancePrompt(idea: IdeaInput, researchDigest: string): string {
  return `You are a financial modeling analyst on a multi-agent startup validation team. Today is ${today()}.

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
3. unitEconomicsAssumptions — your best estimates for: estimatedSellingPrice, estimatedVariableCost, estimatedFixedCostMonthly, estimatedCACMonthly, estimatedMonthlyCustomers, estimatedChurnRate (as monthly decimal, e.g. 0.03). assumptionLabel MUST be 'ASSUMPTION'.

IMPORTANT — MATH IS NOT YOURS TO DO:
The system will compute contribution margin, break-even, LTV, LTV:CAC, payback, and the 12-month projection from your assumptions using exact formulas. Do not calculate them yourself — only provide honest input assumptions.

INTEGRITY RULES:
1. These are assumptions, not verified data. assumptionLabel must be 'ASSUMPTION'.
2. Do not invent traction, revenue, or customer numbers.
3. Estimation should be grounded in the research digest above when it contains market pricing evidence.
4. Score honestly — if the numbers don't work (e.g. variable cost near price), the financialScore should reflect it.

Other agents handle market, customers, competitors, and the final decision — stay in your scope.`
}

export async function runFinanceAgent(idea: IdeaInput, researchDigest: string, opts?: AgentOpts) {
  return generateWithFallback({
    prompt: buildFinancePrompt(idea, researchDigest),
    schema: FinanceAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
