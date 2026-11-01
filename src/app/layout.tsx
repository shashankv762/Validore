import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Toaster } from 'sonner'
import { siteOrigin, siteDescription } from '@/lib/site'
import './globals.css'
import { CookieNotice } from '@/components/CookieNotice'

const geistSans = localFont({ src: '../../public/fonts/geist-latin.woff2', variable: '--font-geist-sans', display: 'swap', weight: '100 900' })
const geistMono = localFont({ src: '../../public/fonts/geist-mono-latin.woff2', variable: '--font-geist-mono', display: 'swap', weight: '100 900' })

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: 'Validore', template: '%s | Validore' },
  description: siteDescription,
  applicationName: 'Validore',
  openGraph: { title: "Validore — Know it's gold before you dig.", description: siteDescription, siteName: 'Validore', locale: 'en_US', type: 'website' },
  twitter: { card: 'summary_large_image', title: "Validore — Know it's gold before you dig.", description: siteDescription },
  icons: { icon: { url: '/logo/validore-favicon.svg', type: 'image/svg+xml' } },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <CookieNotice />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
