import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { founderInterviews, ideas, users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginMutation, PRIVATE_HEADERS, readJsonBody, RequestBodyError } from '@/lib/api-security'
import { rateLimitCheck } from '@/lib/rate-limit'
import { decryptApiKey } from '@/lib/byok-crypto'
import { LEGAL } from '@/lib/legal'
import { ideaFingerprint, initialInterview, tailorInterview } from '@/lib/interview/engine'
import { guidedAssessment, nextGuidedQuestion } from '@/lib/interview/question-bank'
import { InterviewStateSchema, MAX_INTERVIEW_ANSWERS, type InterviewAnswer, type InterviewState, type InterviewView } from '@/lib/interview/schema'

export const maxDuration = 60
type Context = { params: Promise<{ ideaId: string }> }
class InterviewError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: PRIVATE_HEADERS })
const StartSchema = z.object({ consent: z.literal(true), noticeVersion: z.literal(LEGAL.version) }).strict()
const ChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('answer'), version: z.number().int().positive(), questionId: z.string().min(1).max(80),
    answer: z.string().trim().max(3000), evidence: z.enum(['assumption', 'first_hand', 'documented', 'unknown']), skipped: z.boolean() }).strict(),
  z.object({ action: z.literal('finish'), version: z.number().int().positive() }).strict(),
])

async function authorize(context: Context) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new InterviewError('Sign in to access your founder interview.', 401)
  const id = z.string().uuid().safeParse((await context.params).ideaId)
  if (!id.success) throw new InterviewError('A valid idea reference is required.')
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!owner) throw new InterviewError('Account not found.', 404)
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, id.data), eq(ideas.userId, owner.id)) })
  if (!idea || !idea.isActive) throw new InterviewError('Idea not found.', 404)
  return { owner, idea, verified: Boolean(user.email_confirmed_at) }
}

