import type { MetadataRoute } from 'next'
import { siteOrigin } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/demo', '/legal/privacy', '/legal/terms', '/legal/cookies', '/legal/refund', '/legal/acceptable-use'].map(path => ({ url: siteOrigin + path, changeFrequency: 'monthly', priority: path === '' ? 1 : path === '/demo' ? .8 : .3 }))
}
