import { generateWithFallback } from '@/lib/ai/generate'
import { publicResearchBrief } from '@/lib/ai/research-brief'
import { CustomerAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts } from './shared'
import { validateCustomerSignals } from './quality-auditor'

// ─── Agent 2: Customer Discovery & Problem Validator ─────────────────────────
// Owns: problemScore, customerScore, wtpScore, personas, problemValidation5Factor,
// customerJPG, interviewQuestions, wtpSurveyQuestions.

export function buildCustomerPrompt(idea: IdeaInput, asOfDate?: string): string {
  return `You are a customer discovery researcher on a multi-agent startup validation team. Today is ${today(asOfDate)}.

STARTUP IDEA:
Name: ${idea.name}
Industry: ${idea.industry}
Product: ${idea.product}
Target Customer: ${idea.targetCustomer}
Location/Market: ${idea.location}
Business Model: ${idea.businessModel}
Core Problem: ${idea.coreProblem}
Proposed Solution: ${idea.proposedSolution}

YOUR SCOPE — you own exactly these sections of the report:
1. problemScore — 0-${STARTUP_WEIGHTS.problemValidation} (max ${STARTUP_WEIGHTS.problemValidation}). How strong is the evidence that this problem is real, frequent, and painful?
2. customerScore — 0-${STARTUP_WEIGHTS.customerValidation} (max ${STARTUP_WEIGHTS.customerValidation}). How well-defined and reachable is the target customer?
3. wtpScore — 0-${STARTUP_WEIGHTS.willingnessToPay} (max ${STARTUP_WEIGHTS.willingnessToPay}). Willingness-to-pay signals, judged honestly.
4. personas — 1-2 concise, specific ICPs (primary and, only if materially different, secondary).
5. problemValidation5Factor — frequency, severity, urgency, dissatisfaction, willingnessToSeekSolution, each scored 1-10 with reasoning.
6. customerJPG — Jobs / Pains / Gains mapping (value proposition canvas).
7. interviewQuestions — exactly 10 non-leading Mom Test style questions with category and a one-sentence rationale.
8. wtpSurveyQuestions — 4 focused willingness-to-pay survey questions (open / scale / multiple_choice).
9. customerSignals — when actual recorded feedback, founder statements or accessible public reviews are supplied, summarize the observed themes, opposing signals, exact sample counts/denominators and limitations. Omit this optional field when no such data exists.

INTEGRITY RULES:
1. Never fabricate customer quotes, testimonials, or traction data. These are PROPOSED personas and survey designs — not real interview data.
2. Score honestly — do not inflate. A problem that is only "nice to have" should NOT score 20/20.
3. Interview questions must be non-leading (Mom Test principles): ask about past behaviour, not hypotheticals.
4. Do not force a GO verdict or positive framing — another agent decides.
5. Separate users, buyers and payers. Explain the triggering event, existing workaround, past money/time spent and purchase authority. Preserve disconfirming findings instead of making every hypothesis positive.
6. Use public customer-review searches and analyze_customer_feedback only when a successfully read public page exposes actual review records. Never treat arbitrary page summaries as customer quotes. Exact review statements, sample size, dates and selection bias belong in the finding; sentiment is not population prevalence or proof of demand for this startup.
7. Private recorded issues, ideas and feedback are owner-supplied evidence, not public data. Do not copy them, identifiers or derived confidential claims into research prompts or tool queries. Keep their sourceType and self-report limitations in customerSignals.
8. Never invent record counts, survey responses or willingness to pay. Unknown count/sampleSize is null. Each critical hypothesis needs a behavioral test and an explicit pass/fail threshold; proposed questions are not completed interviews.
9. No recorded customer evidence means willingness to pay and usage frequency are unknown. Set each persona.priceSensitivity to unknown unless direct buyer pricing evidence supports low, medium or high. Price sensitivity is response to price changes, not willingness to pay. Do not infer it, cultural buying habits, weekly usage or adoption resistance from a country label, income, a persona, GDP or another specialist's unsupported opinion. State the hypothesis and a direct observation that could confirm or contradict it.

Other agents handle market sizing, competitors, financials, and the final decision — stay in your scope.`
}

export async function runCustomerAgent(idea: IdeaInput, opts?: AgentOpts) {
  return generateWithFallback({
    researchPrompt: publicResearchBrief(idea),
    agentRole: 'customer',
    researchMode: opts?.reuseResearch ? 'reuse' : 'auto',
    sources: opts?.sources,
    prompt: buildCustomerPrompt(idea, opts?.asOfDate),
    schema: CustomerAgentSchema,
    validateOutput: validateCustomerSignals,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    privateContext: opts?.privateContext,
    researchBudgetId: opts?.researchBudgetId,
    preferredAiProvider: opts?.preferredAiProvider,
    maxTokensPerCall: opts?.maxTokensPerCall,
  })
}
