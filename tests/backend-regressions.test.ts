import { afterEach, describe, expect, it, vi } from 'vitest'
import { clientIp } from '@/lib/client-ip'
import { escapeHtml } from '@/lib/html'
import { finiteOrNull, toDatabaseInteger } from '@/lib/numbers'
import { isStaleValidationJob } from '@/lib/validation/jobs'

afterEach(() => vi.unstubAllEnvs())

describe('Production regression boundaries', () => {
  it('ignores spoofed forwarding prefixes and validates the trusted address', () => {
    vi.stubEnv('TRUSTED_PROXY_HOPS', '1')
    expect(clientIp({ headers: new Headers({ 'x-forwarded-for': '192.0.2.123, 203.0.113.5' }) })).toBe('203.0.113.5')
    expect(clientIp({ headers: new Headers({ 'x-forwarded-for': '192.0.2.123, garbage' }) })).toBeNull()
    vi.stubEnv('TRUSTED_PROXY_HOPS', '2')
    expect(clientIp({ headers: new Headers({ 'x-forwarded-for': '192.0.2.123, 203.0.113.5, 127.0.0.1' }) })).toBe('203.0.113.5')
  })

  it('escapes executable markup and both attribute delimiters in portfolio data', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">&\''))
      .toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;')
  })

  it('stores AI funding estimates within PostgreSQL integer bounds', () => {
    expect(toDatabaseInteger(501.72)).toBe(502)
    expect(toDatabaseInteger(3e12)).toBe(2_147_483_647)
    expect(toDatabaseInteger(-10)).toBe(0)
    expect(() => toDatabaseInteger(Infinity)).toThrow()
    expect(finiteOrNull(Infinity)).toBeNull()
    expect(finiteOrNull(0)).toBe(0)
  })

  it('recovers abandoned jobs while allowing the durable queue its pending window', () => {
    const now = new Date('2026-10-31T12:00:00Z')
    const old = new Date(now.getTime() - 20 * 60_000)
    vi.stubEnv('VALIDATION_RUNNER', 'inngest')
    expect(isStaleValidationJob({ status: 'pending', updatedAt: old, createdAt: old }, now)).toBe(false)
    expect(isStaleValidationJob({ status: 'running', updatedAt: old, createdAt: old }, now)).toBe(true)
    expect(isStaleValidationJob({ status: 'complete', updatedAt: old, createdAt: old }, now)).toBe(false)
    expect(isStaleValidationJob({ status: 'running', updatedAt: now, createdAt: old }, now)).toBe(false)
    vi.stubEnv('VALIDATION_RUNNER', 'local')
    expect(isStaleValidationJob({ status: 'pending', updatedAt: old, createdAt: old }, now)).toBe(true)
  })
})
