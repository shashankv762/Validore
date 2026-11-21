/** Safe failure metadata survives provider fallback without retaining responses,
 * credentials or private request bodies in durable queue errors. */
export class GenerationUnavailableError extends Error {
  readonly retryable: boolean
  readonly retryAt?: number
  constructor(message: string, retryable: boolean, retryAt?: number) {
    super(message)
    this.name = 'GenerationUnavailableError'
    this.retryable = retryable
    if (retryable && typeof retryAt === 'number' && Number.isSafeInteger(retryAt) && retryAt >= 0) this.retryAt = retryAt
  }
}

/** Retry-After is untrusted provider metadata. Keep only a bounded deadline,
 * never the raw header, response body or request-bearing cause. */
export function retryAfterDeadline(headers: unknown, now = Date.now()): number | undefined {
  if (!headers || typeof headers !== 'object' || !Number.isSafeInteger(now) || now < 0) return undefined
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === 'retry-after')?.[1]
  if (typeof entry !== 'string' || entry.length > 128 || /[\r\n\u0000-\u001f\u007f]/.test(entry)) return undefined
  const value = entry.trim()
  let delay: number
  if (/^\d+$/.test(value)) delay = Number(value) * 1000
  else if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) delay = Date.parse(value) - now
  else return undefined
  if (!Number.isFinite(delay) || delay < 0) return undefined
  return now + Math.max(1000, Math.min(86_400_000, Math.ceil(delay)))
}

export function temporaryFailureRetryAt(error: unknown, now = Date.now(), fallbackMs = 30_000): number | undefined {
  if (!isRetryableGenerationFailure(error)) return undefined
  if (error instanceof GenerationUnavailableError && error.retryAt !== undefined) return error.retryAt
  const headers = error && typeof error === 'object' && 'responseHeaders' in error ? error.responseHeaders : undefined
  return retryAfterDeadline(headers, now) ?? now + fallbackMs
}

const transientCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'])
const terminalNames = new Set(['SyntaxError', 'ZodError', 'OutputQualityError', 'OutputBudgetExhaustedError',
  'AI_NoObjectGeneratedError', 'AI_JSONParseError', 'AI_TypeValidationError', 'AI_InvalidResponseDataError'])

export function isRetryableGenerationFailure(error: unknown): boolean {
  if (error instanceof GenerationUnavailableError) return error.retryable
  const seen = new Set<object>()
  let node = error
  let transient = false
  for (let depth = 0; node && typeof node === 'object' && !seen.has(node) && depth < 6; depth++) {
    seen.add(node)
    const value = node as { name?: unknown; code?: unknown; statusCode?: unknown; cause?: unknown }
    if (typeof value.name === 'string' && terminalNames.has(value.name)) return false
    if (typeof value.statusCode === 'number') return value.statusCode === 408 || value.statusCode === 429 || value.statusCode >= 500 && value.statusCode <= 599
    transient ||= typeof value.name === 'string' && ['TimeoutError', 'AbortError', 'AI_EmptyResponseBodyError', 'AI_NoContentGeneratedError'].includes(value.name) ||
      typeof value.code === 'string' && transientCodes.has(value.code)
    node = value.cause
  }
  return transient
}
