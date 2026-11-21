'use client'

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { DISPLAY_CURRENCIES, displayPlanPrice, displayUsd, EXCHANGE_RATE_DATE, EXCHANGE_RATE_SOURCE, exchangeRatesStale, hasReferenceRate, isDisplayCurrency, localeCurrency, type DisplayCurrency } from '@/lib/pricing-currency'
import { subscriptionCurrency, type MonthlyPlanPrice } from '@/lib/plans'

const STORAGE_KEY = 'validore:display-currency'
const CURRENCY_EVENT = 'validore:currency-changed'
let memoryPreference: DisplayCurrency | 'auto' = 'auto'
let memoryOnlyPreference = false
function preferenceSnapshot(): DisplayCurrency | 'auto' {
  if (memoryOnlyPreference) return memoryPreference
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    memoryPreference = isDisplayCurrency(saved) ? saved : 'auto'
    return memoryPreference
  } catch { return memoryPreference }
}
function subscribeCurrency(onChange: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    memoryOnlyPreference = false
    onChange()
  }
  window.addEventListener('storage', storage); window.addEventListener(CURRENCY_EVENT, onChange)
  return () => { window.removeEventListener('storage', storage); window.removeEventListener(CURRENCY_EVENT, onChange) }
}
function localeSnapshot() { return localeCurrency(navigator.languages ?? [navigator.language], Intl.DateTimeFormat().resolvedOptions().timeZone) }
type CurrencyContextValue = { currency: DisplayCurrency; preference: DisplayCurrency | 'auto'; setCurrency: (currency: DisplayCurrency | 'auto') => void }
const CurrencyContext = createContext<CurrencyContextValue | null>(null)
const defaultCurrency: CurrencyContextValue = { currency: 'USD', preference: 'auto', setCurrency: () => {} }
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const localCurrency = useSyncExternalStore(subscribeCurrency, localeSnapshot, () => 'USD' as DisplayCurrency)
  const preference = useSyncExternalStore(subscribeCurrency, preferenceSnapshot, () => 'auto' as const)
  const [edgeCurrency, setEdgeCurrency] = useState<DisplayCurrency | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/pricing/currency', { cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]) })
      .then(async response => {
        if (!response.ok) return
        const result = await response.json()
        if (!controller.signal.aborted && isDisplayCurrency(result?.currency)) setEdgeCurrency(result.currency)
      }).catch(() => {})
    return () => controller.abort()
  }, [])
  const currency = preference === 'auto' ? edgeCurrency ?? localCurrency : preference
  const setCurrency = (value: DisplayCurrency | 'auto') => {
    if (value !== 'auto' && !isDisplayCurrency(value)) return
    memoryPreference = value
    try {
      if (value === 'auto') localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, value)
      memoryOnlyPreference = false
    } catch { memoryOnlyPreference = true }
    window.dispatchEvent(new Event(CURRENCY_EVENT))
  }
  return <CurrencyContext.Provider value={{ currency, preference, setCurrency }}>{children}</CurrencyContext.Provider>
}
export function useCurrency() {
  const context = useContext(CurrencyContext) ?? defaultCurrency
  return { ...context, formatUsd: (amount: number) => displayUsd(amount, context.currency),
    formatPlanPrice: (plan: MonthlyPlanPrice) => displayPlanPrice(plan, context.currency) }
}
export function CurrencySelector() {
  const { currency, preference, setCurrency } = useCurrency()
  return <label className="inline-flex min-h-11 items-center gap-3 text-sm text-[#53616A]">Display currency<select aria-label="Display currency" value={preference} onChange={event => setCurrency(event.target.value as DisplayCurrency | 'auto')} className="min-h-11 rounded border border-[#D7DCE2] bg-white px-3 text-[#141923]"><option value="auto">Automatic ({currency})</option>{DISPLAY_CURRENCIES.map(code => <option key={code} value={code}>{code}</option>)}</select></label>
}
export function CurrencyDisclosure({ prices = 'plans' }: { prices?: 'plans' | 'credits' | 'both' }) {
  const { currency } = useCurrency()
  const showPlans = prices !== 'credits'
  const showCredits = prices !== 'plans'
  const estimate = currency !== 'USD' && hasReferenceRate(currency) && (showCredits || currency !== 'INR')
  return <p className="mt-3 max-w-[70ch] text-xs leading-relaxed text-[#53616A]">
    {showPlans && `Plan checkout is in ${subscriptionCurrency(currency)}. `}
    {showCredits && 'Credit packs are charged in USD. '}
    {estimate && <>Approximate {currency} {currency === 'INR' && showPlans ? 'credit pack prices' : 'display'} using <a className="underline underline-offset-4" href={EXCHANGE_RATE_SOURCE} target="_blank" rel="noopener noreferrer">ECB reference rates</a> from {EXCHANGE_RATE_DATE}.{exchangeRatesStale() && ' These reference rates are over seven days old.'} </>}
    Checkout confirms the charge and any applicable taxes.
  </p>
}
