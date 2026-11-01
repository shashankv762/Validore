import { NextRequest, NextResponse } from 'next/server'
import { validAuthOrigin } from './auth-form'

export const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

export async function boundedBody(request: Request, maxBytes = 131_072): Promise<string> {
  const declared = request.headers.get('content-length')
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new RequestBodyError('Request body is too large', 413)
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { reject(new RequestBodyError('Request body timed out', 408)); void reader.cancel().catch(() => {}) }, 10_000)
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), deadline])
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new RequestBodyError('Request body is too large', 413) }
      chunks.push(value)
    }
  } finally { clearTimeout(timer); reader.releaseLock() }
  const data = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(data) }
  catch { throw new RequestBodyError('Request body must be valid UTF-8', 400) }
}

export async function readJsonBody(request: Request, maxBytes = 32_768): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new RequestBodyError('Use application/json', 415)
  const text = await boundedBody(request, maxBytes)
  try { return JSON.parse(text) } catch { throw new RequestBodyError('Invalid JSON request', 400) }
}

export function isSameOriginMutation(request: NextRequest): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site === 'cross-site' || site === 'same-site') return false
  return validAuthOrigin(request)
}

// These endpoints verify their own signed service requests. Browser cookies
// are not their authorization mechanism, so browser-origin checks do not apply.
export const SIGNED_API_PATHS = new Set(['/api/webhooks/stripe', '/api/webhooks/razorpay', '/api/inngest'])

export async function guardApiRequest(request: NextRequest): Promise<NextResponse | null> {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method) || SIGNED_API_PATHS.has(request.nextUrl.pathname)) return null
  if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: PRIVATE_HEADERS })
  const nativeAuth = /^\/api\/auth\/(signin|signup|google|signout|forgot-password|reset-password)$/.test(request.nextUrl.pathname)
  const type = request.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;|$)/i.test(type) && !(nativeAuth && /^(application\/x-www-form-urlencoded|multipart\/form-data)(?:\s*;|$)/i.test(type))) {
    // Empty native sign-out forms are allowed. Other API writes require JSON.
    if (request.nextUrl.pathname !== '/api/auth/signout') return NextResponse.json({ error: 'Unsupported request format' }, { status: 415, headers: PRIVATE_HEADERS })
  }
  try { await boundedBody(request.clone(), nativeAuth ? 16_384 : 131_072) }
  catch (error) { return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : 'Invalid request body' }, { status: error instanceof RequestBodyError ? error.status : 400, headers: PRIVATE_HEADERS }) }
  return null
}
