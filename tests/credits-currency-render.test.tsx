import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({ billing: { credits: false } }))
vi.mock('@/components/AccountProvider', () => ({
  useAccount: () => ({ data: { user: { id: 'synthetic-founder', tier: 'free', unlimited: false,
    creditBalance: 0, purchasedCredits: 200, rewardCredits: 0, creditCycleAllowance: 0,
    crowdfundingCredits: 0, pitchDeckCredits: 0, validationsThisMonth: 0, creditResetAt: null },
  billing: fixture.billing }, loading: false, refresh: vi.fn() }),
  notifyAccountUpdated: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/components/DailyCredits', () => ({ DailyCredits: () => null }))
vi.mock('@/components/RewardedCredits', () => ({ RewardedCredits: () => null }))

import CreditsPage from '@/app/dashboard/credits/page'
import { CurrencyProvider } from '@/components/CurrencyProvider'
import { CREDIT_PACKAGES } from '@/lib/credit-packages'
import { displayUsd, EXCHANGE_RATE_DATE } from '@/lib/pricing-currency'

let root: Root
let container: HTMLElement
let saved: string | null
beforeEach(() => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
  const options = new Intl.DateTimeFormat().resolvedOptions()
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...options, timeZone: 'Asia/Kolkata' })
  saved = null; fixture.billing.credits = false
  vi.stubGlobal('localStorage', {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { saved = value },
    removeItem: () => { saved = null },
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') throw new Error('This render test cannot make a purchase.')
    return Response.json(url.startsWith('/api/credits/ledger') ? { entries: [] } : { purchases: [] })
  }))
  container = document.getElementById('root') as HTMLElement; root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)) }) }
const render = async () => { await act(async () => root.render(createElement(CurrencyProvider, null, createElement(CreditsPage)))); await settle() }
const prices = () => Array.from(container.querySelectorAll('article .tabular-nums')).map(element => element.textContent)
const buttons = () => Array.from(container.querySelectorAll('article button')) as HTMLButtonElement[]

describe('Credits catalog country display', () => {
  it('shows all four packs in INR with dated reference-rate disclosure and disabled paid checkout', async () => {
    await render()
    expect(prices().sort()).toEqual(Object.values(CREDIT_PACKAGES).map(pack => displayUsd(pack.amountUsd, 'INR') + 'once').sort())
    expect(container.textContent).toContain('Approximate INR display using')
    expect(container.textContent).toContain(EXCHANGE_RATE_DATE)
    expect(container.textContent).toContain('Credit packs are charged in USD.')
    expect(container.textContent).not.toContain('Plan checkout is in INR.')
    expect(buttons()).toHaveLength(4)
    expect(buttons().every(button => button.disabled && button.textContent === 'Coming soon')).toBe(true)
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true)
  })
  it('keeps manual GBP and USD prices consistent in each pack and CTA without changing catalog amounts', async () => {
    saved = 'GBP'; fixture.billing.credits = true
    await render()
    expect(prices()).toEqual(['£37once', '£37once', '£37once', '£60once'])
    expect(buttons().map(button => button.textContent)).toEqual(['Buy for £37', 'Buy for £37', 'Buy for £37', 'Buy for £60'])
    expect(container.textContent).toContain('Approximate GBP display using')
    saved = 'USD'
    await act(async () => window.dispatchEvent(new Event('validore:currency-changed'))); await settle()
    expect(prices()).toEqual(['$49once', '$49once', '$49once', '$79once'])
    expect(buttons().map(button => button.textContent)).toEqual(['Buy for $49', 'Buy for $49', 'Buy for $49', 'Buy for $79'])
    expect(container.textContent).toContain('Credit packs are charged in USD.')
    expect(Object.values(CREDIT_PACKAGES).map(pack => pack.amountUsd)).toEqual([49, 49, 79, 49])
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true)
  })
})
