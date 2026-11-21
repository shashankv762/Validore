import { z } from 'zod'
import { bundledTrends as bundled, MARKET_BUNDLE_VERSION } from './bundled-market'
import { publicWebUrl, readPublicWeb } from './public-web'
import { OPEN_INDICATORS, isIndicatorUnit, type OpenIndicator } from './open-data'
import { cachedSource, cacheSource } from './source-cache'
import type { SearchResult } from './search'
import { parseWorldBankAnnualWindow, validWorldBankRevision } from './world-bank'

const Series = z.object({ country: z.string().regex(/^(?:[A-Z]{2}|WLD)$/), countryName: z.string(), indicator: z.string(), title: z.string(), unit: z.string(),
  observations: z.array(z.object({ year: z.number().int().min(1900), value: z.number().finite() })).min(2).max(8),
  fetchedAt: z.string(), expiresAt: z.string(), metadataUpdatedAt: z.string(), sourceUrl: z.string().url(), limitation: z.string(),
})
export type MarketTrendSeries = z.infer<typeof Series>
const rateIndicators: OpenIndicator[] = ['internet', 'inflation', 'gdpGrowth', 'urbanShare', 'unemployment']

export function summarizeMarketTrend(series: MarketTrendSeries, indicator: OpenIndicator) {
  const points = series.observations.slice().sort((a, b) => a.year - b.year)
  const latest = points.at(-1)!
  const previous = points.find(point => point.year === latest.year - 1) ?? null
  const absoluteChange = previous ? latest.value - previous.value : null
  const percentagePointChange = rateIndicators.includes(indicator) ? absoluteChange : null
  const relativeChangePercent = previous && previous.value > 0 && !rateIndicators.includes(indicator) ? (latest.value / previous.value - 1) * 100 : null
  return { latest, previous, observations: points, unit: series.unit, absoluteChange, percentagePointChange, relativeChangePercent,
    note: 'Historical annual observations only. Percentage-point changes compare rates; relative changes compare amounts. Missing years are not interpolated. Economy-wide context does not establish category demand, startup TAM or future growth.' }
}

function validSeries(value: unknown, country: string, indicator: OpenIndicator, now: number): MarketTrendSeries | null {
  const parsed = Series.safeParse(value)
  if (!parsed.success) return null
  const series = parsed.data
  const fetched = Date.parse(series.fetchedAt); const expires = Date.parse(series.expiresAt)
  let url: URL
  try { url = publicWebUrl(series.sourceUrl) } catch { return null }
  const selectedCountryPath = '/v2/country/' + country + '/indicator/' + series.indicator
  const boundedDatasetPath = '/v2/country/all/indicator/' + series.indicator
  const archivePath = '/v2/en/indicator/' + series.indicator
  const knownPath = url.pathname === selectedCountryPath || url.pathname === boundedDatasetPath && url.searchParams.get('format') === 'json' ||
    url.pathname === archivePath && url.searchParams.get('downloadformat') === 'csv'
  if (series.country !== country || series.indicator !== OPEN_INDICATORS[indicator].id || !isIndicatorUnit(indicator, series.unit) ||
    !validWorldBankRevision(series.metadataUpdatedAt, fetched) || url.protocol !== 'https:' || url.hostname !== 'api.worldbank.org' ||
    !knownPath || !Number.isFinite(fetched) || fetched > now || fetched < now - 30 * 86_400_000 ||
    !Number.isFinite(expires) || expires <= now || expires > fetched + 30 * 86_400_000) return null
  const years = new Set<number>()
  for (const point of series.observations) {
    if (point.year >= new Date(now).getUTCFullYear() || years.has(point.year) || indicator === 'population' && !Number.isInteger(point.value) || point.value < 0 && !['inflation', 'gdpGrowth'].includes(indicator) ||
      rateIndicators.includes(indicator) && !['inflation', 'gdpGrowth'].includes(indicator) && point.value > 100) return null
    years.add(point.year)
  }
  return series
}

