import { createHash } from 'node:crypto'

const COUNTRIES = ['IN', 'US', 'GB', 'SG', 'BR', 'WLD']
const INDICATORS = ['SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'NY.GDP.PCAP.CD', 'IT.NET.USER.ZS',
  'FP.CPI.TOTL.ZG', 'NY.GDP.MKTP.KD.ZG', 'SP.URB.TOTL.IN.ZS', 'SL.UEM.TOTL.ZS']
const parts = ['observations', 'trends', 'metadata', 'catalog']
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value
export const marketDataHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const pair = value => value.country + '/' + value.indicator
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value))

/** All bundled readers share one complete revision. Date/domain checks remain
 * the responsibility of each evidence consumer after these integrity joins. */
export function createMarketBundle(data, createdAt = new Date().toISOString()) {
  if (!timestamp(createdAt) || parts.some(key => !Array.isArray(data?.[key]))) throw new Error('Invalid market bundle structure')
  const { observations, trends, metadata, catalog } = data
  const keys = COUNTRIES.flatMap(country => INDICATORS.map(indicator => country + '/' + indicator))
  for (const rows of [observations, trends]) {
    if (rows.length !== keys.length || new Set(rows.map(pair)).size !== keys.length || rows.some(row => !keys.includes(pair(row)))) {
      throw new Error('Market bundle has incomplete or duplicate country/indicator coverage')
    }
  }
  if (metadata.length !== INDICATORS.length || new Set(metadata.map(row => row.id)).size !== INDICATORS.length ||
      metadata.some(row => !INDICATORS.includes(row.id))) throw new Error('Market bundle metadata coverage does not match its indicators')
  if (catalog.length > 50 || new Set(catalog.map(row => row.id)).size !== catalog.length ||
      catalog.some(row => typeof row.id !== 'string' || row.recordType !== 'reference' || !timestamp(row.verifiedAt))) {
    throw new Error('Invalid market bundle source catalog')
  }
  for (const row of observations) {
    const trend = trends.find(item => pair(item) === pair(row))
    const definition = metadata.find(item => item.id === row.indicator)
    if (!timestamp(row.fetchedAt) || !timestamp(row.expiresAt) || !timestamp(trend.fetchedAt) || !Array.isArray(trend.observations) ||
        trend.observations.length < 2 || trend.observations.length > 8 || !Number.isFinite(row.value) ||
        !Number.isInteger(row.observationYear) || row.dataPeriod !== String(row.observationYear) ||
        row.unit !== trend.unit || row.unit !== definition.unit || row.metadataUpdatedAt !== trend.metadataUpdatedAt ||
        row.fetchedAt !== trend.fetchedAt || trend.observations.some(point => !Number.isInteger(point.year) || !Number.isFinite(point.value)) ||
        new Set(trend.observations.map(point => point.year)).size !== trend.observations.length) {
      throw new Error('Market bundle contains inconsistent observation/trend metadata')
    }
    const latest = trend.observations.reduce((a, b) => a.year > b.year ? a : b)
    if (latest.year !== row.observationYear || latest.value !== row.value) throw new Error('Market bundle latest value does not match its trend series')
  }
  const payload = Object.fromEntries(parts.map(key => [key, data[key]]))
  const checksums = Object.fromEntries(parts.map(key => [key, marketDataHash(data[key])]))
  const years = [...new Set(trends.flatMap(row => row.observations.map(point => point.year)))].sort((a, b) => a - b)
  const fetched = observations.map(row => row.fetchedAt).sort()
  return { manifest: { version: 1, id: marketDataHash(payload), createdAt, checksums,
    counts: { observations: observations.length, trends: trends.length, trendValues: trends.reduce((sum, row) => sum + row.observations.length, 0), metadata: metadata.length, catalog: catalog.length },
    observationYears: years, retrievedFrom: fetched[0], retrievedThrough: fetched.at(-1) }, ...payload }
}

export function validMarketBundle(value) {
  try {
    if (value?.manifest?.version !== 1) return false
    return marketDataHash(createMarketBundle(value, value.manifest.createdAt).manifest) === marketDataHash(value.manifest)
  } catch { return false }
}
