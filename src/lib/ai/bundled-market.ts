import bundle from '@/data/market/bundle.json'
import { validMarketBundle } from './market-bundle.mjs'

// All bundled readers import one immutable publication. Inspection files are
// retained for operators but cannot mix generations inside a report.
const valid = validMarketBundle(bundle)
if (!valid) console.warn('[market-data] Bundled integrity check failed; only separately retrieved public evidence is available.')
export const MARKET_BUNDLE_VERSION = valid ? bundle.manifest.id : null
export const bundledObservations = valid ? bundle.observations : []
export const bundledTrends = valid ? bundle.trends : []
export const bundledCatalog = valid ? bundle.catalog : []
