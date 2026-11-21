import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief } from '@/lib/ai/research-brief'
import { SynthesisAgentSchema, SynthesisReviewSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts } from './shared'
import { validateSynthesisPlan, validateSynthesisJudgment, validateSynthesisHandoffClaims } from './quality-auditor'

// ─── Agent 6: Synthesis Judge ────────────────────────────────────────────────
// Owns the final synthesis sections: executionScore, decision, decisionReasons,
// keyEvidence, actionPlan, uvpOptions, selectedUvp, moscowFeatures,
// mvpDescription, integrityNote, nextStepRecommendation, nextStepRationale,
// oneLineConcept, founderAssumptions, landingPageCopy.
// Sees a digest of all research agents' outputs and issues the final verdict.

export function buildSynthesisPrompt(idea: IdeaInput, researchDigest: string, reviewCompletedPlans = false, asOfDate?: string): string {
  const scope = reviewCompletedPlans ? `
The product and growth specialists have completed their plans. Those exact plans will be retained in the report; do not regenerate their fields.
Return only executionScore, decision, 3-5 decisionReasons, up to 5 keyEvidence items, integrityNote, nextStepRecommendation, nextStepRationale and 5-10 founderAssumptions.
Review whether the proposed value proposition, MVP and sequential experiments address the actual evidence gaps. Name any inconsistency in decisionReasons and the required correction in nextStepRationale. Do not imply a proposed experiment has passed. Keep recommendations conditional on its pass criterion.` : `
1. executionScore — 0-${STARTUP_WEIGHTS.executionFeasibility} (max ${STARTUP_WEIGHTS.executionFeasibility}). Feasibility for a typical founding team, judged from complexity, dependencies, and regulatory needs.
2. decision — GO / MODIFY / TEST_FURTHER / NO_GO, per the decision logic below.
3. decisionReasons — 3-5 crisp reasons for the verdict.
4. keyEvidence: up to 5 EvidenceItems drawn from the research digest. Add an exact evidenceExcerpt of at least 20 characters copied from the cited retrieved passage whenever reporting MODERATE evidence; keep claims within its scope.
5. actionPlan — 4-6 sequential milestones within the supplied planningBasis horizon, with owner, KPI, hypothesis, participantUnit, denominator, passCriterion and decisionOnFailure. Keep the buyer unit consistent; email signups are not payment commitments.
6. uvpOptions — exactly 3 unique value proposition candidates.
7. selectedUvp — the strongest of the three.
8. moscowFeatures — MoSCoW MVP feature plan.
9. mvpDescription — 2-3 sentences describing the MVP.
10. integrityNote — distinguish retrieved observations, assumptions, projections and missing evidence; retrieval is not independent verification.
11. nextStepRecommendation — MORE_VALIDATION / BUILD_MVP / GET_FIRST_CUSTOMERS / SCALE_GROWTH / FUNDRAISING.
12. nextStepRationale — why this next step.
13. oneLineConcept — one-sentence concept statement.
14. founderAssumptions — 5-10 assumptions with category, preResearchBelief, postResearchFinding, validated, confidenceChange.
15. landingPageCopy — headline, subheadline, 3 benefits, howItWorks, cta, pricingHypothesis, faq.`
  return `You are the chief validation judge synthesising a multi-agent startup validation. Today is ${today(asOfDate)}.

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
${scope}

DECISION LOGIC:
The weighted score is a concept/evidence rubric, not a measured success probability or an automatic commercial verdict. Bands of ≥75, 55-74, 40-54 and <40 describe support/readiness only.
- TEST_FURTHER is appropriate at ANY score when demand, payment, repeat use or important inputs remain unknown. Missing validation is not observed rejection.
- MODIFY identifies a supported, fixable concept or execution gap.
- NO_GO requires an explicit original-source blocking finding, with decisionRelevance: blocking and a matching evidenceExcerpt in the source review. Ordinary competitor pages, a low score and losses under assumed inputs are not sufficient.
- GO requires direct product-specific commercial validation; this desk-research workflow cannot establish it from sources alone.

The other agents' sub-scores (already clamped, 0-max each):
- problemScore / customerScore / wtpScore (max 20/20/15)
- marketScore (max 15)
- competitiveScore (max 10)
- financialScore / businessModelScore (max 5/10)

Use the explicit score summary and knownSubtotal; add only your executionScore. Preserve the other scores. Explain the evidence-limited verdict even when it differs from the numeric band. Do not claim retained scores or plan essentials were omitted.

INTEGRITY RULES:
Use the shared planningBasis to interpret the offer, participant unit and overall horizon. Its shorter utility phase sits inside the full program; the finance scenario's assumed operating cohort is distinct from the proposed research cohort. Use the deterministic offerComparison when a named variant is supplied. Identify actual departures from this shared basis, while preserving explicitly distinguished phases, subsets and comparison scenarios.
1. Never fabricate evidence. Cite only supplied sources or successful research tool results, and check whether the retrieved text supports the exact claim.
2. keyEvidence strength discipline: WEAK = unsupported claims, snippets, bibliographic records or dated memory; MODERATE requires an evidenceExcerpt of at least 20 characters copied exactly from the successfully read cited page or official dataset (retrievalKind page or open-data). The excerpt is provenance, not proof of a broader inference. Do not output strength STRONGER or label VERIFIED. Repeated URLs or specialist agreement do not establish independent verification.
3. Do NOT force a GO or positive framing. If the research suggests NO_GO, say so.
4. Do not recommend fundraising by default.
5. The integrityNote must distinguish retrieved observations from assumptions, projections and missing evidence. Do not describe a retrieved URL or AI interpretation as independently verified.
6. actionPlan entries are PROPOSED_STRATEGY — future plans, never presented as achieved.
7. You perform desk research only. Set founderAssumptions.validated to false: article mentions, a large ecosystem, and an absence of contradictory evidence do not validate this specific product's demand, pricing or feasibility. Explain tentative support in postResearchFinding and propose a direct test.
8. Preserve 'Not established' market sizes. Do not reconstruct missing TAM/SAM/SOM from arbitrary spending or market-share assumptions. Do not use unsupported amounts as reasons for the verdict.
9. Compare source relevance, customer segment, timeframe and pricing. An incubator or adviser may be a partner or indirect substitute; distinguish that from software offering the same job to the same customer.
10. Repeated claims in specialist handoffs are not independent evidence. Unsupported assertions about price sensitivity, weekly usage or cultural preferences remain hypotheses. Preserve unknown persona price sensitivity when direct buyer pricing evidence is missing; it is response to price changes, not willingness to pay, and cannot be inferred from nationality or income. Describe the missing observation instead of turning those assertions into confident reasons for or against the idea.
11. Review the deterministic financial results when supplied. An attractive assumed LTV:CAC ratio does not establish a sustainable business when the cohort shrinks, acquisition is absent, or cumulative operating results are negative. Separate mechanical sensitivity scenarios from observed data and identify the input to test next.
12. Seek the strongest contrary explanation for each material recommendation. Distinguish no customer evidence from negative customer evidence. Macro indicators can establish background conditions only; prioritize evidence about this buyer and product job in the final reasoning.

Stay in your scope — the research sections are owned by other agents.`
}

