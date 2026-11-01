'use client'
import Link from 'next/link'

export default function DashboardError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <section className="card-angular mx-auto max-w-xl p-8" role="alert">
    <h1 className="text-2xl font-light text-[#141923]">Your workspace could not load</h1>
    <p className="mt-3 text-sm text-[#364152]/75">Try loading it again. If the issue continues, return to your workspace and try another page.</p>
    <div className="mt-6 flex flex-wrap items-center gap-4">
      <button type="button" onClick={retry} className="button button-navy">Try again</button>
      <Link href="/dashboard" className="text-sm underline underline-offset-4">Return to workspace</Link>
    </div>
  </section>
}
