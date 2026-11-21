import { NextRequest, NextResponse } from 'next/server'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { customerFeedback, customerFeedbackAnalyses, ideas, users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { isSameOriginMutation, PRIVATE_HEADERS, readJsonBody, RequestBodyError } from '@/lib/api-security'
import { isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { rateLimitCheck, checkAndIncrementConcurrency, decrementConcurrency } from '@/lib/rate-limit'
import { ExecutionCapacityError, reserveExecutionLease, releaseExecutionLease } from '@/lib/execution-admission'
import { checkCredits, deductCredits } from '@/lib/credits'
import { CREDIT_COSTS } from '@/lib/credit-costs'
import { decryptApiKey } from '@/lib/byok-crypto'
import { generateWithFallback } from '@/lib/ai/generate'
import { publicWebUrl } from '@/lib/ai/public-web'
import { getPlan } from '@/lib/plan-catalog'
import { LEGAL } from '@/lib/legal'
import { ideaFingerprint } from '@/lib/interview/engine'
import { FeedbackKind, Sentiment, FEEDBACK_METHOD_VERSION, MAX_ANALYZED_RECORDS, groundedFeedbackSchema } from '@/lib/customer-feedback/schema'
import { FeedbackError, deleteFeedbackRecord, digest, feedbackDigest, lockFeedbackIdea, readFeedbackRecords, readFeedbackView, saveFeedbackRecords } from '@/lib/customer-feedback/store'
import { readPublicReviews } from '@/lib/customer-feedback/public-reviews'
import { buildFeedbackPrompt, feedbackModelContext, FEEDBACK_CONTEXT_MAX_CHARS } from '@/lib/customer-feedback/prompt'

export const maxDuration = 300
type Context = { params: Promise<{ ideaId: string }> }
const reply = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: PRIVATE_HEADERS })
const Consent = { consent: z.literal(true), noticeVersion: z.literal(LEGAL.version) }
const publicUrl = z.string().url().max(2000).superRefine((value, context) => {
  try {
    const url = publicWebUrl(value)
    if ([...url.searchParams.keys()].some(key => /token|secret|password|auth|signature|email|key/i.test(key))) throw new Error('Sensitive URL')
  } catch { context.addIssue({ code: 'custom', message: 'Use a public source URL without credentials or personal query parameters.' }) }
})
const Actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('record'), requestId: z.string().uuid(), kind: FeedbackKind,
    content: z.string().trim().min(12).max(3000), sourceLabel: z.string().trim().min(2).max(120),
    sourceUrl: publicUrl.nullable().default(null), occurredAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable().default(null),
    rating: z.number().min(1).max(5).nullable().default(null), sentiment: Sentiment.nullable().default(null), ...Consent }).strict(),
  z.object({ action: z.literal('import'), requestId: z.string().uuid(), url: publicUrl, ...Consent }).strict(),
  z.object({ action: z.literal('analyze'), ...Consent }).strict(),
])

async function authorize(context: Context, write = false) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) throw new FeedbackError('Sign in to access your customer evidence.', 401)
  const id = z.string().uuid().safeParse((await context.params).ideaId)
  if (!id.success) throw new FeedbackError('A valid idea reference is required.')
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!owner || !isActiveAccount(owner)) throw new FeedbackError('This account is not active.', 403)
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, id.data), eq(ideas.userId, owner.id), eq(ideas.isActive, true)) })
  if (!idea) throw new FeedbackError('This idea was not found in your workspace.', 404)
  if (write && (!user.email_confirmed_at || idea.isReadOnly)) throw new FeedbackError('A verified account and editable idea are required to save or analyze evidence.', 403)
  return { owner, idea }
}

