import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  user: { id: 'founder-account', emailVerified: true, unlimited: false }, notify: vi.fn(), success: vi.fn(), info: vi.fn(),
  updatedAt: 1,
}))
vi.mock('@/components/AccountProvider', () => ({ useAccount: () => ({ data: { user: mocks.user }, updatedAt: mocks.updatedAt }), notifyAccountUpdated: mocks.notify }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, info: mocks.info } }))
import { DailyCredits } from '@/components/DailyCredits'
let root: Root
let container: HTMLElement
let unavailable: boolean
let duplicate: boolean
let postCount: number
let finishClaim: (() => void) | null
const status = () => ({ available: true, credits: 10, claimedToday: false, nextClaimAt: new Date(Date.now() + 86_400_000).toISOString() })
beforeEach(() => {
  vi.clearAllMocks()
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('HTMLElement', window.HTMLElement); vi.stubGlobal('Event', window.Event)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  mocks.user = { id: 'founder-account', emailVerified: true, unlimited: false }
  mocks.updatedAt = 1
  unavailable = false; duplicate = false; postCount = 0; finishClaim = null
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      postCount++
      await new Promise<void>(resolve => { finishClaim = resolve })
      return Response.json({ ...status(), available: false, claimedToday: true, granted: duplicate ? 0 : 10, duplicate })
    }
    return Response.json(unavailable ? { error: 'Daily credits unavailable' } : status(), { status: unavailable ? 503 : 200 })
  }))
  container = document.getElementById('root') as HTMLElement; root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) }) }
const render = async () => { await act(async () => root.render(createElement(DailyCredits))); await settle() }
const button = () => container.querySelector('button') as HTMLButtonElement
const click = async () => { await act(async () => button().dispatchEvent(new Event('click', { bubbles: true }))); await settle() }
describe('Mounted daily claim controls', () => {
  it('rechecks server eligibility after UTC midnight without automatically claiming credits', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-16T23:59:59Z'))
    let claimed = true
    vi.mocked(fetch).mockImplementation(async (_url, options) => {
      expect(options?.method).not.toBe('POST')
      return Response.json({ credits: 10, claimedToday: claimed, available: !claimed,
        day: claimed ? '2026-11-16' : '2026-11-17', nextClaimAt: claimed ? '2026-11-17T00:00:00Z' : '2026-11-18T00:00:00Z' })
    })
    await act(async () => root.render(createElement(DailyCredits, { compact: true })))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(button().textContent).toBe('Claimed today')
    expect(container.textContent).toContain('Resets at 00:00 UTC.')
    claimed = false
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(button().textContent).toContain('Claim 10 daily credits')
    expect(button().disabled).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(mocks.notify).not.toHaveBeenCalled()
  })
  it('keeps a completed claim visible when an older focus refresh returns afterward', async () => {
    await render()
    let finishRefresh!: (value: Response) => void
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(resolve => { finishRefresh = resolve }))
    await act(async () => window.dispatchEvent(new Event('focus')))
    await click(); await act(async () => finishClaim!()); await settle()
    expect(button().textContent).toContain('Claimed today')
    await act(async () => finishRefresh(Response.json(status()))); await settle()
    expect(button().textContent).toContain('Claimed today'); expect(button().disabled).toBe(true)
    expect(mocks.success).toHaveBeenCalledOnce()
  })
  it('refreshes the other claim control after the shared account balance updates', async () => {
    await render(); expect(button().textContent).toContain('Claim 10 daily credits')
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ ...status(), available: false, claimedToday: true }))
    mocks.updatedAt++; await render()
    expect(button().textContent).toContain('Claimed today'); expect(button().disabled).toBe(true)
    expect(postCount).toBe(0)
  })
  it('aborts a prior owner claim and excludes its late result after the account changes', async () => {
    await render(); await click()
    expect(button().textContent).toContain('Claiming')
    mocks.user = { ...mocks.user, id: 'different-founder-account' }; await render()
    expect(button().textContent).toContain('Claim 10 daily credits'); expect(button().disabled).toBe(false)
    await act(async () => finishClaim!()); await settle()
    expect(button().textContent).not.toContain('Claimed today')
    expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled()
  })
  it('shows a pending state, prevents double clicks, and refreshes account balance on successful claim', async () => {
    await render(); expect(button().disabled).toBe(false); expect(button().textContent).toContain('Claim 10 daily credits')
    await click(); expect(button().disabled).toBe(true); expect(button().textContent).toContain('Claiming')
    await click(); expect(postCount).toBe(1)
    await act(async () => finishClaim!()); await settle()
    expect(button().disabled).toBe(true); expect(button().textContent).toContain('Claimed today')
    expect(container.textContent).toContain('Next claim:')
    expect(mocks.notify).toHaveBeenCalledOnce(); expect(mocks.success).toHaveBeenCalledOnce()
  })
  it('handles an already-claimed retry without showing another earned grant', async () => {
    duplicate = true; await render(); await click(); await act(async () => finishClaim!()); await settle()
    expect(button().textContent).toContain('Claimed today')
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.info).toHaveBeenCalledOnce()
  })
  it('offers a working refresh after a status error and keeps unverified accounts disabled', async () => {
    unavailable = true; await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Daily credits unavailable')
    expect(button().textContent).toContain('Refresh daily credits'); expect(button().disabled).toBe(false)
    unavailable = false; await click(); expect(button().textContent).toContain('Claim 10 daily credits')
    mocks.user = { ...mocks.user, emailVerified: false }; await render()
    expect(button().textContent).toContain('Verify email to claim'); expect(button().disabled).toBe(true)
    expect(postCount).toBe(0)
  })
  it('does not offer a claim or load reward status for the owner allowance', async () => {
    mocks.user = { ...mocks.user, unlimited: true }; await render()
    expect(container.querySelector('button')).toBeNull(); expect(fetch).not.toHaveBeenCalled()
  })
})
