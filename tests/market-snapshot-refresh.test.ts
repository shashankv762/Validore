import { afterEach, describe, expect, it, vi } from 'vitest'
// Importing the public-fetch helper must not execute a refresh or write data.
import { fetchPublic } from '../scripts/refresh-market-snapshot.mjs'

const url = 'https://api.worldbank.org/v2/indicator/SP.POP.TOTL?format=json'
const options = { hosts: ['api.worldbank.org'], format: 'json' }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Bounded official-data refresh requests', () => {
  it('recovers network and server failures within three attempts and records each actual outcome', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Transient network failure'))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(Response.json([{ page: 1, pages: 1, total: 1 }, [{ id: 'SP.POP.TOTL' }]]))
    vi.stubGlobal('fetch', fetch)
    const resultPromise = fetchPublic(url, options)
    await vi.runAllTimersAsync()
    const result = await resultPromise
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(result.attempts.map((row: { status: string }) => row.status)).toEqual(['failed', 'failed', 'complete'])
    expect(result.bytes).toBeGreaterThan(0)
    expect(result.fetchedAt).toBe(result.attempts[2].completedAt)
  })

  it('stops after three persistent upstream failures without manufacturing a successful retrieval', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async () => new Response('', { status: 502 }))
    vi.stubGlobal('fetch', fetch)
    const expectation = expect(fetchPublic(url, options)).rejects.toThrow('HTTP 502')
    await vi.runAllTimersAsync(); await expectation
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('rejects nonofficial URLs, unsafe redirects, wrong content types and oversized bodies without retrying them', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    await expect(fetchPublic('https://attacker.example/data', options)).rejects.toThrow('allowlist')
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://attacker.example/data' } }))
    await expect(fetchPublic(url, options)).rejects.toThrow('allowlist')
    expect(fetch).toHaveBeenCalledTimes(1)
    fetch.mockResolvedValueOnce(new Response('<html>Error</html>', { headers: { 'content-type': 'text/html' } }))
    await expect(fetchPublic(url, options)).rejects.toThrow('content type')
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockResolvedValueOnce(Response.json({ content: 'x'.repeat(300) }))
    await expect(fetchPublic(url, { ...options, maxBytes: 32 })).rejects.toThrow('Response exceeds')
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})
