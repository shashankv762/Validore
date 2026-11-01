import { createHash } from 'node:crypto'
import type { SearchResult } from './search'
import catalog from '@/data/market/source-catalog.json'

type MarketMemory = {
  id: string
  title: string
  url: string
  topics: string[]
  geography: string
  regionTerms?: string[]
  kind: 'dataset' | 'historical'
  period: string
  publishedAt: string | null
  summary: string
  limitation: string
  refreshDays: number
}

const VERIFIED_AT = '2026-10-31T00:00:00.000Z'
// This Node-only library contains public research, never founder briefs or
// generated reports. Observation periods survive every reuse of a source.
const MEMORY: readonly MarketMemory[] = [
  {
    id: 'world-bank-wdi', title: 'World Bank World Development Indicators: dataset and metadata',
    url: 'https://datatopics.worldbank.org/world-development-indicators/',
    topics: ['world bank', 'wdi', 'gdp', 'population', 'internet adoption', 'macroeconomic', 'economic indicators'],
    geography: 'Global; individual economies and country groups', kind: 'dataset', period: 'Varies by indicator and economy', publishedAt: null,
    summary: 'WDI provides comparable development and economic indicators, downloadable data and metadata, and an indicators API. Data files are revised as the dataset is updated.',
    limitation: 'Fetch the indicator value, unit, reference year and country coverage before a numerical claim. GDP and population do not establish a startup-specific market size.', refreshDays: 90,
  },
  {
    id: 'enterprise-surveys', title: 'World Bank Enterprise Surveys: formal-business sampling',
    url: 'https://www.enterprisesurveys.org/en/methodology',
    topics: ['enterprise survey', 'business survey', 'formal firms', 'business environment', 'small business', 'sme', 'msme'],
    geography: 'Covered economies; eligible formal manufacturing and service sectors', kind: 'dataset', period: 'Survey-specific; check each economy and year', publishedAt: null,
    summary: 'Formal Enterprise Surveys interview owners or top managers of registered businesses with at least five workers and use sampling weights. Micro and informal surveys are separate.',
    limitation: 'Do not extend formal-firm estimates to all businesses. Check sector coverage, survey vintage, weights and methodology before country comparisons.', refreshDays: 90,
  },
  {
    id: 'rbi-dpi-history', title: 'RBI Digital Payments Index: March 2024 historical observation',
    url: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=58371',
    topics: ['digital payment', 'upi', 'fintech', 'rbi', 'payment adoption'], regionTerms: ['india', 'indian', 'rbi', 'upi'],
    geography: 'India', kind: 'historical', period: 'March 2024', publishedAt: '2024-07-26',
    summary: 'RBI reported a Digital Payments Index of 445.50 for March 2024, with March 2018 set to 100.',
    limitation: 'Historical context only. This is an index, not payment volume, revenue or TAM. Retrieve the latest RBI release for a current trend claim.', refreshDays: 90,
  },
  {
    id: 'india-msme-june-2026', title: 'India Udyam and UAP registrations: June 2026 snapshot',
    url: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2278107&lang=1&reg=1',
    topics: ['msme', 'sme', 'small business', 'udyam', 'micro enterprise'], regionTerms: ['india', 'indian', 'udyam'],
    geography: 'India; Udyam Registration Portal and Udyam Assist Platform combined', kind: 'historical', period: 'June 2026', publishedAt: '2026-06-26',
    summary: 'A Ministry of MSME backgrounder reported combined Udyam and UAP registrations exceeding 8.7 crore as of June 2026.',
    limitation: 'A registration count is not a count of active paying customers or a direct TAM. Recheck official definitions and the current dashboard; MSME thresholds changed on April 1, 2025.', refreshDays: 30,
  },
  {
    id: 'stanford-ai-index-2026', title: 'Stanford AI Index 2026: surveyed organizational adoption in 2025',
    url: 'https://hai.stanford.edu/ai-index/2026-ai-index-report/economy',
    topics: ['artificial intelligence', 'ai adoption', 'ai agent', 'generative ai', 'enterprise ai', 'ai software', 'ai saas'],
    geography: 'Organizations in the underlying global survey; not a population census', kind: 'historical', period: '2025 observations, reported in 2026', publishedAt: null,
    summary: 'The 2026 AI Index economy chapter reports that 88% of surveyed organizations used AI in 2025. The underlying adoption evidence is self-reported survey data.',
    limitation: 'Preserve the survey denominator and year. Do not treat this as Indian-business adoption or paying demand for a specific product. Agent adoption remains a separate question.', refreshDays: 90,
  },
  {
    id: 'us-census-cbp-2023', title: 'U.S. Census County Business Patterns: 2023 open dataset',
    url: 'https://api.census.gov/data/2023/cbp.html',
    topics: ['county business patterns', 'cbp', 'naics', 'establishment', 'business count', 'small business'],
    regionTerms: ['united states', 'usa', 'us', 'american', 'cbp', 'naics'],
    geography: 'United States; establishments with paid employees', kind: 'dataset', period: '2023 reference year; released June 2025', publishedAt: '2025-06-26',
    summary: 'County Business Patterns provides aggregate employer-establishment counts, employment and payroll by industry, geography and establishment size.',
    limitation: 'Keep the 2023 vintage. Check NAICS, suppressed cells and current methodology before estimating a segment. Establishments are not necessarily unique firms or paying customers. Census flags methodology guidance for revision.', refreshDays: 90,
  },
]

