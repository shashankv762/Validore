import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PgDialect } from 'drizzle-orm/pg-core'
import { generateWithFallback } from '@/lib/ai/generate'
import { applyInterviewProposal, guardAssessment, ideaFingerprint, initialInterview, tailorInterview } from '@/lib/interview/engine'
import { compactFounderContext, loadFounderContext } from '@/lib/interview/context'
import { guidedAssessment, nextGuidedQuestion } from '@/lib/interview/question-bank'
import { DIMENSIONS, InterviewStateSchema, type InterviewAnswer, type InterviewState } from '@/lib/interview/schema'
import { LEGAL } from '@/lib/legal'

const mocks = vi.hoisted(() => ({ idea: vi.fn(), interview: vi.fn() }))
vi.mock('@/lib/ai/generate', () => ({ generateWithFallback: vi.fn() }))
vi.mock('@/db', () => ({ db: { query: { ideas: { findFirst: mocks.idea }, founderInterviews: { findFirst: mocks.interview } } } }))

const idea = { name: 'Test venture', industry: 'Fintech', product: 'A cash-flow planning application', targetCustomer: 'Independent shops',
  location: 'India', businessModel: 'Monthly subscription', coreProblem: 'Owners cannot forecast inventory costs', proposedSolution: 'A simple stock and cash-flow forecast' }
const answer = (dimension: typeof DIMENSIONS[number] = 'customer', text = 'Independent shop owners in Pune; five owners described the same monthly stockout.'): InterviewAnswer => ({
  question: { id: 'q-1-' + dimension, dimension, text: 'Which customer makes the first purchase decision?', why: 'A focused customer group can be reached.', hint: 'Use a segment and location.' },
  text, evidence: 'first_hand', skipped: false, answeredAt: '2026-11-01T00:00:00Z',
})
const stateFor = (answers = [answer()]): InterviewState => ({ ...initialInterview(idea), answers, assessment: guidedAssessment(answers), nextQuestion: nextGuidedQuestion(idea, answers) })
beforeEach(() => vi.resetAllMocks())

