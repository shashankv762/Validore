import { generateWithFallback } from '@/lib/ai/generate'
import { RiskAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { today, type AgentOpts } from './shared'

// ─── Agent 5: Risk Actuary ───────────────────────────────────────────────────
// Owns: keyRisks, swot, riskRegister. Works from the research digest — no
// numbers of its own to hallucinate; risks are qualitative judgments.

export function buildRiskPrompt(idea: IdeaInput, researchDigest: string): string {
  return `You are a risk analyst on a multi-agent startup validation team. Today is ${today()}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
${researchDigest}

YOUR SCOPE — you own exactly these sections of the report:
1. keyRisks — 3-6 headline risks in plain sentences.
2. swot — strengths, weaknesses, opportunities, threats.
3. riskRegister — 6-12 entries across 8 dimensions (market, customer, product, financial, competitive, operational, technical, regulatory). Each: risk, probability (low/medium/high), impact (low/medium/high), riskLevel (low/medium/high/critical), mitigation.

INTEGRITY RULES:
1. Risks are ANALYST JUDGMENTS, not data. Do not cite specific statistics — other agents own the numbers.
2. Be specific to THIS idea — not generic startup advice.
3. riskLevel must be consistent with probability × impact (critical only when both are high).

Other agents handle market, customers, competitors, financials, and the final decision — stay in your scope.`
}

export async function runRiskAgent(idea: IdeaInput, researchDigest: string, opts?: AgentOpts) {
  return generateWithFallback({
    prompt: buildRiskPrompt(idea, researchDigest),
    schema: RiskAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