function sourceFor(series: MarketTrendSeries, indicator: OpenIndicator): SearchResult {
  const trend = summarizeMarketTrend(series, indicator)
  const canonicalUrl = 'https://api.worldbank.org/v2/country/' + series.country + '/indicator/' + series.indicator + '?format=json&per_page=8'
  return { title: series.countryName + ': ' + series.title + ' (' + trend.observations[0].year + '–' + trend.latest.year + ')', url: canonicalUrl, retrievalUrl: series.sourceUrl,
    source: 'api.worldbank.org', fetchedAt: series.fetchedAt, expiresAt: series.expiresAt, retrievalKind: 'open-data',
    country: series.country, countryName: series.countryName, indicator: series.indicator, value: trend.latest.value, unit: series.unit,
    observationYear: trend.latest.year, dataPeriod: String(trend.latest.year), metadataUpdatedAt: series.metadataUpdatedAt, datasetId: 'world-bank-wdi-trend',
    content: JSON.stringify({ kind: 'annual_market_trend', title: series.title, country: series.country, ...trend, limitation: series.limitation,
      fetchedAt: series.fetchedAt, metadataUpdatedAt: series.metadataUpdatedAt, retrievalUrl: series.sourceUrl,
      instruction: 'Values were selected from the retrieved official dataset at retrievalUrl; the source link selects this country and indicator. Preserve observation years and units. A retrieval date is not the observation or publication date.' }),
    licenseUrl: 'https://data.worldbank.org/summary-terms-of-use' }
}

export async function readMarketTrend(country: string, indicator: OpenIndicator, signal?: AbortSignal) {
  signal?.throwIfAborted()
  if (!/^(?:[A-Z]{2}|WLD)$/.test(country) || !Object.hasOwn(OPEN_INDICATORS, indicator)) throw new Error('Use a two-letter country code or WLD and a supported indicator.')
  const now = Date.now(); const definition = OPEN_INDICATORS[indicator]
  const url = 'https://api.worldbank.org/v2/country/' + country + '/indicator/' + definition.id + '?format=json&per_page=8'
  const series = (bundled as unknown[]).map(value => validSeries(value, country, indicator, now)).find(value => value !== null)
  if (series) return { source: { ...sourceFor(series, indicator), ...(MARKET_BUNDLE_VERSION ? { dataBundleVersion: MARKET_BUNDLE_VERSION } : {}) }, trend: summarizeMarketTrend(series, indicator), cached: true }
  const cached = await cachedSource(url)
  if (cached) {
    try {
      const data = JSON.parse(cached.content)
      const candidate = data.kind === 'annual_market_trend' ? validSeries({ ...data, country: cached.country, countryName: cached.countryName,
        indicator: cached.indicator, sourceUrl: cached.retrievalUrl ?? data.retrievalUrl ?? cached.url, expiresAt: cached.expiresAt }, country, indicator, now) : null
      if (candidate) return { source: sourceFor(candidate, indicator), trend: summarizeMarketTrend(candidate, indicator), cached: true }
    } catch { /* Other evidence using this URL is not a complete trend series. */ }
  }
  const page = await readPublicWeb(url, { signal, maxBytes: 100_000 })
  const final = publicWebUrl(page.url)
  if (final.protocol !== 'https:' || final.hostname !== 'api.worldbank.org' || final.pathname !== new URL(url).pathname) throw new Error('Trend data redirected outside the expected official source.')
  const payload = JSON.parse(page.text)
  const { rows, metadataUpdatedAt } = parseWorldBankAnnualWindow(payload, { country, indicator: definition.id, now, pageSize: 8, latestPage: true })
  const year = new Date(now).getUTCFullYear()
  const points: { year: number; value: number }[] = []
  for (const row of rows) {
    if (row.value === null || row.year === year) continue
    points.push({ year: row.year, value: row.value })
  }
  const fetchedAt = new Date().toISOString()
  const candidate = validSeries({ country, countryName: rows[0].countryName, indicator: definition.id, title: definition.label, unit: definition.unit,
    observations: points, fetchedAt, expiresAt: new Date(Date.parse(fetchedAt) + 30 * 86_400_000).toISOString(), metadataUpdatedAt, sourceUrl: page.url,
    limitation: 'Annual country-level WDI series, with indicator-specific definitions and possible revisions; this is contextual scale, not a verified startup market.' }, country, indicator, Date.now())
  if (!candidate) throw new Error('The trend series is incomplete or outside the indicator domain.')
  const source = sourceFor(candidate, indicator)
  await cacheSource(source, 86_400)
  return { source, trend: summarizeMarketTrend(candidate, indicator), cached: false }
}
