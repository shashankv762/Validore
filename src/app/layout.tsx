import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { Toaster } from 'sonner'
import './globals.css'

const geistSans = localFont({ src: '../../public/fonts/geist-latin.woff2', variable: '--font-geist-sans', display: 'swap', weight: '100 900' })
const geistMono = localFont({ src: '../../public/fonts/geist-mono-latin.woff2', variable: '--font-geist-mono', display: 'swap', weight: '100 900' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://validore.tech'),
  title: { default: 'Validore', template: '%s | Validore' },
  description: 'AI-powered startup idea validation. Know it\'s gold before you dig.',
  icons: { icon: '/logo/validore-favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
