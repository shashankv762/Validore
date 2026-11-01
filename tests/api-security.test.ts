import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { boundedBody, guardApiRequest, isSameOriginMutation, readJsonBody } from '@/lib/api-security'
import { contentSecurityPolicy } from '@/lib/security-headers'
import { COOKIE_NOTICE_DAYS, isCurrentCookieNotice, LEGAL } from '@/lib/legal'

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://validore.tech')
  vi.stubEnv('AUTH_ALLOWED_ORIGINS', '')
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })
const request = (path = '/api/ideas', init: RequestInit = {}) => {
  const headers = new Headers({ origin: 'https://validore.tech', 'content-type': 'application/json' })
  new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  return new NextRequest('https://validore.tech' + path, { method: 'POST', body: '{}', ...init, headers, signal: init.signal ?? undefined })
}

describe('API browser boundary', () => {
  it.each(['https://attacker.example', 'https://subdomain.validore.tech', 'null'])('rejects an untrusted origin: %s', async origin => {
    const response = await guardApiRequest(request('/api/ideas', { headers: { origin } }))
    expect(response?.status).toBe(403)
    expect(response?.headers.get('cache-control')).toBe('private, no-store')
  })
  it.each(['cross-site', 'same-site'])('rejects cross-origin browser fetch metadata: %s', site => {
    expect(isSameOriginMutation(request('/api/ideas', { headers: { 'sec-fetch-site': site } }))).toBe(false)
  })
  it('checks a cloned stream without consuming the route body', async () => {
    const req = request('/api/ideas', { body: '{"name":"Test idea"}' })
    expect(await guardApiRequest(req)).toBeNull()
    expect(await req.json()).toEqual({ name: 'Test idea' })
  })
  it('rejects form and text submissions to JSON API routes but accepts native auth forms', async () => {
    expect((await guardApiRequest(request('/api/ideas', { headers: { 'content-type': 'text/plain' } })))?.status).toBe(415)
    const form = request('/api/auth/signup', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=founder%40example.com' })
    expect(await guardApiRequest(form)).toBeNull()
  })
  it.each(['/api/webhooks/stripe', '/api/webhooks/razorpay', '/api/inngest'])('leaves signature verification to its handler: %s', async path => {
    expect(await guardApiRequest(request(path, { headers: { origin: 'https://service.example', 'content-type': 'application/octet-stream' } }))).toBeNull()
    expect((await guardApiRequest(request(path + '/spoof', { headers: { origin: 'https://service.example' } })))?.status).toBe(403)
  })
})

describe('bounded request streams', () => {
  it('counts actual chunk bytes even when Content-Length is absent', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      controller.enqueue(new Uint8Array(5)); controller.enqueue(new Uint8Array(5)); controller.close()
    } })
    const req = new Request('https://validore.tech', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    await expect(boundedBody(req, 8)).rejects.toMatchObject({ status: 413 })
  })
  it('rejects an oversized declared body before consuming it', async () => {
    await expect(boundedBody(new Request('https://validore.tech', { method: 'POST', headers: { 'content-length': '200' }, body: '{}' }), 20)).rejects.toMatchObject({ status: 413 })
  })
  it('rejects invalid UTF-8 rather than replacing bytes in an identifier', async () => {
    await expect(boundedBody(new Request('https://validore.tech', { method: 'POST', body: new Uint8Array([0xc3, 0x28]) }))).rejects.toMatchObject({ status: 400 })
  })
  it('terminates a stalled stream with 408 rather than accepting a partial body', async () => {
    vi.useFakeTimers()
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) }, cancel })
    const req = new Request('https://validore.tech', { method: 'POST', body: stream, duplex: 'half' } as RequestInit)
    const result = expect(boundedBody(req)).rejects.toMatchObject({ status: 408 })
    await vi.advanceTimersByTimeAsync(10_000)
    await result
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('enforces JSON format and handles malformed JSON', async () => {
    await expect(readJsonBody(new Request('https://validore.tech', { method: 'POST', body: '{}' }))).rejects.toMatchObject({ status: 415 })
    await expect(readJsonBody(request('/api/ideas', { body: '{' }))).rejects.toMatchObject({ status: 400 })
  })
})

describe('browser security and essential-storage acknowledgment', () => {
  it('uses a per-response nonce on dynamic pages and restricts production connections', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co')
    const policy = contentSecurityPolicy('test-nonce', true)
    expect(policy).toContain("script-src 'self' 'nonce-test-nonce' 'strict-dynamic'")
    expect(policy).toContain("connect-src 'self' https://project.supabase.co;")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toContain('unsafe-eval')
    expect(policy).not.toContain('https:;')
    expect(policy).not.toContain('*.supabase.co')
  })
  it('accepts only an unexpired acknowledgment of the current notice', () => {
    const now = Date.parse('2026-11-02T12:00:00Z')
    expect(isCurrentCookieNotice({ version: LEGAL.version, acknowledgedAt: new Date(now - 1000).toISOString() }, now)).toBe(true)
    for (const value of [null, {}, { version: 'old', acknowledgedAt: new Date(now).toISOString() },
      { version: LEGAL.version, acknowledgedAt: 'not-a-date' },
      { version: LEGAL.version, acknowledgedAt: new Date(now + 1).toISOString() },
      { version: LEGAL.version, acknowledgedAt: new Date(now - COOKIE_NOTICE_DAYS * 86_400_000).toISOString() }]) {
      expect(isCurrentCookieNotice(value, now)).toBe(false)
    }
  })
})
