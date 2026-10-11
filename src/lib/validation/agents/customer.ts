import { generateWithFallback } from '@/lib/ai/generate'
import { CustomerAgentSchema } from '../schemas'
import type { IdeaInput } from '../schemas'
import { STARTUP_WEIGHTS } from '@/lib/scoring'
import { today, type AgentOpts } from './shared'

// ─── Agent 2: Customer Discovery & Problem Validator ─────────────────────────
// Owns: problemScore, customerScore, wtpScore, personas, problemValidation5Factor,
// customerJPG, interviewQuestions, wtpSurveyQuestions.

export function buildCustomerPrompt(idea: IdeaInput): string {
  return `You are a customer discovery researcher on a multi-agent startup validation team. Today is ${today()}.

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
4. personas — 1-3 detailed ICPs (primary, secondary, early adopter).
5. problemValidation5Factor — frequency, severity, urgency, dissatisfaction, willingnessToSeekSolution, each scored 1-10 with reasoning.
6. customerJPG — Jobs / Pains / Gains mapping (value proposition canvas).
7. interviewQuestions — 10-15 non-leading Mom Test style questions with category and rationale.
8. wtpSurveyQuestions — 4-8 willingness-to-pay survey questions (open / scale / multiple_choice).

INTEGRITY RULES:
1. Never fabricate customer quotes, testimonials, or traction data. These are PROPOSED personas and survey designs — not real interview data.
2. Score honestly — do not inflate. A problem that is only "nice to have" should NOT score 20/20.
3. Interview questions must be non-leading (Mom Test principles): ask about past behaviour, not hypotheticals.
4. Do not force a GO verdict or positive framing — another agent decides.

Other agents handle market sizing, competitors, financials, and the final decision — stay in your scope.`
}

export async function runCustomerAgent(idea: IdeaInput, opts?: AgentOpts) {
  return generateWithFallback({
    prompt: buildCustomerPrompt(idea),
    schema: CustomerAgentSchema,
    temperature: 0,
    customOpenRouterKey: opts?.customOpenRouterKey,
    preferredAiProvider: opts?.preferredAiProvider,
  })
}
