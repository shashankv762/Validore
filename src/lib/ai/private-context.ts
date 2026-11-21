/** Private context is data. Excerpts must remain complete JSON and retain the
 * identities/evidence of founder answers and the selected feedback denominator. */
const identity = /^(?:id|questionId|recordId|answerIds|recordIds|dimension|evidence|kind|sourceType|provenance|sentiment|label|status|method|noticeVersion|answeredAt|occurredAt|createdAt|updatedAt|fetchedAt|publishedAt|dataPeriod|year)$/
const url = /^https?:\/\/\S+$/i

export function excerptContextText(value: string, limit: number): string {
  if (value.length <= limit) return value
  let end = Math.max(0, limit)
  // A cutoff in a URL must remove that URL, never turn its prefix into a link.
  for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    if (match.index < end && match.index + match[0].length > end) { end = match.index; break }
  }
  return value.slice(0, end) + ' [Excerpt; original has ' + value.length + ' characters]'
}

export function compactPrivateContext(context?: string, maxChars = 24_000): string | undefined {
  if (!context) return context
  const maximum = Number.isSafeInteger(maxChars) ? Math.max(4000, Math.min(24_000, maxChars)) : 24_000
  if (context.length <= maximum) return context
  let original: unknown
  try { original = JSON.parse(context) } catch {
    let limit = maximum - 500
    while (true) {
      const result = JSON.stringify({ kind: 'private_text_excerpt', text: excerptContextText(context, limit), excerpted: true,
        originalCharacters: context.length, limitation: 'This is an excerpt of private unstructured input, not parsed founder/feedback records.' })
      if (result.length <= maximum) return result
      limit = Math.max(0, limit - (result.length - maximum))
    }
  }
  type RecordSet = { path: string; inputRecords: number; totalRecords: number; selectedRecords: number; omittedInputRecords: number; notSuppliedRecords: number }
  const attempt = (textLimit: number, recordLimit: number, omitUrls: boolean) => {
    const recordSets: RecordSet[] = []
    let omittedUrls = 0
    let omittedArrays = 0
    const compact = (value: unknown, key = '', path = '$', depth = 0, parent?: Record<string, unknown>): unknown => {
      if (depth > 12) return { omitted: 'Nested private detail exceeded the context limit.' }
      if (typeof value === 'string') {
        if (url.test(value)) { if (!omitUrls && value.length <= 2000) return value; omittedUrls++; return null }
        if (identity.test(key) && value.length <= 2000) return value
        return excerptContextText(value, key === 'answer' || key === 'text' ? Math.max(100, textLimit) : textLimit)
      }
      if (Array.isArray(value)) {
        const preserve = ['answers', 'dimensions', 'contradictions', 'answerIds'].includes(key)
        const selected = key === 'records' ? Math.min(recordLimit, value.length) : preserve ? value.length : Math.min(value.length, 80)
        if (selected < value.length) omittedArrays += value.length - selected
        if (key === 'records') {
          const declared = parent?.totalRecords
          const totalRecords = typeof declared === 'number' && Number.isSafeInteger(declared) ? Math.max(value.length, declared) : value.length
          recordSets.push({ path, inputRecords: value.length, totalRecords, selectedRecords: selected,
            omittedInputRecords: value.length - selected, notSuppliedRecords: totalRecords - value.length })
        }
        return value.slice(0, selected).map((item, index) => compact(item, key, path + '[' + index + ']', depth + 1))
      }
      if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>
        const result = Object.fromEntries(Object.entries(object).map(([field, item]) => [field, compact(item, field, path + '.' + field, depth + 1, object)]))
        if (Array.isArray(object.records)) {
          result.suppliedRecords = (result.records as unknown[]).length
          result.recordSelection = { inputRecords: object.records.length, suppliedRecords: (result.records as unknown[]).length,
            omittedInputRecords: object.records.length - (result.records as unknown[]).length,
            note: 'Only the selected excerpts below were supplied. Omitted records were not analyzed in this context.' }
        }
        return result
      }
      return value
    }
    const value = compact(original)
    return JSON.stringify({ ...(value && typeof value === 'object' && !Array.isArray(value) ? value : { data: value }),
      privateContextCompaction: { excerpted: true, originalCharacters: context.length, recordSets, omittedUrlValues: omittedUrls,
        omittedArrayItems: omittedArrays, limitation: 'Private excerpts preserve founder answer identities, evidence labels and dates. Selected feedback is not the full notebook or a representative sample. Missing text/URLs are unknown; never infer them.' } })
  }
  for (const [textLimit, recordLimit] of [[700, 40], [500, 30], [350, 20], [220, 12], [120, 6], [60, 2], [0, 0]] as const) {
    const result = attempt(textLimit, recordLimit, false)
    if (result.length <= maximum) return result
  }
  const withoutUrls = attempt(0, 0, true)
  if (withoutUrls.length <= maximum) return withoutUrls
  // Schema-valid interviews have at most twelve short IDs. Keep those identities
  // even for malformed extra context that cannot fit after normal compaction.
  const findAnswers = (value: unknown, depth = 0): unknown[] => {
    if (!value || typeof value !== 'object' || depth > 12) return []
    const object = value as Record<string, unknown>
    return Array.isArray(object.answers) ? object.answers : Object.values(object).slice(0, 64).flatMap(item => findAnswers(item, depth + 1))
  }
  const answers = findAnswers(original).slice(0, 12).map(value => {
    const answer = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const question = answer.question && typeof answer.question === 'object' ? answer.question as Record<string, unknown> : {}
    const keep = (value: unknown, maximum: number) => typeof value === 'string' && value.length <= maximum ? value : null
    return { questionId: keep(answer.questionId ?? question.id, 80), dimension: keep(answer.dimension ?? question.dimension, 80), evidence: keep(answer.evidence, 80),
      unknown: answer.unknown === true || answer.skipped === true, answeredAt: keep(answer.answeredAt, 80), textOmitted: true }
  })
  return JSON.stringify({ answers, privateContextCompaction: { excerpted: true, originalCharacters: context.length,
    selectedRecords: 0, limitation: 'Additional private metadata exceeded the context budget. Founder answer identities remain, but answers/records require direct review.' } })
}
