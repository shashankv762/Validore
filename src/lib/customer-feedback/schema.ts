import { z } from 'zod'

export const FEEDBACK_METHOD_VERSION = '2026-11-16.1'
export const MAX_FEEDBACK_RECORDS = 200
export const MAX_ANALYZED_RECORDS = 40
export const FeedbackKind = z.enum(['review', 'interview', 'support', 'survey', 'problem', 'idea'])
export const Sentiment = z.enum(['positive', 'negative', 'mixed', 'neutral', 'unknown'])
export type SentimentLabel = z.infer<typeof Sentiment>

export const FeedbackRecordSchema = z.object({
  id: z.string().uuid(), kind: FeedbackKind, content: z.string().min(3).max(3000),
  sourceLabel: z.string().max(120), sourceUrl: z.string().max(2000).nullable(),
  occurredAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).nullable(), rating: z.number().min(1).max(5).nullable(),
  sentiment: Sentiment.nullable(), provenance: z.enum(['owner_recorded', 'public_review_markup', 'public_review_feed']),
  fetchedAt: z.string().nullable(), createdAt: z.string(),
})
export type FeedbackRecord = z.infer<typeof FeedbackRecordSchema>

const Sentence = z.string().trim().min(3).max(600)
export const FeedbackAnalysisSchema = z.object({
  summary: z.string().trim().min(30).max(1600),
  observations: z.array(z.object({
    recordId: z.string().uuid(), sentiment: Sentiment, quote: z.string().trim().min(3).max(240),
    reason: Sentence, aspects: z.array(z.string().trim().min(2).max(80)).min(1).max(4),
  })).min(1).max(MAX_ANALYZED_RECORDS),
  themes: z.array(z.object({
    theme: z.string().trim().min(3).max(140), recordIds: z.array(z.string().uuid()).min(1).max(MAX_ANALYZED_RECORDS),
    customerProblem: Sentence, opportunityHypothesis: z.string().trim().min(10).max(800),
    nextExperiment: z.object({ method: Sentence, metric: Sentence, passThreshold: Sentence, failThreshold: Sentence }),
  })).max(8),
  opposingSignals: z.array(Sentence).max(8), unansweredQuestions: z.array(Sentence).max(10),
  limitations: z.array(Sentence).min(1).max(8),
})
export type FeedbackAnalysis = z.infer<typeof FeedbackAnalysisSchema>
export type SavedFeedbackAnalysis = {
  id: string; sourceDigest: string; methodVersion: string; data: FeedbackAnalysis;
  ideaFingerprint?: string;
  analyzedRecords: number; totalRecords: number; createdAt: string;
}
export type FeedbackView = { records: FeedbackRecord[]; totalRecords: number; analysis: SavedFeedbackAnalysis | null; staleAnalysis: boolean; readOnly?: boolean }

export function groundedFeedbackSchema(records: FeedbackRecord[]) {
  const byId = new Map(records.map(record => [record.id, record]))
  const normalize = (value: string) => value.replace(/\s+/g, ' ').trim()
  return FeedbackAnalysisSchema.superRefine((data, context) => {
    const seen = new Set<string>()
    for (const [index, observation] of data.observations.entries()) {
      const record = byId.get(observation.recordId)
      if (!record || seen.has(observation.recordId)) context.addIssue({ code: 'custom', path: ['observations', index, 'recordId'], message: 'Use each supplied record once; do not invent or duplicate record references.' })
      else {
        seen.add(record.id)
        if (!normalize(record.content).includes(normalize(observation.quote))) context.addIssue({ code: 'custom', path: ['observations', index, 'quote'], message: 'The quote must be an exact excerpt from this record.' })
        if (record.sentiment && observation.sentiment !== record.sentiment) context.addIssue({ code: 'custom', path: ['observations', index, 'sentiment'], message: 'Preserve the sentiment explicitly reviewed by the owner, including an unclear label.' })
      }
    }
    if (seen.size !== byId.size) context.addIssue({ code: 'custom', path: ['observations'], message: 'Classify every supplied record, including neutral or unknown records.' })
    for (const [index, theme] of data.themes.entries()) {
      if (new Set(theme.recordIds).size !== theme.recordIds.length || theme.recordIds.some(id => !byId.has(id))) context.addIssue({ code: 'custom', path: ['themes', index, 'recordIds'], message: 'Theme evidence must contain unique supplied record references.' })
      if (normalize(theme.nextExperiment.passThreshold).toLowerCase() === normalize(theme.nextExperiment.failThreshold).toLowerCase()) context.addIssue({ code: 'custom', path: ['themes', index, 'nextExperiment'], message: 'Provide distinct pass and fail criteria so the experiment can disconfirm the proposal.' })
    }
    if (data.observations.some(item => item.sentiment === 'mixed') && !data.opposingSignals.length) context.addIssue({ code: 'custom', path: ['opposingSignals'], message: 'Retain the opposing aspects found in mixed observations rather than omitting them from the decision summary.' })
  })
}
