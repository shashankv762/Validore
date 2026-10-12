'use client'
import Link from 'next/link'

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="card-angular mx-auto max-w-xl p-8" role="alert">
    <h1 className="text-2xl font-light text-[#0A1628]">Your workspace could not load</h1>
    <p className="mt-3 text-sm text-[#1C1C1C]/75">Try loading it again. If the issue continues, return to your workspace and try another page.</p>
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button type="button" onClick={reset} className="rounded-lg bg-[#0A1628] px-5 py-3 text-sm text-[#FAFAF7]">Try again</button>
      <Link href="/dashboard" className="text-sm underline underline-offset-4">Return to workspace</Link>
    </div>
  </section>
}
