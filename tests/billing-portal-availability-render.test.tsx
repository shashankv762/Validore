import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ portal: false, tier: 'premium' as 'premium' | 'free' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: {} }) }))
vi.mock('@/components/AccountProvider', () => ({ useAccount: () => ({ data: {
  user: { id: 'subscriber', email: 'subscriber@example.test', tier: state.tier, unlimited: false, isAdmin: false,
    accountStatus: 'active', subscriptionStatus: state.tier === 'premium' ? 'active' : null, manualPlan: false, cancelAtPeriodEnd: false,
    creditBalance: 0, purchasedCredits: 0, rewardCredits: 0, crowdfundingCredits: 0, pitchDeckCredits: 0,
    validationsThisMonth: 0, creditResetAt: null, currentPeriodEnd: '2026-12-01T00:00:00.000Z', emailVerified: true,
    preferredAiProvider: 'free_models', hasCustomApiKey: false, isFoundingMember: false, createdAt: null },
  billing: { credits: false, premium: false, maxPremium: false, premiumInr: true, maxPremiumInr: false, portal: state.portal },
  ai: { freeOnly: true, researchTools: true },
}, loading: false, error: null, refresh: vi.fn() }), notifyAccountUpdated: vi.fn() }))
vi.mock('@/components/PrivacyControls', () => ({ PrivacyControls: () => null }))

import SettingsPage from '@/app/dashboard/settings/page'
import { CurrencyProvider } from '@/components/CurrencyProvider'

let root: Root
let container: HTMLElement
beforeEach(() => {
  state.tier = 'premium'
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  container = document.getElementById('root') as HTMLElement
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})
async function manageBillingDisabled() {
  await act(async () => root.render(createElement(SettingsPage)))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) })
  const button = [...container.querySelectorAll('button')].find(item => item.textContent?.includes('Manage Billing'))
  expect(button).toBeDefined()
  return button!.disabled
}

describe('subscriber portal availability in settings', () => {
  it('retains the portal action while sales remain frozen when restricted servicing is available', async () => {
    state.portal = true
    expect(await manageBillingDisabled()).toBe(false)
  })
  it('disables the portal action when neither sales nor restricted servicing is available', async () => {
    state.portal = false
    expect(await manageBillingDisabled()).toBe(true)
  })
})

it('shows and submits the matching INR offer and keeps unavailable currencies disabled', async () => {
  state.tier = 'free'
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
  let preference = 'INR'
  vi.stubGlobal('localStorage', { getItem: () => preference })
  const request = vi.fn(async (url: string) => url === '/api/pricing/currency' ? Response.json({ currency: null }) : Response.json({ error: 'Test stops before redirect' }, { status: 503 }))
  vi.stubGlobal('fetch', request)
  await act(async () => root.render(createElement(CurrencyProvider, null, createElement(SettingsPage))))
  const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent?.includes(text))
  expect(button('Upgrade to Premium (₹799/mo)')?.disabled).toBe(false)
  expect(button('Max Premium is currently unavailable')?.disabled).toBe(true)
  expect(container.textContent).toContain('Max Premium (₹1,999/mo)')
  await act(async () => button('Upgrade to Premium')!.dispatchEvent(new Event('click', { bubbles: true })))
  expect(request).toHaveBeenCalledWith('/api/billing/checkout', expect.objectContaining({ method: 'POST', body: JSON.stringify({ tier: 'premium', currency: 'INR' }) }))
  preference = 'USD'
  await act(async () => window.dispatchEvent(new Event('validore:currency-changed')))
  expect(container.textContent).toContain('Premium ($8/mo)')
  expect(container.textContent).toContain('Max Premium ($20/mo)')
  expect(button('Premium is currently unavailable')?.disabled).toBe(true)
})
