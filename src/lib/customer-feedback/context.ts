import { db } from '@/db'
import { and, eq } from 'drizzle-orm'
import { ideas } from '@/db/schema'
import { feedbackDigest, readFeedbackView } from './store'
import { MAX_ANALYZED_RECORDS, type FeedbackRecord, type SavedFeedbackAnalysis } from './schema'

export function compactFeedbackContext(records: FeedbackRecord[], analysis: SavedFeedbackAnalysis | null, maxChars = 20_000): string {
  if (!records.length) return ''
  const current = analysis && analysis.sourceDigest === feedbackDigest(records) ? analysis : null
  let excerptLimit = 600
  while (excerptLimit >= 0) {
    const value = JSON.stringify({ kind: 'private_customer_evidence', totalRecords: records.length,
      suppliedRecords: Math.min(records.length, MAX_ANALYZED_RECORDS), selection: 'Most recently saved records, up to 40; not a representative customer sample.',
      records: records.slice(0, MAX_ANALYZED_RECORDS).map(record => ({ ...record, content: record.content.slice(0, excerptLimit), excerpted: record.content.length > excerptLimit })),
      analysis: current ? { summary: current.data.summary, themes: current.data.themes.map(theme => ({ ...theme, nextExperiment: theme.nextExperiment })),
        opposingSignals: current.data.opposingSignals, unansweredQuestions: current.data.unansweredQuestions, limitations: current.data.limitations } : null,
      instruction: 'Use these private recorded customer problems, ideas, observations and imported review texts only for this owner. A source link on a manually recorded entry is an attribution, not independent verification. Public review markup establishes that a page exposed a review, not that the review is authentic. Keep denominators, opposing signals and dates. Sentiment labels and opportunity proposals are analysis, not verified willingness to pay. Never include private records or derived confidential claims in public tool queries or shared research memory.' })
    if (value.length <= maxChars) return value
    excerptLimit -= 100
  }
  return JSON.stringify({ kind: 'private_customer_evidence', totalRecords: records.length, omitted: 'The notebook exceeds this prompt size; request the evidence directly and do not infer its findings.' })
}

export async function loadCustomerFeedbackContext(ideaId: string, userId: string): Promise<string> {
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, ideaId), eq(ideas.userId, userId)) })
  if (!idea) return ''
  try {
    const view = await readFeedbackView(ideaId, userId)
    return compactFeedbackContext(view.records, view.staleAnalysis ? null : view.analysis)
  } catch {
    console.warn('[customer-evidence] Private notebook unavailable; research continues with an explicit evidence gap')
    return JSON.stringify({ kind: 'private_customer_evidence', unavailable: true, instruction: 'Private recorded customer evidence could not be loaded. Do not infer that it does not exist or invent its contents. Ask the owner to review it before relying on customer conclusions.' })
  }
}