function view(row: typeof founderInterviews.$inferSelect, fingerprint: string): InterviewView {
  return { id: row.id, version: row.version, state: InterviewStateSchema.parse(row.state), updatedAt: row.updatedAt.toISOString(),
    stale: row.ideaFingerprint !== fingerprint, noticeVersion: row.noticeVersion }
}
function failure(error: unknown) {
  if (error instanceof InterviewError || error instanceof RequestBodyError) return reply({ error: error.message }, error.status)
  console.error('[interview] Request unavailable', { type: error instanceof Error ? error.name : 'UnknownError' })
  return reply({ error: 'The interview could not be loaded or saved. Your existing answers have not been deleted. Please try again.' }, 503)
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { owner, idea } = await authorize(context)
    const row = await db.query.founderInterviews.findFirst({ where: and(eq(founderInterviews.ideaId, idea.id), eq(founderInterviews.userId, owner.id)) })
    return reply({ interview: row ? view(row, ideaFingerprint(idea)) : null })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    if (!isSameOriginMutation(request)) return reply({ error: 'Invalid request origin' }, 403)
    const { owner, idea, verified } = await authorize(context)
    if (!verified) return reply({ error: 'Verify your email before starting a founder interview.' }, 403)
    if (idea.isReadOnly) return reply({ error: 'This idea is read-only.' }, 403)
    if (!StartSchema.safeParse(await readJsonBody(request)).success) return reply({ error: 'Please acknowledge the current processing notice to start.' }, 400)
    if (!(await rateLimitCheck(owner.id, 'interview')).success) return reply({ error: 'Please wait a minute before starting again.' }, 429)
    const fingerprint = ideaFingerprint(idea)
    await db.insert(founderInterviews).values({ userId: owner.id, ideaId: idea.id, ideaFingerprint: fingerprint, noticeVersion: LEGAL.version, state: initialInterview(idea) })
      .onConflictDoNothing({ target: founderInterviews.ideaId })
    const row = await db.query.founderInterviews.findFirst({ where: and(eq(founderInterviews.ideaId, idea.id), eq(founderInterviews.userId, owner.id)) })
    if (!row) throw new InterviewError('Interview is unavailable.', 503)
    return reply({ interview: view(row, fingerprint) })
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    if (!isSameOriginMutation(request)) return reply({ error: 'Invalid request origin' }, 403)
    const { owner, idea, verified } = await authorize(context)
    if (!verified || idea.isReadOnly) return reply({ error: 'A verified account and editable idea are required.' }, 403)
    const parsed = ChangeSchema.safeParse(await readJsonBody(request))
    if (!parsed.success) return reply({ error: 'Please check your answer and try again.' }, 400)
    const input = parsed.data
    if (input.action === 'answer' && !input.skipped && input.answer.length < 2) return reply({ error: 'Enter an answer or choose “I don’t know yet”.' }, 400)
    if (!(await rateLimitCheck(owner.id, 'interview')).success) return reply({ error: 'You are answering quickly. Please wait a minute.' }, 429)
    const saved = await db.transaction(async tx => {
      // Lock the idea in the same order as the editing and validation routes.
      const [currentIdea] = await tx.select().from(ideas).where(and(eq(ideas.id, idea.id), eq(ideas.userId, owner.id))).for('update')
      if (!currentIdea || currentIdea.isReadOnly || !currentIdea.isActive) throw new InterviewError('Idea is no longer editable.', 409)
      const [current] = await tx.select().from(founderInterviews).where(and(eq(founderInterviews.ideaId, idea.id), eq(founderInterviews.userId, owner.id))).for('update')
      if (!current) throw new InterviewError('Start an interview first.', 404)
      if (current.ideaFingerprint !== ideaFingerprint(currentIdea)) throw new InterviewError('Your brief changed. Review the saved interview and start a new one before answering.', 409)
      if (current.noticeVersion !== LEGAL.version) throw new InterviewError('Please review the current privacy notice and start a new interview.', 409)
      const state = InterviewStateSchema.parse(current.state)
      if (input.action === 'answer') {
        const prior = state.answers.find(answer => answer.question.id === input.questionId)
        if (prior && prior.text === (input.skipped ? '' : input.answer) && prior.skipped === input.skipped && prior.evidence === (input.skipped ? 'unknown' : input.evidence)) return { row: current, generate: false }
      }
      if (current.version !== input.version) throw new InterviewError('This interview changed in another tab. Reload it before answering.', 409)
      if (state.complete) return { row: current, generate: false }
      let next: InterviewState
      if (input.action === 'finish') next = { ...state, complete: true, nextQuestion: null }
      else {
        if (state.nextQuestion?.id !== input.questionId || state.answers.length >= MAX_INTERVIEW_ANSWERS) throw new InterviewError('This question is no longer current. Reload the interview.', 409)
        const answer: InterviewAnswer = { question: state.nextQuestion, text: input.skipped ? '' : input.answer, evidence: input.skipped ? 'unknown' : input.evidence,
          skipped: input.skipped, answeredAt: new Date().toISOString() }
        const answers = [...state.answers, answer]
        next = { ...state, answers, assessment: guidedAssessment(answers), nextQuestion: nextGuidedQuestion(currentIdea, answers), complete: answers.length >= MAX_INTERVIEW_ANSWERS, method: 'guided' }
      }
      const [row] = await tx.update(founderInterviews).set({ state: next, version: current.version + 1, updatedAt: new Date() })
        .where(and(eq(founderInterviews.id, current.id), eq(founderInterviews.userId, owner.id))).returning()
      return { row, generate: input.action === 'answer' && !input.skipped }
    })
    if (!saved.generate || !(await rateLimitCheck(owner.id, 'interview-daily')).success) return reply({ interview: view(saved.row, ideaFingerprint(idea)) })
    let customKey: string | null = null
    try { customKey = owner.encryptedOpenrouterKey ? decryptApiKey(owner.encryptedOpenrouterKey) : null } catch { return reply({ interview: view(saved.row, ideaFingerprint(idea)) }) }
    // No transaction stays open during a model request. A conditional update
    // prevents a late response from overwriting a later answer or deletion.
    const state = await tailorInterview(idea, saved.row.state, { preferredAiProvider: owner.preferredAiProvider, customOpenRouterKey: customKey })
    const [updated] = await db.update(founderInterviews).set({ state, version: saved.row.version + 1, updatedAt: new Date() })
      .where(and(eq(founderInterviews.id, saved.row.id), eq(founderInterviews.userId, owner.id), eq(founderInterviews.version, saved.row.version))).returning()
    if (updated) return reply({ interview: view(updated, ideaFingerprint(idea)) })
    const latest = await db.query.founderInterviews.findFirst({ where: and(eq(founderInterviews.id, saved.row.id), eq(founderInterviews.userId, owner.id)) })
    return reply({ interview: latest ? view(latest, ideaFingerprint(idea)) : null })
  } catch (error) { return failure(error) }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (!isSameOriginMutation(request)) return reply({ error: 'Invalid request origin' }, 403)
    const { owner, idea } = await authorize(context)
    const parsed = z.object({ version: z.number().int().positive() }).strict().safeParse(await readJsonBody(request))
    if (!parsed.success) return reply({ error: 'A current interview version is required.' }, 400)
    const deleted = await db.delete(founderInterviews).where(and(eq(founderInterviews.ideaId, idea.id), eq(founderInterviews.userId, owner.id), eq(founderInterviews.version, parsed.data.version))).returning({ id: founderInterviews.id })
    if (!deleted.length) return reply({ error: 'The interview changed. Reload before clearing it.' }, 409)
    return reply({ interview: null })
  } catch (error) { return failure(error) }
}
