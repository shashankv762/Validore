import { createHash } from 'node:crypto'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/db'
import { customerFeedback, customerFeedbackAnalyses, ideas, users } from '@/db/schema'
import type { CreditTransaction } from '@/lib/credits'
import { isActiveAccount } from '@/lib/admin-access'
import { LEGAL } from '@/lib/legal'
import { ideaFingerprint } from '@/lib/interview/engine'
import { cleanFeedbackText } from './analysis'
import { FEEDBACK_METHOD_VERSION, FeedbackAnalysisSchema, FeedbackRecordSchema, MAX_FEEDBACK_RECORDS, type FeedbackRecord, type FeedbackView } from './schema'

export class FeedbackError extends Error { constructor(message: string, readonly status = 400) { super(message) } }
export const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const feedbackDigest = (records: FeedbackRecord[]) => digest(records.map(({ id, content, kind, sourceLabel, sourceUrl, occurredAt, rating, sentiment, provenance, fetchedAt }) => ({ id, content, kind, sourceLabel, sourceUrl, occurredAt, rating, sentiment, provenance, fetchedAt })))

function viewRecord(row: typeof customerFeedback.$inferSelect): FeedbackRecord {
  return FeedbackRecordSchema.parse({ id: row.id, kind: row.kind, content: row.content, sourceLabel: row.sourceLabel,
    sourceUrl: row.sourceUrl, occurredAt: row.occurredAt, rating: row.rating === null ? null : Number(row.rating),
    sentiment: row.sentiment, provenance: row.provenance, fetchedAt: row.fetchedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() })
}

export async function readFeedbackRecords(ideaId: string, userId: string, transaction: CreditTransaction | typeof db = db): Promise<FeedbackRecord[]> {
  const rows = await transaction.select().from(customerFeedback).where(and(eq(customerFeedback.ideaId, ideaId), eq(customerFeedback.userId, userId), isNull(customerFeedback.deletedAt)))
    .orderBy(desc(customerFeedback.createdAt), desc(customerFeedback.id)).limit(MAX_FEEDBACK_RECORDS)
  return rows.map(viewRecord)
}

export async function readFeedbackView(ideaId: string, userId: string): Promise<FeedbackView> {
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, ideaId), eq(ideas.userId, userId)) })
  if (!idea) throw new FeedbackError('This idea was not found in your workspace.', 404)
  const records = await readFeedbackRecords(ideaId, userId)
  const [stored] = await db.select().from(customerFeedbackAnalyses)
    .where(and(eq(customerFeedbackAnalyses.ideaId, ideaId), eq(customerFeedbackAnalyses.userId, userId)))
    .orderBy(desc(customerFeedbackAnalyses.createdAt), desc(customerFeedbackAnalyses.id)).limit(1)
  const parsed = stored ? FeedbackAnalysisSchema.safeParse(stored.analysis) : null
  const analysis = stored && parsed?.success ? { id: stored.id, sourceDigest: stored.sourceDigest, methodVersion: stored.methodVersion, data: parsed.data,
    ideaFingerprint: stored.ideaFingerprint, analyzedRecords: stored.analyzedRecords, totalRecords: stored.totalRecords, createdAt: stored.createdAt.toISOString() } : null
  return { records, totalRecords: records.length, analysis, readOnly: idea.isReadOnly,
    staleAnalysis: Boolean(analysis && (analysis.sourceDigest !== feedbackDigest(records) || analysis.methodVersion !== FEEDBACK_METHOD_VERSION || analysis.ideaFingerprint !== ideaFingerprint(idea))) }
}

export type NewFeedbackRecord = Omit<FeedbackRecord, 'id' | 'createdAt'> & { requestId: string }

/** Account + idea locks share the order used by other modules. The notebook
 * cap, duplicate detection and summary invalidation are one transaction. */
export async function lockFeedbackIdea(tx: CreditTransaction, userId: string, ideaId: string, editable = true) {
  const [account] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
  if (!account || !isActiveAccount(account)) throw new FeedbackError('This account is not active.', 403)
  const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.userId, userId))).for('update')
  if (!idea?.isActive) throw new FeedbackError('This idea was not found in your workspace.', 404)
  if (editable && idea.isReadOnly) throw new FeedbackError('This idea is read-only.', 403)
  return { account, idea }
}

