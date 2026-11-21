import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { reserveResearchHttp, withResearchHttpBudget } from '@/lib/ai/research-http-budget'
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('UPSTASH_REDIS_REST_URL', ''); vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
})
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })
const request = (run: string, url = 'https://example.org/page', size = 1000) => withResearchHttpBudget(run, () => reserveResearchHttp(url, size))
describe('whole-run public research HTTP admission', () => {
  it('caps concurrent requests across roles and releases only once', async () => {
    const run = randomUUID()
    const [a, b] = await Promise.all([request(run), request(run)])
    await expect(request(run)).rejects.toThrow('shared research budget')
    await a!.finish(100); await a!.finish(100)
    const c = await request(run)
    await expect(request(run)).rejects.toThrow('shared research budget')
    await b!.finish(100); await c!.finish(100)
  })
  it('counts every retry/redirect attempt while one equivalent search question uses one question slot', async () => {
    const run = randomUUID()
    for (let index = 0; index < 8; index++) {
      const admission = await withResearchHttpBudget(run, () => reserveResearchHttp('https://example.org/' + index, 1000), { kind: 'search', key: 'same-question' })
      await admission!.finish(100)
    }
    await expect(withResearchHttpBudget(run, () => reserveResearchHttp('https://example.org/last', 1000), { kind: 'search', key: 'same-question' })).rejects.toThrow('shared research budget')
  })
  it('limits unique search questions, original pages and official-data lookups separately', async () => {
    const run = randomUUID()
    for (const key of ['one', 'two']) {
      const admission = await withResearchHttpBudget(run, () => reserveResearchHttp('https://search.example/', 1000), { kind: 'search', key })
      await admission!.finish(100)
    }
    await expect(withResearchHttpBudget(run, () => reserveResearchHttp('https://search.example/', 1000), { kind: 'search', key: 'three' })).rejects.toThrow()
    const data = await request(run, 'https://api.worldbank.org/one'); await data!.finish(100)
    await expect(request(run, 'https://api.worldbank.org/two')).rejects.toThrow()
    for (let index = 0; index < 3; index++) { const page = await request(run, 'https://example.org/' + index); await page!.finish(100) }
    await expect(request(run, 'https://example.org/four')).rejects.toThrow()
  })
  it('reserves a bounded aggregate duration and charges consumed response bytes', async () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-17T00:00:00Z')
    const run = randomUUID()
    const a = await request(run); vi.advanceTimersByTime(10_000); await a!.finish(1000)
    const b = await request(run); vi.advanceTimersByTime(10_000); await b!.finish(1000)
    const c = await request(run)
    expect(c!.timeoutMs).toBe(5000)
    vi.advanceTimersByTime(5000); await c!.finish(1000)
    await expect(request(run)).rejects.toThrow()
    const bytesRun = randomUUID()
    for (let index = 0; index < 4; index++) { const part = await request(bytesRun, undefined, 1_000_000); await part!.finish(1_000_000) }
    await expect(request(bytesRun)).rejects.toThrow()
  })
  it('fails closed for production live research without distributed admission', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect(request(randomUUID())).rejects.toThrow('shared research budget')
  })
})