export async function runSynthesisAgent(idea: IdeaInput, researchDigest: string, opts?: AgentOpts) {
  if (opts?.synthesisHandoffAudit?.missingCriticalFields.length) throw new Error('Critical specialist findings were not retained in the synthesis handoff')
  const common = {
    researchPrompt: publicResearchBrief(idea),
    agentRole: 'synthesis' as const,
    sources: opts?.sources,
    researchMode: opts?.reuseResearch ? 'reuse' as const : 'auto' as const,
    prompt: buildSynthesisPrompt(idea, researchDigest, opts?.reviewCompletedPlans, opts?.asOfDate),
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    privateContext: opts?.privateContext,
    researchBudgetId: opts?.researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
    maxTokensPerCall: opts?.maxTokensPerCall,
  }
  if (opts?.reviewCompletedPlans) {
    const result = await generateWithFallback({ ...common, schema: SynthesisReviewSchema, maxOutputTokens: 6000,
      validateOutput: data => [...validateSynthesisJudgment(data), ...validateSynthesisHandoffClaims(data, opts.synthesisHandoffAudit)] })
    // Also strip unintended planner fields at this ownership boundary. A
    // provider/adapter must not overwrite completed plans through extra keys.
    return { ...result, data: SynthesisReviewSchema.parse(result.data) }
  }
  return generateWithFallback({ ...common, schema: SynthesisAgentSchema,
    validateOutput: data => [...validateSynthesisPlan(data), ...validateSynthesisJudgment(data), ...validateSynthesisHandoffClaims(data, opts?.synthesisHandoffAudit)],
  })
}
