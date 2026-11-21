import type { FeedbackAnalysis, FeedbackRecord, SentimentLabel } from './schema'

/** Immediate suggestions only. The saved AI analysis interprets sentence context,
 * mixed aspects and non-English feedback; owners can correct every label. */
export function suggestSentiment(content: string, rating: number | null = null): SentimentLabel {
  const words = content.toLowerCase().replace(/[’']/g, '').match(/[a-z]+|[.!?;,]/g) ?? []
  const positive = new Set(['good', 'great', 'love', 'excellent', 'helpful', 'easy', 'reliable', 'affordable', 'fast', 'smooth', 'best', 'useful'])
  const negative = new Set(['bad', 'terrible', 'hate', 'expensive', 'confusing', 'broken', 'slow', 'frustrating', 'unreliable', 'crash', 'crashes', 'overpriced', 'difficult', 'unusable', 'disappointed'])
  const negations = new Set(['not', 'never', 'no', 'isnt', 'wasnt', 'dont', 'doesnt', 'cant', 'cannot'])
  let positiveCount = 0; let negativeCount = 0
  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    if (!positive.has(word) && !negative.has(word)) continue
    const preceding = words.slice(Math.max(0, index - 3), index).join(' ').split(/[.!?;,]|\b(?:but|however|although)\b/).at(-1)?.split(' ') ?? []
    const negated = preceding.some(token => negations.has(token))
    if (positive.has(word) !== negated) positiveCount++; else negativeCount++
  }
  if (positiveCount && negativeCount) return 'mixed'
  const textSignal: SentimentLabel = positiveCount ? 'positive' : negativeCount ? 'negative' : 'unknown'
  const ratingSignal: SentimentLabel = rating === null ? 'unknown' : rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral'
  if (textSignal !== 'unknown' && ratingSignal !== 'unknown' && ratingSignal !== 'neutral' && textSignal !== ratingSignal) return 'mixed'
  return textSignal !== 'unknown' ? textSignal : ratingSignal
}

export function sentimentCounts(records: FeedbackRecord[], analysis?: FeedbackAnalysis | null) {
  const model = new Map(analysis?.observations.map(item => [item.recordId, item.sentiment]) ?? [])
  const counts: Record<SentimentLabel, number> = { positive: 0, negative: 0, mixed: 0, neutral: 0, unknown: 0 }
  for (const record of records) counts[record.sentiment ?? model.get(record.id) ?? suggestSentiment(record.content, record.rating)]++
  return counts
}

/** Avoid storing identities or credentials from pasted/public review text. */
export function cleanFeedbackText(value: string, max = 3000): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:sk-[a-z0-9_-]{16,}|bearer\s+[a-z0-9._-]{20,})/gi, '[credential removed]')
    .replace(/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone removed]')
    .replace(/\s+/g, ' ').trim().slice(0, max)
}
