import { describe, expect, it, vi } from 'vitest'
import { deployRender } from '../scripts/render-deployment.mjs'
const commit = 'a'.repeat(40)
const previousCommit = 'b'.repeat(40)
const options = { apiKey: 'test-secret', serviceId: 'srv-validoretest', commit, publicUrl: 'https://validore.tech' }
function runtime({ queued = false, failPublic = false } = {}) {
  let clock = 0
  let triggered = false
  let rolledBack = false
  const calls: Array<{ url: string; method?: string; body?: string }> = []
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetcher: typeof fetch = vi.fn(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = String(input)
    calls.push({ url, method: init?.method, body: init?.body as string | undefined })
    if (url.includes('/deploys?status=live')) return json([{ deploy: triggered && !rolledBack
      ? { id: 'dep-new', status: 'live', commit: { id: commit } }
      : { id: 'dep-old', status: 'live', commit: { id: previousCommit } } }])
    if (url.endsWith('/deploys') && init?.method === 'POST') {
      triggered = true
      return queued ? new Response(null, { status: 202 }) : json({ id: 'dep-new' }, 201)
    }
    if (url.includes('/deploys?limit=20')) return json([{ deploy: { id: 'dep-new', commit: { id: commit } } }])
    if (url.endsWith('/rollback')) { rolledBack = true; return json({ id: 'dep-rollback' }, 201) }
    if (url.endsWith('/deploys/dep-new')) return json({ id: 'dep-new', status: 'live', commit: { id: commit } })
    if (url.endsWith('/deploys/dep-rollback')) return json({ id: 'dep-rollback', status: 'live', commit: { id: previousCommit } })
    if (url.endsWith('/api/health')) return json({ status: 'ok', commit: rolledBack ? previousCommit : commit })
    if (url === options.publicUrl + '/') return new Response('Validore', { status: failPublic && !rolledBack ? 500 : 200 })
    throw new Error('Unexpected request: ' + url)
  })
  return { calls, dependencies: { fetcher, sleep: async (ms: number) => { clock += ms }, now: () => clock } }
}
describe('Render release controller', () => {
  it('deploys the exact tested commit and verifies its public revision', async () => {
    const test = runtime()
    const result = await deployRender(options, test.dependencies)
    expect(result.status).toBe('live')
    expect(test.calls.find(call => call.method === 'POST')?.body).toBe(JSON.stringify({ commitId: commit, clearCache: 'do_not_clear' }))
    expect(test.calls.filter(call => call.method === 'POST')).toHaveLength(1)
  })
  it('discovers a queued deployment without submitting a second mutation', async () => {
    const test = runtime({ queued: true })
    expect((await deployRender(options, test.dependencies)).deployId).toBe('dep-new')
    expect(test.calls.filter(call => call.method === 'POST')).toHaveLength(1)
  })
  it('restores the previous release after a failed public check and keeps CI failed', async () => {
    const test = runtime({ failPublic: true })
    const failure = await deployRender(options, test.dependencies).catch(error => error)
    expect(failure.message).toContain('Public health')
    expect(failure.deployment.status).toBe('rolled_back')
    expect(test.calls.find(call => call.url.endsWith('/rollback'))?.body).toBe(JSON.stringify({ deployId: 'dep-old' }))
  })
  it('does not expose API credentials or response bodies on authorization errors', async () => {
    const fetcher: typeof fetch = vi.fn(async () => new Response('private provider response', { status: 401 }))
    const failure = await deployRender(options, { fetcher }).catch(error => error)
    expect(failure.message).toContain('HTTP 401')
    expect(failure.message).not.toContain(options.apiKey)
    expect(failure.message).not.toContain('private provider response')
  })
})