function failure(error: unknown) {
  if (error instanceof FeedbackError || error instanceof RequestBodyError) return reply({ error: error.message }, error.status)
  if (error instanceof ExecutionCapacityError) return reply({ error: error.message }, error.status)
  console.error('[customer-evidence] Request unavailable', { type: error instanceof Error ? error.name : 'UnknownError' })
  return reply({ error: 'Customer evidence could not be loaded or saved. Existing records are preserved. Please try again.' }, 503)
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { owner, idea } = await authorize(context)
    if (!(await rateLimitCheck(owner.id, 'feedback-read')).success) throw new FeedbackError('Please wait before reloading customer evidence.', 429)
    return reply(await readFeedbackView(idea.id, owner.id))
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest, context: Context) {
  let concurrentUser: string | null = null
  let executionLeaseId: string | null = null
  try {
    if (!isSameOriginMutation(request)) throw new FeedbackError('Invalid request origin.', 403)
    const { owner, idea } = await authorize(context, true)
    const parsed = Actions.safeParse(await readJsonBody(request, 16_384))
    if (!parsed.success) throw new FeedbackError('Check the record fields and acknowledge the current processing notice.')
    const input = parsed.data
    const scope = input.action === 'analyze' ? 'feedback-analyze' : input.action === 'import' ? 'feedback-import' : 'feedback-write'
    if (!(await rateLimitCheck(owner.id, scope)).success) throw new FeedbackError('Please wait a minute before trying again.', 429)
    if (input.action === 'record') {
      if (input.occurredAt && (input.occurredAt.length === 10 ? input.occurredAt > new Date(Date.now() + 14 * 3_600_000).toISOString().slice(0, 10) : Date.parse(input.occurredAt) > Date.now())) throw new FeedbackError('The observation date cannot be in the future.')
      const result = await saveFeedbackRecords(idea.id, owner.id, [{ ...input, provenance: 'owner_recorded', fetchedAt: null }])
      return reply({ ...await readFeedbackView(idea.id, owner.id), added: result.added, duplicates: result.duplicates, creditsCharged: 0 })
    }
    if (input.action === 'import') {
      const page = await readPublicReviews(input.url, { signal: AbortSignal.timeout(12_000), maxReviews: 20 }).catch(() => {
        throw new FeedbackError('This page could not expose accessible public reviews. Paste individual review excerpts and their source to continue.', 422)
      })
      const result = await saveFeedbackRecords(idea.id, owner.id, page.reviews.map(review => ({ kind: 'review', content: review.content,
        sourceLabel: page.source.source, sourceUrl: review.sourceUrl ?? page.source.url, occurredAt: review.occurredAt, rating: review.rating,
        sentiment: null, provenance: page.provenance ?? 'public_review_markup', fetchedAt: page.source.fetchedAt,
        requestId: input.requestId + ':' + digest(review.content).slice(0, 20) })))
      return reply({ ...await readFeedbackView(idea.id, owner.id), added: result.added, duplicates: result.duplicates,
        availableReviewCount: page.availableReviewCount, countIsLowerBound: page.countIsLowerBound ?? page.extractionCapped, importLimitations: page.limitations, creditsCharged: 0 })
    }

    const before = await readFeedbackView(idea.id, owner.id)
    if (!before.records.length) throw new FeedbackError('Record customer evidence before analyzing it.')
    if (before.analysis && !before.staleAnalysis) return reply({ ...before, creditsCharged: 0, reused: true })
    if (!(await checkCredits(owner.id, CREDIT_COSTS.CUSTOMER_EVIDENCE)).allowed) throw new FeedbackError('This analysis needs 20 credits. Claim daily credits or review your balance.', 402)
    if (!(await checkAndIncrementConcurrency(owner.id, 1)).allowed) throw new FeedbackError('An analysis is already running. Please wait for it to finish.', 429)
    concurrentUser = owner.id
    const plan = await getPlan(owner.tier)
    // Reserve room for themes, opposing evidence and actionable experiments.
    // Smaller output ceilings reduce the explicitly disclosed selected sample.
    const selectedLimit = isOwnerAccount(owner) ? MAX_ANALYZED_RECORDS : Math.max(1, Math.min(MAX_ANALYZED_RECORDS, Math.floor((plan.maxTokensPerCall - 1400) / 100)))
    const selected = before.records.slice(0, selectedLimit)
    const sourceDigest = feedbackDigest(before.records)
    const briefFingerprint = ideaFingerprint(idea)
    // Share the process-wide Postgres capacity limit with validation and
    // planning. This reservation lives for the model budget and is released
    // in finally even when generation or evidence fencing rejects the result.
    executionLeaseId = await db.transaction(async tx => {
      const { idea: lockedIdea } = await lockFeedbackIdea(tx, owner.id, idea.id)
      if (ideaFingerprint(lockedIdea) !== briefFingerprint) throw new FeedbackError('Your idea brief changed before analysis began. Review it and run again.', 409)
      const currentRecords = await readFeedbackRecords(idea.id, owner.id, tx)
      if (feedbackDigest(currentRecords) !== sourceDigest) throw new FeedbackError('Your evidence changed before analysis began. Review the new records and run again.', 409)
      return reserveExecutionLease(tx, owner.id, 'customer-feedback-analysis', new Date(Date.now() + 4 * 60_000))
    })
    const schema = groundedFeedbackSchema(selected)
    const generated = await generateWithFallback({ agentRole: 'customer', schema, prompt: buildFeedbackPrompt(selected, idea, before.totalRecords),
      privateContext: feedbackModelContext(selected), privateContextMaxChars: FEEDBACK_CONTEXT_MAX_CHARS,
      researchMode: 'reuse', maxResearchRounds: 0, maxModelCalls: 2,
      timeoutMs: 180_000, maxOutputTokens: 6500, temperature: 0, preferredAiProvider: owner.preferredAiProvider,
      customOpenRouterKey: owner.encryptedOpenrouterKey ? decryptApiKey(owner.encryptedOpenrouterKey) : null,
      maxTokensPerCall: isOwnerAccount(owner) ? undefined : plan.maxTokensPerCall })
    const analysis = schema.parse(generated.data)
    let creditsCharged = 0
    await db.transaction(async tx => {
      const locked = await lockFeedbackIdea(tx, owner.id, idea.id)
      if (ideaFingerprint(locked.idea) !== briefFingerprint) throw new FeedbackError('Your idea brief changed during analysis. Review it and run again; no credits were charged.', 409)
      const now = await readFeedbackRecords(idea.id, owner.id, tx)
      if (feedbackDigest(now) !== sourceDigest) throw new FeedbackError('Your evidence changed during analysis. Review the new records and run again; no credits were charged.', 409)
      const [existing] = await tx.select().from(customerFeedbackAnalyses).where(and(eq(customerFeedbackAnalyses.userId, owner.id),
        eq(customerFeedbackAnalyses.ideaId, idea.id), eq(customerFeedbackAnalyses.sourceDigest, sourceDigest), eq(customerFeedbackAnalyses.methodVersion, FEEDBACK_METHOD_VERSION), eq(customerFeedbackAnalyses.ideaFingerprint, briefFingerprint))).limit(1)
      if (existing) return
      if (!await deductCredits(owner.id, CREDIT_COSTS.CUSTOMER_EVIDENCE, 'CUSTOMER_EVIDENCE', idea.id, undefined, tx)) throw new FeedbackError('Your credit balance changed. Review it before trying again; this result was not charged or saved.', 402)
      await tx.insert(customerFeedbackAnalyses).values({ userId: owner.id, ideaId: idea.id, sourceDigest, methodVersion: FEEDBACK_METHOD_VERSION, ideaFingerprint: briefFingerprint,
        analysis, analyzedRecords: selected.length, totalRecords: before.totalRecords, provider: generated.provider,
        tokensUsed: Math.max(0, Math.min(2_147_483_647, Math.floor(generated.tokensUsed || 0))) })
      creditsCharged = isOwnerAccount(owner) ? 0 : CREDIT_COSTS.CUSTOMER_EVIDENCE
    })
    return reply({ ...await readFeedbackView(idea.id, owner.id), creditsCharged, reused: creditsCharged === 0 })
  } catch (error) { return failure(error) }
  finally {
    if (executionLeaseId && concurrentUser) {
      try { await releaseExecutionLease(executionLeaseId, concurrentUser) }
      catch { console.warn('[customer-evidence] Analysis capacity lease cleanup deferred until expiry') }
    }
    if (concurrentUser) await decrementConcurrency(concurrentUser)
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    if (!isSameOriginMutation(request)) throw new FeedbackError('Invalid request origin.', 403)
    const { owner, idea } = await authorize(context, true)
    const input = z.object({ id: z.string().uuid(), sentiment: Sentiment.nullable() }).strict().safeParse(await readJsonBody(request))
    if (!input.success) throw new FeedbackError('Choose a valid record and sentiment.')
    if (!(await rateLimitCheck(owner.id, 'feedback-write')).success) throw new FeedbackError('Please wait before editing another record.', 429)
    await db.transaction(async tx => {
      await lockFeedbackIdea(tx, owner.id, idea.id)
      const updated = await tx.update(customerFeedback).set({ sentiment: input.data.sentiment }).where(and(eq(customerFeedback.id, input.data.id),
        eq(customerFeedback.ideaId, idea.id), eq(customerFeedback.userId, owner.id), isNull(customerFeedback.deletedAt))).returning({ id: customerFeedback.id })
      if (!updated.length) throw new FeedbackError('This record was not found.', 404)
      await tx.delete(customerFeedbackAnalyses).where(and(eq(customerFeedbackAnalyses.ideaId, idea.id), eq(customerFeedbackAnalyses.userId, owner.id)))
    })
    return reply(await readFeedbackView(idea.id, owner.id))
  } catch (error) { return failure(error) }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    if (!isSameOriginMutation(request)) throw new FeedbackError('Invalid request origin.', 403)
    const { owner, idea } = await authorize(context, true)
    const input = z.object({ id: z.string().uuid() }).strict().safeParse(await readJsonBody(request))
    if (!input.success) throw new FeedbackError('Choose a valid record to remove.')
    if (!(await rateLimitCheck(owner.id, 'feedback-write')).success) throw new FeedbackError('Please wait before removing another record.', 429)
    await deleteFeedbackRecord(idea.id, owner.id, input.data.id)
    return reply(await readFeedbackView(idea.id, owner.id))
  } catch (error) { return failure(error) }
}
