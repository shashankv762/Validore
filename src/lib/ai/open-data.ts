import { readPublicWeb } from './public-web'
import { cacheSource, cachedSource } from './source-cache'
import type { SearchResult } from './search'
import { rememberPublicSources, readStoredPublicSource, readStoredMarketIndicator } from './research-store'

export const OPEN_INDICATORS = {
  population: { id: 'SP.POP.TOTL', label: 'Population, total', unit: 'people' },
  gdp: { id: 'NY.GDP.MKTP.CD', label: 'GDP, current US dollars', unit: 'current USD' },
  internet: { id: 'IT.NET.USER.ZS', label: 'Individuals using the Internet', unit: 'percent of population' },
  gdpPerCapita: { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita', unit: 'current USD per person' },
  inflation: { id: 'FP.CPI.TOTL.ZG', label: 'Consumer price inflation', unit: 'annual percent change' },
  gdpGrowth: { id: 'NY.GDP.MKTP.KD.ZG', label: 'Real GDP growth', unit: 'annual percent change' },
  urbanShare: { id: 'SP.URB.TOTL.IN.ZS', label: 'Urban population share', unit: 'percent of population' },
  unemployment: { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment, modeled ILO estimate', unit: 'percent of total labor force' },
} as const
export type OpenIndicator = keyof typeof OPEN_INDICATORS

export async function readMarketIndicator(country: string, indicator: OpenIndicator, signal?: AbortSignal): Promise<{ source: SearchResult; cached: boolean }> {
  if (!/^(?:[A-Z]{2}|WLD)$/.test(country) || !Object.hasOwn(OPEN_INDICATORS, indicator)) throw new Error('Use a two-letter country code or WLD and a supported indicator')
  const definition = OPEN_INDICATORS[indicator]
  const end = new Date().getUTCFullYear()
  const url = `https://api.worldbank.org/v2/country/${country}/indicator/${definition.id}?format=json&date=${end - 8}:${end}&per_page=12`
  signal?.throwIfAborted()
  const existing = await cachedSource(url) ?? await readStoredPublicSource(url) ?? await readStoredMarketIndicator(country, definition.id)
  if (existing) return { source: existing, cached: true }
  const response = await readPublicWeb(url, { signal, maxBytes: 100_000 })
  const finalUrl = new URL(response.url)
  if (finalUrl.protocol !== 'https:' || finalUrl.hostname !== 'api.worldbank.org' || (finalUrl.port && finalUrl.port !== '443')) throw new Error('Dataset redirected outside the official source')
  const payload: unknown = JSON.parse(response.text)
  if (!Array.isArray(payload) || !Array.isArray(payload[1])) throw new Error('Dataset unavailable')
  const rows = (payload[1] as { value?: unknown; date?: string; country?: { id?: string; value?: string }; countryiso3code?: string; indicator?: { id?: string } }[])
    .filter(row => typeof row.value === 'number' && Number.isFinite(row.value) && (row.value >= 0 || ['inflation', 'gdpGrowth'].includes(indicator)) &&
      (!['internet', 'urbanShare', 'unemployment'].includes(indicator) || row.value <= 100) &&
      /^\d{4}$/.test(row.date ?? '') && Number(row.date) <= end && Number(row.date) >= end - 8 &&
      (row.country?.id === country || (country === 'WLD' && row.countryiso3code === 'WLD')) && row.indicator?.id === definition.id)
    .sort((a, b) => Number(b.date) - Number(a.date))
  const row = rows[0]
  if (!row) throw new Error('No published observation for this country and indicator')
  const source: SearchResult = {
    title: `World Bank: ${definition.label}, ${row.country?.value || country} (${row.date})`, url,
    source: 'api.worldbank.org', fetchedAt: new Date().toISOString(), retrievalKind: 'open-data', dataPeriod: row.date,
    country, countryName: row.country?.value || country, indicator: definition.id, value: row.value as number,
    unit: definition.unit, observationYear: Number(row.date), datasetId: 'world-bank-wdi', licenseUrl: 'https://data.worldbank.org/summary-terms-of-use',
    content: `${definition.label}: ${row.value} ${definition.unit}. Country: ${row.country?.value || country} (${country}). Observation year: ${row.date}. Latest non-null observation returned for ${end - 8}–${end}. ${rows[1] ? `Previous published observation: ${rows[1].value} (${rows[1].date}). ` : ''}Source: World Bank WDI API, indicator ${definition.id}. This is a country-level indicator, not startup-specific TAM or proof of customer demand. Retrieval year and observation year are different; do not call lagged data a current measurement.`,
  }
  await cacheSource(source, 86_400)
  await rememberPublicSources([source])
  return { source, cached: false }
}
