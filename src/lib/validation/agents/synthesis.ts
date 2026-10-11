import { generateWithFallback } from '@/lib/ai/generate'
import { SynthesisAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts } from './shared'

// ─── Agent 6: Synthesis Judge ────────────────────────────────────────────────
// Owns the final synthesis sections: executionScore, decision, decisionReasons,
// keyEvidence, actionPlan, uvpOptions, selectedUvp, moscowFeatures,
// mvpDescription, integrityNote, nextStepRecommendation, nextStepRationale,
// oneLineConcept, founderAssumptions, landingPageCopy.
// Sees a digest of all research agents' outputs and issues the final verdict.

export function buildSynthesisPrompt(idea: IdeaInput, researchDigest: string): string {
  return `You are the chief validation judge synthesising a multi-agent startup validation. Today is ${today()}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
Proposed Solution: ${idea.proposedSolution}
${researchDigest}

YOUR SCOPE — you own the final synthesis sections:
1. executionScore — 0-${STARTUP_WEIGHTS.executionFeasibility} (max ${STARTUP_WEIGHTS.executionFeasibility}). Feasibility for a typical founding team, judged from complexity, dependencies, and regulatory needs.
2. decision — GO / MODIFY / TEST_FURTHER / NO_GO, per the decision logic below.
3. decisionReasons — 3-5 crisp reasons for the verdict.
4. keyEvidence — up to 5 EvidenceItems drawn from the research digest. Respect strength/label discipline.
5. actionPlan — 4-6 weekly milestones with owner and KPI.
6. uvpOptions — exactly 3 unique value proposition candidates.
7. selectedUvp — the strongest of the three.
8. moscowFeatures — MoSCoW MVP feature plan.
9. mvpDescription — 2-3 sentences describing the MVP.
10. integrityNote — summary of what is verified vs assumed in this report.
11. nextStepRecommendation — MORE_VALIDATION / BUILD_MVP / GET_FIRST_CUSTOMERS / SCALE_GROWTH / FUNDRAISING.
12. nextStepRationale — why this next step.
13. oneLineConcept — one-sentence concept statement.
14. founderAssumptions — 5-10 assumptions with category, preResearchBelief, postResearchFinding, validated, confidenceChange.
15. landingPageCopy — headline, subheadline, 3 benefits, howItWorks, cta, pricingHypothesis, faq.

DECISION LOGIC:
- GO (≥75 total): clear evidence, real WTP signals, viable business model
- MODIFY (55-74): promising concept with fixable gaps
- TEST_FURTHER (40-54): significant unknowns, research needed
- NO_GO (<40): fundamental problems — market, WTP, or model viability

The other agents' sub-scores (already clamped, 0-max each):
- problemScore / customerScore / wtpScore (max 20/20/15)
- marketScore (max 15)
- competitiveScore (max 10)
- financialScore / businessModelScore (max 5/10)

Add your executionScore and issue the verdict consistent with the total.

INTEGRITY RULES:
1. Never fabricate evidence — only evidence present in the research digest can be strength 'STRONGER'; anything not traceable to live search is 'WEAK' or 'MODERATE' at most.
2. keyEvidence strength discipline: WEAK = no source, MODERATE = traceable to search results, STRONGER = multiple corroborating sources.
3. Do NOT force a GO or positive framing. If the research suggests NO_GO, say so.
4. Do not recommend fundraising by default.
5. The integrityNote must list verified vs assumed items clearly.
6. actionPlan entries are PROPOSED_STRATEGY — future plans, never presented as achieved.

Stay in your scope — the research sections are owned by other agents.`
}

export async function runSynthesisAgent(idea: IdeaInput, researchDigest: string, opts?: AgentOpts) {
  return generateWithFallback({
    prompt: buildSynthesisPrompt(idea, researchDigest),
    schema: SynthesisAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
