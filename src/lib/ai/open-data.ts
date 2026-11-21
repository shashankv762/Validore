import { readPublicWeb } from './public-web'
import { cacheSource, cachedSource } from './source-cache'
import type { SearchResult } from './search'
import { rememberPublicSources, readStoredPublicSource, readStoredMarketIndicator } from './research-store'
import { parseWorldBankAnnualWindow } from './world-bank'

export const OPEN_INDICATORS = {
  population: { id: 'SP.POP.TOTL', label: 'Population, total', unit: 'people' },
  gdp: { id: 'NY.GDP.MKTP.CD', label: 'GDP, current US dollars', unit: 'current US dollars' },
  internet: { id: 'IT.NET.USER.ZS', label: 'Individuals using the Internet', unit: '% of population' },
  gdpPerCapita: { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita', unit: 'current US dollars per person' },
  inflation: { id: 'FP.CPI.TOTL.ZG', label: 'Consumer price inflation', unit: 'annual % change in consumer prices' },
  gdpGrowth: { id: 'NY.GDP.MKTP.KD.ZG', label: 'Real GDP growth', unit: 'annual % change in real GDP' },
  urbanShare: { id: 'SP.URB.TOTL.IN.ZS', label: 'Urban population share', unit: '% of total population' },
  unemployment: { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment, modeled ILO estimate', unit: '% of total labor force (modeled ILO estimate)' },
} as const
export type OpenIndicator = keyof typeof OPEN_INDICATORS

// Older valid cache entries used these equivalent labels. Accept them only for
// the same indicator; never reinterpret a currency amount as a percentage.
const LEGACY_UNITS: Partial<Record<OpenIndicator, string>> = {
  gdp: 'current USD', gdpPerCapita: 'current USD per person', internet: 'percent of population',
  inflation: 'annual percent change', gdpGrowth: 'annual percent change', urbanShare: 'percent of population',
  unemployment: 'percent of total labor force',
}
export const isIndicatorUnit = (indicator: OpenIndicator, unit: unknown): boolean =>
  unit === OPEN_INDICATORS[indicator].unit || typeof unit === 'string' && unit === LEGACY_UNITS[indicator]

export async function readMarketIndicator(country: string, indicator: OpenIndicator, signal?: AbortSignal): Promise<{ source: SearchResult; cached: boolean }> {
  if (!/^(?:[A-Z]{2}|WLD)$/.test(country) || !Object.hasOwn(OPEN_INDICATORS, indicator)) throw new Error('Use a two-letter country code or WLD and a supported indicator')
  const definition = OPEN_INDICATORS[indicator]
  const end = new Date().getUTCFullYear()
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${definition.id}?format=json&date=${end - 8}:${end}&per_page=12`
  signal?.throwIfAborted()
  const withinDomain = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) &&
    (value >= 0 || ['inflation', 'gdpGrowth'].includes(indicator)) &&
    (!['internet', 'urbanShare', 'unemployment'].includes(indicator) || value <= 100) &&
    (indicator !== 'population' || Number.isSafeInteger(value))
  for (const load of [() => cachedSource(url), () => readStoredPublicSource(url), () => readStoredMarketIndicator(country, definition.id)]) {
    const existing = await load()
    if (!existing) continue
    let official = false
    try {
      const sourceUrl = new URL(existing.url)
      official = sourceUrl.protocol === 'https:' && sourceUrl.hostname === 'api.worldbank.org' &&
        !sourceUrl.username && !sourceUrl.password && (!sourceUrl.port || sourceUrl.port === '443') &&
        sourceUrl.pathname === `/v2/country/${country}/indicator/${definition.id}`
    } catch { /* A mismatched cache entry cannot establish an official observation. */ }
    const fetched = Date.parse(existing.fetchedAt)
    const period = existing.observationYear
    if (official && existing.retrievalKind === 'open-data' && existing.country === country && existing.indicator === definition.id &&
      isIndicatorUnit(indicator, existing.unit) && withinDomain(existing.value) && typeof period === 'number' && Number.isInteger(period) && period < end && period >= end - 8 &&
      existing.dataPeriod === String(period) && Number.isFinite(fetched) && fetched <= Date.now() && fetched >= Date.now() - 30 * 86_400_000 &&
      (!existing.expiresAt || Date.parse(existing.expiresAt) > Date.now())) return { source: existing, cached: true }
  }
  const response = await readPublicWeb(url, { signal, maxBytes: 100_000 })
  const finalUrl = new URL(response.url)
  if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== 'api.worldbank.org' || (finalUrl.port && finalUrl.port !== '443') ||
    finalUrl.pathname !== new URL(url).pathname) throw new Error('Dataset redirected outside the official source')
  const payload: unknown = JSON.parse(response.text)
  const window = parseWorldBankAnnualWindow(payload, { country, indicator: definition.id, now: Date.now(), pageSize: 12 })
  if (window.rows.some(row => row.value !== null && !withinDomain(row.value))) throw new Error('A World Bank observation is outside the indicator domain.')
  const rows = window.rows.filter(row => row.value !== null && row.year < end)
  const row = rows[0]
  if (!row) throw new Error('No published observation for this country and indicator')
  const source: SearchResult = {
    title: `World Bank: ${definition.label}, ${row.countryName} (${row.year})`, url,
    source: 'api.worldbank.org', fetchedAt: new Date().toISOString(), retrievalKind: 'open-data', dataPeriod: String(row.year),
    country, countryName: row.countryName, indicator: definition.id, value: row.value as number, observationScope: 'latest-available',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    unit: definition.unit, observationYear: row.year, metadataUpdatedAt: window.metadataUpdatedAt, datasetId: 'world-bank-wdi', licenseUrl: 'https://data.worldbank.org/summary-terms-of-use',
    content: `${definition.label}: ${row.value} ${definition.unit}. Country: ${row.countryName} (${country}). Observation year: ${row.year}. Latest non-null observation returned for ${end - 8}–${end}. ${rows[1] ? `Previous published observation: ${rows[1].value} (${rows[1].year}). ` : ''}Source: World Bank WDI API, indicator ${definition.id}; dataset revision ${window.metadataUpdatedAt}. This is a country-level indicator, not startup-specific TAM or proof of customer demand. Retrieval year, dataset revision and observation year are different; do not call lagged data a current measurement.`,
  }
  await cacheSource(source, 86_400)
  await rememberPublicSources([source])
  return { source, cached: false }
}
