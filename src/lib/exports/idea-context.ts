const BRIEF_FIELDS = ['name', 'industry', 'product', 'targetCustomer', 'location', 'businessModel', 'coreProblem', 'proposedSolution', 'publicResearchFocus'] as const
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

/** Use the brief captured for this result, never a mixture of old analysis and
 * the idea's current fields. Legacy records retain their existing fallback. */
export function savedExportIdea(record: Record<string, unknown>, current: Record<string, unknown> | null): Record<string, unknown> | null {
  const data = object(record.reportData)
  const analysis = object(record.analysisData)
  const candidates = [data?.ideaSnapshot, analysis?.ideaSnapshot, data?.idea]
  for (const value of candidates) {
    const snapshot = object(value)
    if (!snapshot || !BRIEF_FIELDS.some(field => typeof snapshot[field] === 'string' && String(snapshot[field]).trim())) continue
    // Do not fill absent historical fields with today's potentially different
    // customer/problem. Technical IDs and arbitrary keys are not report copy.
    return Object.fromEntries(BRIEF_FIELDS.filter(field => typeof snapshot[field] === 'string').map(field => [field, snapshot[field]]))
  }
  return current
}
