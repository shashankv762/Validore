import Link from 'next/link'
import { Brand } from '@/components/Brand'

export default function NotFound() {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-[#FAFAF7] px-6 py-16 text-center"><Brand /><p className="text-sm text-[#77602F]">404 / Page not found</p><h1 className="max-w-lg text-4xl font-medium tracking-tight text-[#0A1628]">Let&apos;s find your next step.</h1><p className="max-w-md text-sm leading-7 text-[#626B73]">This page may have moved, or the link may be incomplete. Return home or open your workspace to continue.</p><div className="flex flex-wrap justify-center gap-3"><Link href="/" className="button button-navy">Back to home</Link><Link href="/dashboard" className="button button-outline">Open workspace</Link></div></main>
}
