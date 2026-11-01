import type { NextConfig } from 'next'
import { contentSecurityPolicy } from './src/lib/security-headers'

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // The HTML parser has optional CSS dependencies that are not used by research.
  // Let the Worker bundler resolve it instead of webpack's optional imports.
  serverExternalPackages: ['linkedom'],
  outputFileTracingIncludes: {
    '/api/export/*': ['./public/fonts/NotoSans-*.ttf', './public/logo/validore-report.png'],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
      ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }] : []),
    ] }]
  },
}
export default nextConfig
