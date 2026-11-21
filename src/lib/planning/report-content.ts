/** Zero is a meaningful result; empty optional model sections are not content. */
export function hasReportContent(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.some(item => hasReportContent(item, depth + 1))
  if (typeof value === 'object') return Object.entries(value).some(([key, item]) => !['label', 'dataLabel', 'currency', 'fetchedAt'].includes(key) && hasReportContent(item, depth + 1))
  return false
}

export function planningSourceLink(value: unknown): { href: string; hostname: string } | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? { href: url.href, hostname: url.hostname } : null
  } catch { return null }
}
/** Preserve the founder's explicitly named funding currency. Geography and
 * a generic dollar sign do not select a currency for financial allocations. */
export function pitchFundingCurrency(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const codes = [...new Set(value.match(/\b(?:USD|INR|EUR|GBP|CAD|AUD)\b/gi)?.map(code => code.toUpperCase()) ?? [])]
  if (codes.length === 1) return codes[0]
  if (codes.length > 1) return null
  if (value.includes('₹')) return 'INR'
  if (value.includes('€')) return 'EUR'
  if (value.includes('£')) return 'GBP'
  return null
}
