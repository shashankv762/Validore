import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ limit: vi.fn(), redis: vi.fn(), config: vi.fn() }))
vi.mock('@upstash/redis', () => ({ Redis: { fromEnv: mocks.redis } }))
vi.mock('@upstash/ratelimit', () => ({ Ratelimit: class {
  constructor(config: unknown) { mocks.config(config) }
  static slidingWindow(limit: number, window: string) { return { limit, window } }
  limit = mocks.limit
} }))
import { registrationLimit } from '@/lib/registration-limit'
const request = { headers: new Headers({ 'x-forwarded-for': '198.51.100.10' }) }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
  vi.stubEnv('TRUSTED_PROXY_HOPS', '1')
  vi.stubEnv('SIGNUP_MAX_PER_IP_WEEK', '3')
  mocks.limit.mockResolvedValue({ success: true })
})
afterEach(() => vi.unstubAllEnvs())
describe('new workspace registration limits', () => {
  it('uses one trusted-IP quota for all providers', async () => {
    expect((await registrationLimit(request)).allowed).toBe(true)
    expect(mocks.limit).toHaveBeenCalledWith('198.51.100.10')
    expect(mocks.config).toHaveBeenCalledWith(expect.objectContaining({ prefix: 'validore:registration_ip', limiter: { limit: 3, window: '7 d' } }))
  })
  it('fails closed when the trusted IP, Redis credentials or Redis service are unavailable', async () => {
    expect(await registrationLimit({ headers: new Headers() })).toMatchObject({ allowed: false, status: 503 })
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect(await registrationLimit(request)).toMatchObject({ allowed: false, status: 503 })
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    mocks.limit.mockRejectedValue(new Error('unavailable'))
    expect(await registrationLimit(request)).toMatchObject({ allowed: false, status: 503 })
  })
  it('rejects exhausted quotas and keeps unconfigured local development available', async () => {
    mocks.limit.mockResolvedValue({ success: false })
    expect(await registrationLimit(request)).toMatchObject({ allowed: false, status: 429 })
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect((await registrationLimit(request)).allowed).toBe(true)
  })
})
