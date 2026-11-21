const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Saved reports can predate status flags or contain explicitly unreviewed scores. */
export function isIncompleteResearch(record: unknown): boolean {
  const saved = object(record)
  const data = object(saved.reportData)
  const agents = object(object(data.agentTrail).agents)
  const missing = object(data.scoreCoverage).missingCategories
  return saved.status === 'partial' || Object.values(agents).some(status => status === 'failed' || status === 'partial') ||
    (Array.isArray(missing) && missing.some(item => typeof item === 'string' && item.trim().length > 0))
}
