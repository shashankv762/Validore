/** Drizzle wraps PostgreSQL failures; never log its query text or parameters. */
export function databaseErrorCode(error: unknown): string | undefined {
  const seen = new Set<object>()
  let current = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if ('code' in current && typeof current.code === 'string' && /^[0-9A-Z]{5}$/.test(current.code)) return current.code
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

export function isDatabaseSetupError(error: unknown): boolean {
  return ['42703', '42P01'].includes(databaseErrorCode(error) ?? '')
}
