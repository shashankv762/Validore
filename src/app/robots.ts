import type { MetadataRoute } from 'next'
import { siteOrigin } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  if (process.env.APP_ENV === 'preview') return { rules: { userAgent: '*', disallow: '/' } }
  return { rules: { userAgent: '*', allow: '/', disallow: ['/dashboard', '/auth', '/api/', '/share/'] }, sitemap: siteOrigin + '/sitemap.xml' }
}
