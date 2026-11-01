import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, OPTIONS } from '@/app/api/health/route'

const request = (origin?: string) => new Request('https://validore.onrender.com/api/health', {
  headers: origin ? { origin } : {},
})
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('HEALTH_CHECK_ALLOWED_ORIGINS', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('public marketing liveness check', () => {
  it.each(['https://validore.tech', 'https://www.validore.tech'])('allows only a credential-free health response for %s', async origin => {
    const response = await GET(request(origin))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ status: 'ok', service: 'validore' })
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Vary')).toBe('Origin')
  })

  it.each([undefined, 'null', 'https://validore.tech.evil.example', 'https://evil.example', 'http://validore.tech', 'http://localhost:4174'])('never reflects unapproved production origin %s', async origin => {
    const response = await GET(request(origin))
    expect(response.status).toBe(200)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })

  it('supports a simple preflight without permitting writes or credentials', async () => {
    const response = await OPTIONS(request('https://validore.tech'))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, HEAD, OPTIONS')
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    expect((await OPTIONS(request('https://evil.example'))).headers.has('Access-Control-Allow-Origin')).toBe(false)
  })

  it('accepts explicitly configured HTTPS preview origins but ignores patterns, paths and credentials', async () => {
    vi.stubEnv('HEALTH_CHECK_ALLOWED_ORIGINS', ' https://validore-preview.vercel.app, https://preview.example/path, *, https://user:pass@preview.example, http://preview.example ')
    expect((await GET(request('https://validore-preview.vercel.app'))).headers.get('Access-Control-Allow-Origin')).toBe('https://validore-preview.vercel.app')
    expect((await GET(request('https://preview.example'))).headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect((await GET(request('http://preview.example'))).headers.has('Access-Control-Allow-Origin')).toBe(false)
  })
})
