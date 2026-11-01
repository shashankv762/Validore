import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEALTH_URL, MAX_ATTEMPTS, REQUEST_TIMEOUT_MS, RETRY_DELAY_MS, WAKE_WINDOW_MS, startWakeCheck } from '../public/wake.js'

let dispose: (() => void) | undefined
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-01T10:00:00Z')) })
afterEach(() => { dispose?.(); dispose = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })
const ready = () => Response.json({ status: 'ok', service: 'validore' })
function start(options = {}) {
  const onStatus = vi.fn()
  const check = startWakeCheck({ onStatus, ...options })
  dispose = check.dispose
  return { ...check, onStatus }
}

describe('visitor-triggered Render wake-up', () => {
  it('requests liveness immediately without cookies and stops after a valid response', async () => {
    const fetcher = vi.fn().mockImplementation(async () => ready())
    vi.stubGlobal('fetch', fetcher)
    const { onStatus } = start()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(HEALTH_URL, expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', mode: 'cors', redirect: 'error' }))
    expect(onStatus.mock.calls.map(call => call[0])).toEqual(['waking', 'ready'])
    await vi.advanceTimersByTimeAsync(WAKE_WINDOW_MS * 3)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('tolerates Render startup HTML and temporary CORS/network failure before readiness', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('<h1>Starting</h1>', { headers: { 'content-type': 'text/html' } }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockImplementation(async () => ready())
    vi.stubGlobal('fetch', fetcher)
    const { onStatus } = start()
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(onStatus).toHaveBeenLastCalledWith('ready')
  })

  it.each([
    () => Response.json({ status: 'ok', service: 'another-service' }),
    () => Response.json({ status: 'starting', service: 'validore' }),
    () => new Response('broken-json', { headers: { 'content-type': 'application/json' } }),
    () => Response.json({ status: 'ok', service: 'validore' }, { status: 503 }),
  ])('does not turn an invalid or unsuccessful response into readiness', async makeResponse => {
    const fetcher = vi.fn().mockImplementation(async () => makeResponse())
    vi.stubGlobal('fetch', fetcher)
    const { onStatus } = start()
    await vi.advanceTimersByTimeAsync(WAKE_WINDOW_MS)
    expect(onStatus).not.toHaveBeenCalledWith('ready')
    expect(onStatus).toHaveBeenLastCalledWith('unconfirmed')
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(MAX_ATTEMPTS)
    const count = fetcher.mock.calls.length
    await vi.advanceTimersByTimeAsync(15 * 60_000)
    expect(fetcher).toHaveBeenCalledTimes(count)
  })

  it('times out hung requests and never overlaps them or exceeds the overall window', async () => {
    let active = 0, peak = 0
    const fetcher = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      active += 1
      peak = Math.max(peak, active)
      options.signal.addEventListener('abort', () => { active -= 1; reject(new DOMException('Aborted', 'AbortError')) }, { once: true })
    }))
    vi.stubGlobal('fetch', fetcher)
    const { onStatus } = start()
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    expect(active).toBe(0)
    await vi.advanceTimersByTimeAsync(WAKE_WINDOW_MS)
    expect(peak).toBe(1)
    expect(active).toBe(0)
    expect(onStatus).toHaveBeenLastCalledWith('unconfirmed')
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(MAX_ATTEMPTS)
  })

  it('does not request while hidden or offline and resumes only inside the visit window', async () => {
    let visible = false, online = true
    const fetcher = vi.fn().mockRejectedValue(new TypeError('starting'))
    vi.stubGlobal('fetch', fetcher)
    const check = start({ isVisible: () => visible, isOnline: () => online })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(fetcher).not.toHaveBeenCalled()
    visible = true
    check.sync()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
    online = false
    check.sync()
    await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 2)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(check.onStatus).toHaveBeenLastCalledWith('offline')
    online = true
    check.sync()
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledTimes(2)
    visible = false
    check.sync()
    await vi.advanceTimersByTimeAsync(WAKE_WINDOW_MS)
    visible = true
    check.sync()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(check.onStatus).toHaveBeenLastCalledWith('unconfirmed')
  })

  it('aborts an in-flight request on leaving and ignores late responses', async () => {
    let visible = true, complete: (value: Response) => void = () => {}
    const fetcher = vi.fn((_url, _options) => new Promise(resolve => { complete = resolve }))
    vi.stubGlobal('fetch', fetcher)
    const check = start({ isVisible: () => visible })
    visible = false
    check.sync()
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true)
    complete(ready())
    await vi.advanceTimersByTimeAsync(0)
    expect(check.onStatus).not.toHaveBeenCalledWith('ready')
    await vi.advanceTimersByTimeAsync(WAKE_WINDOW_MS)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('does not keep a stale ready label after a later back/forward restoration', async () => {
    const fetcher = vi.fn().mockImplementation(async () => ready())
    vi.stubGlobal('fetch', fetcher)
    const check = start()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(16 * 60_000)
    check.sync()
    expect(check.onStatus).toHaveBeenLastCalledWith('unconfirmed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('updates an already-ready page when connectivity is lost without restarting polling', async () => {
    let online = true
    const fetcher = vi.fn().mockImplementation(async () => ready())
    vi.stubGlobal('fetch', fetcher)
    const check = start({ isOnline: () => online })
    await vi.advanceTimersByTimeAsync(0)
    online = false
    check.sync()
    expect(check.onStatus).toHaveBeenLastCalledWith('offline')
    online = true
    check.sync()
    expect(check.onStatus).toHaveBeenLastCalledWith('unconfirmed')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
