import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { parseHTML } from 'linkedom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrencyDisclosure, CurrencyProvider, CurrencySelector, useCurrency } from '@/components/CurrencyProvider'
import { displayUsd } from '@/lib/pricing-currency'
import { PLAN_CATALOG } from '@/lib/plans'

let root: Root
let container: HTMLElement
let saved: string | null
let rejectWrites: boolean
let edgeCurrency: string | null
function CurrencyControls() {
  const { currency, setCurrency, formatPlanPrice } = useCurrency()
  return createElement('div', null,
    createElement('p', { id: 'currency' }, currency),
    createElement('p', { id: 'price' }, formatPlanPrice(PLAN_CATALOG.premium)),
    createElement(CurrencySelector),
    createElement(CurrencyDisclosure),
    createElement('button', { id: 'gbp', onClick: () => setCurrency('GBP') }, 'GBP'),
    createElement('button', { id: 'auto', onClick: () => setCurrency('auto') }, 'Automatic'))
}
beforeEach(() => {
  const { window, document } = parseHTML('<html><body><div id="root"></div></body></html>')
  vi.stubGlobal('window', window); vi.stubGlobal('document', document); vi.stubGlobal('self', window)
  vi.stubGlobal('Event', window.Event); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('navigator', { languages: ['en-US'], language: 'en-US' })
  const options = new Intl.DateTimeFormat().resolvedOptions()
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...options, timeZone: 'Asia/Kolkata' })
  saved = null; rejectWrites = false; edgeCurrency = null
  vi.stubGlobal('localStorage', {
    getItem: () => saved,
    setItem: (_key: string, value: string) => { if (rejectWrites) throw new Error('Storage quota exceeded'); saved = value },
    removeItem: () => { if (rejectWrites) throw new Error('Storage is read only'); saved = null },
  })
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ currency: edgeCurrency })))
  container = document.getElementById('root') as HTMLElement; root = createRoot(container)
})
afterEach(async () => {
  rejectWrites = false
  if (container.querySelector('#auto')) await click('auto')
  await act(async () => root.unmount())
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})
const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)) }) }
const render = async () => { await act(async () => root.render(createElement(CurrencyProvider, null, createElement(CurrencyControls)))); await settle() }
const click = async (id: string) => { await act(async () => container.querySelector('#' + id)!.dispatchEvent(new Event('click', { bubbles: true }))); await settle() }
const currency = () => container.querySelector('#currency')!.textContent

describe('Browser-localized currency preferences', () => {
  it('uses the browser fallback and preserves manual currency selection', async () => {
    await render()
    expect(currency()).toBe('INR'); expect(container.querySelector('#price')!.textContent).toBe('₹799')
    expect(container.textContent).toContain('Plan checkout is in INR.')
    expect(container.textContent).not.toContain('Approximate INR')
    await click('gbp')
    expect(currency()).toBe('GBP'); expect(saved).toBe('GBP')
    expect(container.querySelector('#price')!.textContent).toBe(displayUsd(8, 'GBP'))
    expect(container.textContent).toContain('Plan checkout is in USD.')
    await click('auto'); expect(currency()).toBe('INR'); expect(saved).toBeNull()
    expect(fetch).toHaveBeenCalledWith('/api/pricing/currency', expect.objectContaining({ cache: 'no-store' }))
  })
  it('keeps manual selection working when readable storage rejects writes', async () => {
    saved = 'USD'; await render(); expect(currency()).toBe('USD')
    rejectWrites = true
    await click('gbp'); expect(currency()).toBe('GBP'); expect(saved).toBe('USD')
    await click('auto'); expect(currency()).toBe('INR'); expect(saved).toBe('USD')
  })
  it('uses a trusted country result over a different browser time zone', async () => {
    edgeCurrency = 'INR'
    vi.mocked(Intl.DateTimeFormat.prototype.resolvedOptions).mockReturnValue({
      ...Intl.DateTimeFormat.prototype.resolvedOptions.call(new Intl.DateTimeFormat()), timeZone: 'America/Los_Angeles',
    })
    await render()
    expect(currency()).toBe('INR')
  })
})
