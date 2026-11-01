'use client'
import Link from 'next/link'
import { Brand } from '@/components/Brand'

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-[#FAFAF7] px-6 py-16 text-center"><Brand /><div role="alert"><h1 className="text-3xl font-medium tracking-tight text-[#0A1628]">This page couldn&apos;t load.</h1><p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#626B73]">Try loading it again. Your saved ideas and reports will be available when the connection is restored.</p></div><div className="flex flex-wrap justify-center gap-3"><button type="button" onClick={retry} className="button button-navy">Try again</button><Link href="/" className="button button-outline">Back to home</Link></div></main>
}
