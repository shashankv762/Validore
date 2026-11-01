import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import staticAssetsIncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache'

// Public pages are built once; account/API pages are dynamic. No ISR or R2
// bucket is required. Application research caches remain in Redis/PostgreSQL.
const config = defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})

// Avoid Turbopack's Windows-only traced junctions in the deployment artifact.
config.buildCommand = 'npm run build -- --webpack'
export default config