describe('adaptive founder questions', () => {
  it('starts with a reusable customer question without calling a model', () => {
    const state = initialInterview(idea)
    expect(InterviewStateSchema.safeParse(state).success).toBe(true)
    expect(state.nextQuestion?.dimension).toBe('customer')
    expect(generateWithFallback).not.toHaveBeenCalled()
  })
  it('adapts to an unresolved answer while retaining the exact saved history', () => {
    const state = stateFor()
    const proposed = { dimension: 'customer' as const, text: 'Which of those five owners has agreed to test the forecast next week?', why: 'A concrete next commitment helps distinguish interest from intent.', hint: 'Use a count and timing, without names.' }
    const next = applyInterviewProposal(idea, state, { assessment: state.assessment, question: proposed }, 100)
    expect(next.answers).toEqual(state.answers)
    expect(next.nextQuestion).toMatchObject({ ...proposed, id: 'q-2-customer' })
    expect(next.modelTokens).toBe(100)
  })
  it('rejects invented evidence references and duplicate dimension assessments', () => {
    const state = stateFor()
    const invented = structuredClone(state.assessment)
    invented.dimensions[0].answerIds = ['nonexistent-question']
    expect(() => guardAssessment(invented, state.answers)).toThrow('Invented answer reference')
    const repeated = structuredClone(state.assessment)
    repeated.dimensions[1] = repeated.dimensions[0]
    expect(() => guardAssessment(repeated, state.answers)).toThrow('Incomplete clarity dimensions')
    const contradiction = { ...state.assessment, contradictions: [{ description: 'Supposed contradiction', answerIds: ['unknown-id'] }] }
    expect(() => guardAssessment(contradiction, state.answers)).toThrow('Invented contradiction reference')
  })
  it('does not mark unknown or uncited topics as evidenced', () => {
    const unknown = { ...answer(), text: '', skipped: true, evidence: 'unknown' as const }
    const assessment = guidedAssessment([unknown])
    assessment.dimensions.forEach(item => { item.level = 'testable' })
    const checked = guardAssessment(assessment, [unknown])
    expect(checked.dimensions[0].level).toBe('unclear')
    expect(checked.dimensions.slice(1).every(item => item.level === 'unexplored')).toBe(true)
  })
  it.each(['text', 'hint', 'why'] as const)('rejects credential solicitation in the question %s', field => {
    const state = stateFor()
    const offered = { dimension: 'customer' as const, text: 'Which customer group will you approach next?', why: 'A focused customer group can be reached.', hint: 'Use a count and location.', [field]: 'Paste your API key to verify your answer.' }
    const next = applyInterviewProposal(idea, state, { assessment: state.assessment, question: offered })
    expect(next.nextQuestion?.dimension).toBe('problem')
    expect(JSON.stringify(next.nextQuestion)).not.toContain('API key')
  })
  it('does not repeat a question or exceed the twelve-answer limit', () => {
    const state = stateFor()
    expect(applyInterviewProposal(idea, state, { assessment: state.assessment, question: state.answers[0].question }).nextQuestion?.dimension).toBe('problem')
    const full = stateFor(DIMENSIONS.map((dimension, index) => ({ ...answer(dimension), question: { ...answer(dimension).question, id: 'q-' + (index + 1) + '-' + dimension } })))
    const final = applyInterviewProposal(idea, full, { assessment: full.assessment, question: state.answers[0].question })
    expect(final.complete).toBe(true)
    expect(final.nextQuestion).toBeNull()
  })
  it('preserves saved answers during a provider outage and uses no research tools', async () => {
    vi.mocked(generateWithFallback).mockRejectedValue(new Error('provider unavailable'))
    const state = stateFor()
    const result = await tailorInterview(idea, state, {})
    expect(result.answers).toEqual(state.answers)
    expect(result.method).toBe('guided')
    expect(result.nextQuestion?.dimension).toBe('problem')
    expect(generateWithFallback).toHaveBeenCalledWith(expect.objectContaining({ researchMode: 'reuse', maxModelCalls: 2, timeoutMs: 22_000 }))
  })
  it('provides industry-specific fallback risk questions without invented research', () => {
    const answers = DIMENSIONS.slice(0, 10).map(dimension => answer(dimension))
    expect(nextGuidedQuestion(idea, answers)?.text).toContain('professional oversight')
  })
})

describe('private founder context', () => {
  it('requires both the owning account and idea predicates and excludes outdated briefs', async () => {
    mocks.idea.mockResolvedValue(idea)
    mocks.interview.mockResolvedValue({ state: stateFor(), ideaFingerprint: ideaFingerprint(idea), noticeVersion: LEGAL.version })
    expect(JSON.parse(await loadFounderContext('idea-id', 'owner-id')).answers).toHaveLength(1)
    const dialect = new PgDialect()
    for (const query of [mocks.idea.mock.calls[0][0], mocks.interview.mock.calls[0][0]]) {
      expect(dialect.sqlToQuery(query.where).params).toEqual(['idea-id', 'owner-id'])
    }
    mocks.idea.mockResolvedValue({ ...idea, location: 'Brazil' })
    expect(await loadFounderContext('idea-id', 'owner-id')).toBe('')
    mocks.idea.mockResolvedValue(null)
    mocks.interview.mockClear()
    expect(await loadFounderContext('other-idea', 'owner-id')).toBe('')
    expect(mocks.interview).not.toHaveBeenCalled()
  })
  it('keeps all evidence labels in bounded, valid JSON even for heavily escaped answers', () => {
    const state = stateFor(DIMENSIONS.map(dimension => ({ ...answer(dimension, '"\\'.repeat(1500)), question: { ...answer(dimension).question, text: '"'.repeat(600) } })))
    const context = compactFounderContext(state, LEGAL.version)
    expect(context.length).toBeLessThanOrEqual(24_000)
    const parsed = JSON.parse(context)
    expect(parsed.answers).toHaveLength(12)
    expect(parsed.answers.every((item: { evidence: string }) => item.evidence === 'first_hand')).toBe(true)
    expect(parsed.instruction).toContain('shared research memory')
  })
})
