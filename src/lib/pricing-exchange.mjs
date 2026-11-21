/** Shared by the browser display and the offline publisher refresh command. */
export const EXCHANGE_RATE_SOURCE = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml'
export const REFERENCE_CURRENCIES = Object.freeze(['EUR', 'USD', 'JPY', 'CZK', 'DKK', 'GBP', 'HUF', 'PLN', 'RON', 'SEK',
  'CHF', 'ISK', 'NOK', 'TRY', 'AUD', 'BRL', 'CAD', 'CNY', 'HKD', 'IDR', 'ILS', 'INR', 'KRW', 'MXN', 'MYR', 'NZD',
  'PHP', 'SGD', 'THB', 'ZAR'])

/** @param {unknown} value @param {Date} [now] */
export function validReferenceSnapshot(value, now = new Date()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const snapshot = /** @type {Record<string, unknown>} */ (value)
  if (snapshot.base !== 'EUR' || snapshot.source !== 'European Central Bank' || snapshot.sourceUrl !== EXCHANGE_RATE_SOURCE ||
    typeof snapshot.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.asOf)) return false
  const date = new Date(snapshot.asOf + 'T00:00:00Z')
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== snapshot.asOf || date > now) return false
  if (!snapshot.rates || typeof snapshot.rates !== 'object' || Array.isArray(snapshot.rates)) return false
  const rates = /** @type {Record<string, unknown>} */ (snapshot.rates)
  return rates.EUR === 1 && typeof rates.USD === 'number' && Number.isFinite(rates.USD) && rates.USD > 0 &&
    Object.entries(rates).every(([currency, rate]) => REFERENCE_CURRENCIES.includes(currency) &&
      typeof rate === 'number' && Number.isFinite(rate) && rate > 0)
}
