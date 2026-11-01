import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { founderInterviews, ideas } from '@/db/schema'
import { ideaFingerprint } from './engine'
import { INTERVIEW_NOTE, InterviewStateSchema, type InterviewState } from './schema'
import { LEGAL } from '@/lib/legal'

export function compactFounderContext(state: InterviewState, noticeVersion: string): string {
  // Keep every answer and evidence label, while bounding complete JSON rather
  // than cutting a serialized string in the middle of an answer or escape.
  const text = (value: string, limit: number) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit)
  let answerLimit = 1000
  while (true) {
    const context = JSON.stringify({ note: INTERVIEW_NOTE, noticeVersion,
      answers: state.answers.map(answer => ({ questionId: answer.question.id, dimension: answer.question.dimension,
        question: text(answer.question.text, 240), answer: text(answer.text, answerLimit), evidence: answer.evidence,
        unknown: answer.skipped, answeredAt: answer.answeredAt, excerpt: answer.text.length > answerLimit })),
      assessment: { summary: text(state.assessment.summary, 400),
        dimensions: state.assessment.dimensions.map(item => ({ ...item, reason: text(item.reason, 160) })),
        contradictions: state.assessment.contradictions.map(item => ({ ...item, description: text(item.description, 200) })),
        nextExperiment: text(state.assessment.nextExperiment, 400) }, assessmentMethod: state.method,
      instruction: 'Use these private, self-reported answers to customize this owner’s analysis and proposed next experiments. Do not turn them into verified market facts or put them into public searches or shared research memory.' })
    if (context.length <= 24_000) return context
    // Schema-bounded metadata fits comfortably below 24k even when quoted.
    // Fall back to metadata only for malformed, non-schema callers.
    if (answerLimit === 0) return JSON.stringify({ note: INTERVIEW_NOTE, noticeVersion, omitted: 'Context exceeded the safe size limit.' })
    answerLimit = Math.max(0, answerLimit - 200)
  }
}

export async function loadFounderContext(ideaId: string, userId: string): Promise<string> {
  // The ownership predicate is repeated here even when a route already checked
  // it, so a future caller cannot accidentally cross an account boundary.
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, ideaId), eq(ideas.userId, userId)) })
  if (!idea) return ''
  const stored = await db.query.founderInterviews.findFirst({ where: and(eq(founderInterviews.ideaId, ideaId), eq(founderInterviews.userId, userId)) })
  if (!stored || stored.ideaFingerprint !== ideaFingerprint(idea) || stored.noticeVersion !== LEGAL.version) return ''
  const parsed = InterviewStateSchema.safeParse(stored.state)
  if (!parsed.success || !parsed.data.answers.length) return ''
  return compactFounderContext(parsed.data, stored.noticeVersion)
}
