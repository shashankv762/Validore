import exchangeRates from '@/data/pricing/exchange-rates.json'
import type { MonthlyPlanPrice } from './plans'
import { validReferenceSnapshot } from './pricing-exchange.mjs'
export { EXCHANGE_RATE_SOURCE } from './pricing-exchange.mjs'

export type DisplayCurrency = keyof typeof exchangeRates.rates
type ExchangeRateSnapshot = { asOf: string; rates: Partial<Record<DisplayCurrency, number>> }

/** Invalid/future snapshots cannot turn canonical USD amounts into misleading
 * local prices. A stale valid snapshot remains usable with an explicit notice. */
export function validateExchangeRateSnapshot(value: unknown, now = new Date()): ExchangeRateSnapshot | null {
  if (!validReferenceSnapshot(value, now)) return null
  const snapshot = value as ExchangeRateSnapshot
  return { asOf: snapshot.asOf, rates: snapshot.rates }
}
const snapshot = validateExchangeRateSnapshot(exchangeRates)
export const DISPLAY_CURRENCIES = [...new Set<DisplayCurrency>([...Object.keys(snapshot?.rates ?? {}) as DisplayCurrency[], 'USD', 'INR'])]
export const EXCHANGE_RATE_DATE = snapshot?.asOf ?? 'unavailable'
export function exchangeRatesStale(now = new Date()) {
  return !snapshot || now.getTime() - new Date(snapshot.asOf + 'T00:00:00Z').getTime() > 7 * 86_400_000
}
const countries: Record<string, DisplayCurrency> = {
  IN: 'INR', US: 'USD', GB: 'GBP', CA: 'CAD', AU: 'AUD', NZ: 'NZD', SG: 'SGD', JP: 'JPY', CN: 'CNY',
  HK: 'HKD', KR: 'KRW', BR: 'BRL', MX: 'MXN', ZA: 'ZAR', CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK',
  CZ: 'CZK', HU: 'HUF', PL: 'PLN', RO: 'RON', IS: 'ISK', TR: 'TRY', IL: 'ILS', ID: 'IDR', MY: 'MYR', PH: 'PHP', TH: 'THB',
  AT: 'EUR', BE: 'EUR', CY: 'EUR', DE: 'EUR', EE: 'EUR', ES: 'EUR', FI: 'EUR', FR: 'EUR', GR: 'EUR', HR: 'EUR',
  IE: 'EUR', IT: 'EUR', LT: 'EUR', LU: 'EUR', LV: 'EUR', MT: 'EUR', NL: 'EUR', PT: 'EUR', SI: 'EUR', SK: 'EUR', BG: 'EUR',
}
const timeZoneCountries: Record<string, string> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Europe/London': 'GB',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU', 'Australia/Hobart': 'AU',
  'Pacific/Auckland': 'NZ', 'Pacific/Chatham': 'NZ', 'Asia/Singapore': 'SG', 'Asia/Tokyo': 'JP', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Seoul': 'KR',
  'Europe/Zurich': 'CH', 'Europe/Oslo': 'NO', 'Europe/Stockholm': 'SE', 'Europe/Copenhagen': 'DK', 'Europe/Prague': 'CZ', 'Europe/Warsaw': 'PL',
  'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Atlantic/Reykjavik': 'IS', 'Europe/Istanbul': 'TR', 'Asia/Jerusalem': 'IL',
  'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Kuala_Lumpur': 'MY', 'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH', 'Africa/Johannesburg': 'ZA',
  'America/Sao_Paulo': 'BR', 'America/Manaus': 'BR', 'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Monterrey': 'MX',
  'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Rome': 'IT', 'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Dublin': 'IE',
  'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE', 'Europe/Vienna': 'AT', 'Europe/Athens': 'GR', 'Europe/Helsinki': 'FI', 'Europe/Sofia': 'BG',
}
export function isDisplayCurrency(value: unknown): value is DisplayCurrency {
  return typeof value === 'string' && DISPLAY_CURRENCIES.includes(value as DisplayCurrency)
}
export function currencyForCountry(country: string | null | undefined): DisplayCurrency {
  const currency = countries[country?.trim().toUpperCase() ?? '']
  return currency && isDisplayCurrency(currency) ? currency : 'USD'
}

/** Trust country headers only when a country-aware ingress is configured. */
export function trustedCountry(headers: Headers): string | null {
  const provider = process.env.TRUSTED_GEO_PROVIDER?.trim().toLowerCase()
  const header = provider === 'cloudflare' ? 'cf-ipcountry'
    : provider === 'vercel' && process.env.VERCEL === '1' ? 'x-vercel-ip-country' : null
  const country = header ? headers.get(header)?.trim().toUpperCase() : null
  return country && Object.hasOwn(countries, country) ? country : null
}


export function countryFromLocale(locales: readonly string[]): string | null {
  for (const locale of locales) {
    try { const region = new Intl.Locale(locale).region; if (region) return region } catch { /* Ignore malformed locales. */ }
  }
  return null
}
export function localeCurrency(locales: readonly string[], timeZone?: string): DisplayCurrency {
  // Prefer a recognized time zone; browsers often retain en-US abroad.
  const timeZoneCountry = Object.hasOwn(timeZoneCountries, timeZone ?? '') ? timeZoneCountries[timeZone ?? ''] : undefined
  if (timeZoneCountry) return currencyForCountry(timeZoneCountry)
  const country = countryFromLocale(locales)
  return country ? currencyForCountry(country) : 'USD'
}
export function formatCurrencyAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return '—'
  try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency,
    minimumFractionDigits: 0 }).format(amount) } catch { return '—' }
}
export function convertUsd(amount: number, currency: DisplayCurrency): number {
  const rate = snapshot?.rates[currency]
  return rate && snapshot?.rates.USD ? amount * rate / snapshot.rates.USD : amount
}
export function hasReferenceRate(currency: DisplayCurrency): boolean {
  return Boolean(snapshot?.rates.USD && Object.hasOwn(snapshot.rates, currency) && snapshot.rates[currency])
}
export function displayUsd(amount: number, currency: DisplayCurrency): string {
  if (currency === 'USD' || !hasReferenceRate(currency)) return formatCurrencyAmount(amount, 'USD')
  const converted = convertUsd(amount, currency)
  return formatCurrencyAmount(Math.round(converted), currency)
}
export function displayPlanPrice(plan: MonthlyPlanPrice, currency: DisplayCurrency): string {
  return currency === 'INR' ? formatCurrencyAmount(plan.monthlyPriceInr, 'INR') : displayUsd(plan.monthlyPriceUsd, currency)
}
