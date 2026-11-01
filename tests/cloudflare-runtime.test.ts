import { afterEach, describe, expect, it, vi } from 'vitest'
import { withWorkerScope, workerScope, type WorkerEnvironment } from '@/lib/worker-scope'
import { readPublicAsset } from '@/lib/public-assets'
import { readPublicWebOnWorker } from '@/lib/ai/public-web'
import { prepareWorkerRequest, runCreditMaintenance } from '../cloudflare/handlers'

afterEach(() => vi.unstubAllGlobals())
const environment = (): WorkerEnvironment => ({ ASSETS: { fetch: vi.fn() }, CRON_SECRET: 'test-only-cron' })

describe('Cloudflare runtime boundaries', () => {
  it('replaces spoofed forwarding chains with the ingress IP', () => {
    const request = new Request('https://validore.tech/api/auth/signup', { headers: {
      'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1', 'x-real-ip': '198.51.100.2',
    } })
    const prepared = prepareWorkerRequest(request) as Request
    expect(prepared.headers.get('x-forwarded-for')).toBe('203.0.113.9')
    expect(prepared.headers.has('x-real-ip')).toBe(false)
    const missing = prepareWorkerRequest(new Request(request.url, { headers: { 'x-forwarded-for': '198.51.100.1' } })) as Request
    expect(missing.headers.has('x-forwarded-for')).toBe(false)
  })

  it('redirects www while preserving path and query', () => {
    const response = prepareWorkerRequest(new Request('https://www.validore.tech/demo?source=link')) as Response
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://validore.tech/demo?source=link')
  })

  it('authenticates cron internally and propagates failures', async () => {
    const env = environment(), ctx = { waitUntil: vi.fn() }
    const fetchApp = vi.fn().mockResolvedValue(Response.json({ success: true }))
    await runCreditMaintenance(env, ctx, fetchApp)
    const request = fetchApp.mock.calls[0][0] as Request
    expect(request.url).toBe('https://validore.tech/api/cron/reset-credits')
    expect(request.headers.get('authorization')).toBe('Bearer test-only-cron')
    fetchApp.mockResolvedValue(new Response('unavailable', { status: 503 }))
    await expect(runCreditMaintenance(env, ctx, fetchApp)).rejects.toThrow('503')
    fetchApp.mockClear()
    await expect(runCreditMaintenance({ ...env, CRON_SECRET: '' }, ctx, fetchApp)).rejects.toThrow('CRON_SECRET')
    expect(fetchApp).not.toHaveBeenCalled()
  })

  it('isolates simultaneous request resources and closes them after streaming', async () => {
    const pending: Promise<unknown>[] = [], closed: string[] = []
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) }
    const run = (name: string) => withWorkerScope(environment(), ctx, async () => {
      const scope = workerScope()!
      scope.resources.set('connection', name)
      scope.cleanup.push(async () => { closed.push(name) })
      await Promise.resolve()
      return new Response(new ReadableStream({
        start(controller) {
          expect(workerScope()?.resources.get('connection')).toBe(name)
          controller.enqueue(new TextEncoder().encode(name))
          controller.close()
        },
      }))
    })
    const responses = await Promise.all([run('first'), run('second')])
    expect(closed).toEqual([])
    expect(await Promise.all(responses.map(response => response.text()))).toEqual(['first', 'second'])
    await Promise.all(pending)
    expect(closed.sort()).toEqual(['first', 'second'])
    expect(workerScope()).toBeUndefined()
  })

  it('cleans up when a response is cancelled or a handler throws', async () => {
    const closed = vi.fn(), pending: Promise<unknown>[] = []
    const ctx = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) }
    const response = await withWorkerScope(environment(), ctx, async () => {
      workerScope()!.cleanup.push(async () => closed())
      return new Response(new ReadableStream())
    })
    await response.body!.cancel()
    await expect(withWorkerScope(environment(), ctx, async () => {
      workerScope()!.cleanup.push(async () => closed())
      throw new Error('handler failed')
    })).rejects.toThrow('handler failed')
    await Promise.all(pending)
    expect(closed).toHaveBeenCalledTimes(2)
  })

  it('loads document assets through the binding without public HTTP or disk', async () => {
    const env = environment()
    vi.mocked(env.ASSETS.fetch).mockResolvedValue(new Response('font-bytes'))
    const response = await withWorkerScope(env, { waitUntil: vi.fn() }, async () =>
      new Response(new Uint8Array(await readPublicAsset('/fonts/NotoSans-Regular.ttf'))))
    expect(await response.text()).toBe('font-bytes')
    expect((vi.mocked(env.ASSETS.fetch).mock.calls[0][0]).url).toBe('https://assets.invalid/fonts/NotoSans-Regular.ttf')
    await expect(readPublicAsset('/../secret')).rejects.toThrow('Invalid asset')
  })

  it('rejects private redirects and caps decoded public response bytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/secrets' } }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(readPublicWebOnWorker('https://example.org')).rejects.toThrow('Only public')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual', cache: 'no-store' })
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty('authorization')
    fetchMock.mockResolvedValue(new Response('a'.repeat(20), { headers: { 'content-type': 'text/plain' } }))
    await expect(readPublicWebOnWorker('https://example.org', { maxBytes: 10 })).rejects.toThrow('too large')
  })
})