export const MARKET_MEMORY_VERSION = createHash('sha256').update(JSON.stringify([MEMORY, catalog])).digest('hex').slice(0, 12)

export function retrieveDatasetCatalog(query: string, now = Date.now()): SearchResult[] {
  const text = normalized(query)
  return catalog.map(entry => ({ entry, terms: [...new Set((entry.title + ' ' + entry.intendedUses.join(' ')).toLowerCase().match(/[a-z]{3,}/g) ?? [])] }))
    .filter(({ entry, terms }) => now >= Date.parse(entry.verifiedAt) && now < Date.parse(entry.verifiedAt) + 30 * 86_400_000 &&
      (entry.geography.length !== 1 || entry.geography[0] !== 'India' || /\b(india|indian|upi|rbi|msme|udyam)\b/i.test(query)) &&
      terms.filter(term => !['find', 'official', 'and', 'the', 'data', 'portal'].includes(term)).some(term => matches(text, term)))
    .slice(0, 4).map(({ entry }) => ({ title: entry.title, url: entry.url, source: new URL(entry.url).hostname,
      fetchedAt: entry.verifiedAt, retrievalKind: 'memory' as const, dataPeriod: 'Dataset directory; select the actual observation period', publishedAt: null,
      expiresAt: new Date(Date.parse(entry.verifiedAt) + 30 * 86_400_000).toISOString(),
      content: 'DATASET REFERENCE, not a numerical observation. Geography: ' + entry.geography.join(', ') + '. Use: ' + entry.intendedUses.join('; ') + '. Limitations: ' + entry.limitations + '. ' + entry.licenseNote,
    }))
}

const normalized = (value: string) => ' ' + value.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '
const matches = (query: string, phrase: string) => query.includes(normalized(phrase))

export function needsCurrentEvidence(query: string) {
  return /\b(current|latest|today|now|recent|news|trend\w*|pricing|price\w*|competitor\w*|market size)\b/i.test(query)
}

export function retrieveMarketMemory(query: string, options: { maxResults?: number; now?: number; currentOnly?: boolean } = {}): SearchResult[] {
  if (process.env.MARKET_MEMORY_ENABLED === 'false') return []
  const text = normalized(query.slice(0, 6000))
  const now = options.now ?? Date.now()
  const count = Math.max(0, Math.min(6, Math.floor(options.maxResults ?? 4)))
  const remembered: SearchResult[] = MEMORY.map(entry => ({ entry, score: entry.topics.reduce((sum, topic) => sum + (matches(text, topic) ? topic.split(' ').length : 0), 0) }))
    .filter(({ entry, score }) => score > 0 && now >= Date.parse(VERIFIED_AT) && now < Date.parse(VERIFIED_AT) + entry.refreshDays * 86_400_000 &&
      (!options.currentOnly || entry.kind !== 'historical') && (!entry.regionTerms || entry.regionTerms.some(term => matches(text, term))))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id)).slice(0, count)
    .map(({ entry }) => ({
      title: entry.title, url: entry.url, source: new URL(entry.url).hostname, fetchedAt: VERIFIED_AT,
      content: `${entry.kind === 'historical' ? 'HISTORICAL OBSERVATION' : 'DATASET REFERENCE'}. ${entry.summary} Geography: ${entry.geography}. Data period: ${entry.period}. Limitation: ${entry.limitation}`,
      retrievalKind: 'memory', publishedAt: entry.publishedAt, dataPeriod: entry.period,
      expiresAt: new Date(Date.parse(VERIFIED_AT) + entry.refreshDays * 86_400_000).toISOString(),
    }))
  return [...remembered, ...retrieveDatasetCatalog(query, now)].filter((source, index, all) => all.findIndex(item => item.url === source.url) === index).slice(0, count)
}
