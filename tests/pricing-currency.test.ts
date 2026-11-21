import { afterEach, describe, expect, it, vi } from 'vitest'
import { convertUsd, currencyForCountry, displayPlanPrice, displayUsd, EXCHANGE_RATE_DATE, EXCHANGE_RATE_SOURCE, exchangeRatesStale, formatCurrencyAmount, isDisplayCurrency, localeCurrency, trustedCountry, validateExchangeRateSnapshot } from '@/lib/pricing-currency'
import { PLAN_CATALOG } from '@/lib/plans'

afterEach(() => vi.unstubAllEnvs())

describe('Indicative country currency display', () => {
  it('validates publisher identity, date, base and positive finite supported currency rates', () => {
    const valid = { source: 'European Central Bank', sourceUrl: EXCHANGE_RATE_SOURCE, asOf: '2026-11-13', base: 'EUR', rates: { EUR: 1, USD: 1.1052, INR: 104.1575 } }
    const now = new Date('2026-11-16T00:00:00Z')
    expect(validateExchangeRateSnapshot(valid, now)?.rates.INR).toBe(104.1575)
    for (const patch of [{ base: 'USD' }, { sourceUrl: 'https://untrusted.example/rates' }, { asOf: '2026-02-30' },
      { asOf: '2026-11-17' }, { rates: { EUR: 1, USD: 0 } }, { rates: { EUR: 1, USD: Infinity } },
      { rates: { EUR: 1, USD: 1, INR: -1 } }, { rates: { EUR: 1, USD: 1, XYZ: 2 } }]) {
      expect(validateExchangeRateSnapshot({ ...valid, ...patch }, now)).toBeNull()
    }
    const snapshotDate = new Date(EXCHANGE_RATE_DATE + 'T00:00:00Z')
    expect(exchangeRatesStale(new Date(snapshotDate.getTime() + 7 * 86_400_000))).toBe(false)
    expect(exchangeRatesStale(new Date(snapshotDate.getTime() + 8 * 86_400_000))).toBe(true)
  })
  it('selects INR for India and currencies for supported countries with an honest USD fallback', () => {
    expect(currencyForCountry('IN')).toBe('INR'); expect(currencyForCountry('gb')).toBe('GBP')
    expect(currencyForCountry('DE')).toBe('EUR'); expect(currencyForCountry('CA')).toBe('CAD')
    expect(currencyForCountry('XX')).toBe('USD')
    expect(localeCurrency(['en-IN'])).toBe('INR')
    expect(localeCurrency(['en'], 'Asia/Kolkata')).toBe('INR')
    expect(localeCurrency(['en-US'], 'Asia/Kolkata')).toBe('INR')
    expect(localeCurrency(['en-US'], 'Europe/London')).toBe('GBP')
    expect(localeCurrency(['en-US'], 'America/Toronto')).toBe('CAD')
    expect(localeCurrency(['en-US'], 'Australia/Sydney')).toBe('AUD')
    expect(localeCurrency(['malformed?'])).toBe('USD')
    expect(localeCurrency(['en-US'], 'constructor')).toBe('USD')
  })
  it('trusts country headers only behind the configured country-aware ingress', () => {
    expect(trustedCountry(new Headers({ 'cf-ipcountry': 'IN' }))).toBeNull()
    vi.stubEnv('TRUSTED_GEO_PROVIDER', 'cloudflare')
    expect(trustedCountry(new Headers({ 'cf-ipcountry': 'in' }))).toBe('IN')
    expect(trustedCountry(new Headers({ 'cf-ipcountry': 'XX' }))).toBeNull()
    vi.stubEnv('TRUSTED_GEO_PROVIDER', 'vercel')
    expect(trustedCountry(new Headers({ 'x-vercel-ip-country': 'IN' }))).toBeNull()
    vi.stubEnv('VERCEL', '1')
    expect(trustedCountry(new Headers({ 'x-vercel-ip-country': 'IN' }))).toBe('IN')
  })
  it('uses fixed subscription prices in USD and INR and reference rates for estimates', () => {
    expect(EXCHANGE_RATE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const { free, premium, max_premium: max } = PLAN_CATALOG
    expect([free, premium, max].map(plan => displayPlanPrice(plan, 'USD'))).toEqual(['$0', '$8', '$20'])
    expect([free, premium, max].map(plan => displayPlanPrice(plan, 'INR'))).toEqual(['₹0', '₹799', '₹1,999'])
    expect(displayPlanPrice(max, 'GBP')).toBe(formatCurrencyAmount(Math.round(convertUsd(20, 'GBP')), 'GBP'))
    expect(displayUsd(49, 'INR')).toBe(formatCurrencyAmount(Math.round(convertUsd(49, 'INR')), 'INR'))
    expect(formatCurrencyAmount(500, 'INR')).toBe('₹500') // Formatting never converts model inputs.
    expect(formatCurrencyAmount(500.4, 'JPY')).toBe('¥500') // Respect zero-minor-unit currencies.
    expect(isDisplayCurrency('constructor')).toBe(false)
  })
})
