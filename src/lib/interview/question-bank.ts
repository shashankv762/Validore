import type { IdeaDraft } from '@/lib/idea-input'
import { DIMENSIONS, DIMENSION_LABELS, type Dimension, type InterviewAnswer, type InterviewAssessment, type InterviewQuestion } from './schema'

// Curated methodology, not empirical market data. It is safe to reuse across
// founders; their answers are never added to this shared bank.
export const QUESTION_BANK: Record<Dimension, { question: string; why: string; hint: string }> = {
  customer: { question: 'Who is the first specific customer you will serve, and who makes the purchase decision?', why: 'A reachable buyer makes the rest of the market analysis more meaningful.', hint: 'Describe one role, segment, location, and buying trigger. Avoid personal names or contact details.' },
  problem: { question: 'Describe the last time that customer faced this problem. What did they do, and what did it cost them?', why: 'A recent concrete example distinguishes an observed problem from a general belief.', hint: 'Include frequency, time or money lost, and the current workaround. Say what you have actually observed.' },
  demand: { question: 'What have prospective customers already done that shows they want a solution?', why: 'Behavior, commitments, and repeated usage are stronger signals than compliments.', hint: 'Give counts, dates, who you sampled, and outcomes. Separate interviews, sign-ups, pilots, payments, and your assumptions.' },
  solution: { question: 'What is the smallest version you can test, and what customer outcome should it improve?', why: 'A narrow first use case can test value before a large build.', hint: 'Name one workflow, the current baseline, and a measurable improvement. Identify what is deliberately left out.' },
  market: { question: 'How many customers in your first segment can you realistically reach, and how did you estimate that?', why: 'Country totals and broad industry revenue do not establish your serviceable market.', hint: 'State geography, eligibility criteria, source and year for the count, annual spending, and delivery capacity. Unknown inputs are fine.' },
  competition: { question: 'What will customers use instead if your product does not exist, and why would they switch?', why: 'Doing nothing, manual work, and indirect substitutes all compete for the customer’s budget.', hint: 'Name current alternatives, observed prices, switching costs, and one difference you can test. Avoid claiming there is no competition.' },
  pricing: { question: 'What will you charge, who pays, and what evidence supports that price?', why: 'A price hypothesis needs a payer, billing unit, and a test of willingness to pay.', hint: 'Include currency, amount, billing period, what is included, and any actual paid test or commitment.' },
  economics: { question: 'What does one sale cost to deliver and acquire, and what fixed costs must the business cover?', why: 'Revenue alone does not show whether growth can sustain the business.', hint: 'Use one currency. Separate price, variable cost, acquisition cost, monthly fixed cost, retention assumptions, and unknowns.' },
  distribution: { question: 'How will you reach your first ten customers, and what have you tested on that channel?', why: 'A specific channel and conversion hypothesis make the launch plan testable.', hint: 'Describe access, outreach volume, conversion, budget, and time. Distinguish a plan from achieved results.' },
  execution: { question: 'What can your team deliver in the next four weeks, and what might prevent it?', why: 'The plan must fit available skills, time, cash, and dependencies.', hint: 'List owners, a weekly milestone, current runway, and the hardest dependency. Planned milestones are not traction.' },
  risk: { question: 'Which legal, safety, operational, or trust issue could stop this idea, and how will you check it?', why: 'Some constraints must be resolved before customer experiments or launch.', hint: 'Consider permissions, data use, licenses, supplier dependency, and customer harm. Identify where qualified advice is needed.' },
  validation: { question: 'What result in the next two weeks would make you continue, change direction, or stop?', why: 'A pre-agreed success and failure threshold reduces confirmation bias.', hint: 'Specify a customer group, experiment, sample, metric, threshold, budget, and deadline. Do not invent a successful result.' },
}

export function guidedAssessment(answers: InterviewAnswer[]): InterviewAssessment {
  return {
    summary: answers.length ? 'Your answers are saved. This guided review records coverage; AI interpretation is unavailable or has not run yet.' : 'Start with your first customer. We will use each answer to decide what needs clarification next.',
    dimensions: DIMENSIONS.map(dimension => {
      const relevant = answers.filter(answer => answer.question.dimension === dimension)
      return { dimension, level: relevant.length ? 'unclear' as const : 'unexplored' as const,
        reason: relevant.length ? relevant.every(answer => answer.skipped) ? 'You marked this as unknown. It remains a research gap.' : 'Answer recorded; specificity and supporting evidence still need review.' : 'This topic has not been explored yet.',
        answerIds: relevant.map(answer => answer.question.id) }
    }),
    contradictions: [],
    nextExperiment: 'Speak with a small, clearly defined group of prospective customers about a recent instance of the problem, record their current workaround, and set a measurable next test.',
  }
}

export function nextGuidedQuestion(idea: IdeaDraft, answers: InterviewAnswer[], assessment?: InterviewAssessment): InterviewQuestion | null {
  if (answers.length >= 12) return null
  const counts = new Map(DIMENSIONS.map(dimension => [dimension, answers.filter(answer => answer.question.dimension === dimension).length]))
  // Cover the whole business before repeating a topic. A later AI question can
  // follow up once where evidence remains unclear; it cannot loop indefinitely.
  const dimension = DIMENSIONS.find(key => counts.get(key) === 0) ??
    assessment?.dimensions.find(review => review.level === 'unclear' && (counts.get(review.dimension) ?? 0) < 2)?.dimension
  if (!dimension) return null
  const template = QUESTION_BANK[dimension]
  let text = template.question
  const industry = idea.industry.toLowerCase()
  if (dimension === 'risk' && /health|medical|fintech|insurance|lending/.test(industry)) text = 'Before testing with customers, which permissions, professional oversight, and personal-data safeguards does this business need?'
  if (dimension === 'economics' && /marketplace|ecommerce|e-commerce|retail/.test(industry)) text = 'For one order, what remains after fulfillment, returns, payment fees, and customer acquisition, and which numbers have you measured?'
  return { id: 'q-' + (answers.length + 1) + '-' + dimension, dimension, text, why: template.why, hint: template.hint }
}

export function questionBankContext() {
  return DIMENSIONS.map(dimension => ({ dimension, label: DIMENSION_LABELS[dimension], ...QUESTION_BANK[dimension] }))
}