export async function saveFeedbackRecords(ideaId: string, userId: string, inputs: NewFeedbackRecord[]) {
  return db.transaction(async tx => {
    await lockFeedbackIdea(tx, userId, ideaId)
    const existing = await readFeedbackRecords(ideaId, userId, tx)
    let total = existing.length; let added = 0; let duplicates = 0
    const saved: FeedbackRecord[] = []
    for (const input of inputs.slice(0, 20)) {
      const content = cleanFeedbackText(input.content)
      // Labels are part of the private model context too. Apply the same PII
      // and credential scrub before hashing, de-duplication and persistence.
      const sourceLabel = cleanFeedbackText(input.sourceLabel, 120)
      if (content.length < 3) throw new FeedbackError('Enter a customer observation, problem or idea.')
      if (sourceLabel.length < 2) throw new FeedbackError('Enter a source label without personal contact details.')
      // Equal copied texts from one source count once; the count never claims
      // to represent distinct people. A replay cannot silently change content.
      const contentHash = digest({ kind: input.kind, content: content.toLowerCase().normalize('NFKC'), sourceUrl: input.sourceUrl,
        sourceLabel: sourceLabel.toLowerCase(), occurredAt: input.occurredAt })
      const [replay] = await tx.select().from(customerFeedback).where(and(eq(customerFeedback.ideaId, ideaId), eq(customerFeedback.userId, userId), eq(customerFeedback.requestId, input.requestId))).limit(1)
      if (replay) {
        if (replay.deletedAt) throw new FeedbackError('This saved record was removed. Start a new record to add evidence again.', 409)
        if (replay.contentHash !== contentHash || replay.rating !== (input.rating === null ? null : String(input.rating)) || replay.sentiment !== input.sentiment || replay.provenance !== input.provenance) throw new FeedbackError('This save reference was already used for a different record or metadata. Please try again.', 409)
        saved.push(viewRecord(replay)); duplicates++; continue
      }
      const [duplicate] = await tx.select().from(customerFeedback).where(and(eq(customerFeedback.ideaId, ideaId), eq(customerFeedback.userId, userId), eq(customerFeedback.contentHash, contentHash), isNull(customerFeedback.deletedAt))).limit(1)
      if (duplicate) { saved.push(viewRecord(duplicate)); duplicates++; continue }
      if (total >= MAX_FEEDBACK_RECORDS) throw new FeedbackError('This idea has 200 evidence records. Remove obsolete entries before adding more.', 409)
      const [row] = await tx.insert(customerFeedback).values({ ideaId, userId, kind: input.kind, content, sourceLabel,
        sourceUrl: input.sourceUrl, occurredAt: input.occurredAt, rating: input.rating === null ? null : String(input.rating),
        sentiment: input.sentiment, provenance: input.provenance, fetchedAt: input.fetchedAt ? new Date(input.fetchedAt) : null,
        contentHash, requestId: input.requestId, noticeVersion: LEGAL.version }).returning()
      saved.push(viewRecord(row)); added++; total++
    }
    return { added, duplicates, saved }
  })
}

export async function deleteFeedbackRecord(ideaId: string, userId: string, id: string) {
  return db.transaction(async tx => {
    await lockFeedbackIdea(tx, userId, ideaId)
    const removed = await tx.update(customerFeedback).set({ deletedAt: new Date(), content: '[record removed]', sourceLabel: 'Removed record', sourceUrl: null,
      occurredAt: null, rating: null, sentiment: null, fetchedAt: null }).where(and(eq(customerFeedback.id, id), eq(customerFeedback.ideaId, ideaId), eq(customerFeedback.userId, userId), isNull(customerFeedback.deletedAt))).returning({ id: customerFeedback.id })
    if (removed.length) {
      // Derived quotes disappear too. A late analysis is blocked by its digest
      // recheck rather than restoring an entry that the owner deleted.
      await tx.delete(customerFeedbackAnalyses).where(and(eq(customerFeedbackAnalyses.ideaId, ideaId), eq(customerFeedbackAnalyses.userId, userId)))
    }
    return Boolean(removed.length)
  })
}
