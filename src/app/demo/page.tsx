import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Classroom sample', robots: { index: false, follow: false } }
const scores = [
  ['Problem', 13, 20], ['Customer', 12, 20], ['Market', 10, 15], ['Competition', 6, 10],
  ['Willingness to pay', 8, 15], ['Business model', 6, 10], ['Financial feasibility', 3, 5], ['Execution', 4, 5],
] as const

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF7] text-[#0A1628]">
      <a className="skip-link" href="#sample-report">Skip to sample report</a>
      <nav className="border-b border-[#E8E0D0] px-5 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3"><Image src="/logo/validore-icon.svg" width={32} height={32} alt="" /><span className="text-xl tracking-widest font-light">validore</span></Link>
        <Link href="/auth/signin" className="text-sm underline underline-offset-4">Open your account</Link>
      </nav>
      <div id="sample-report" className="max-w-5xl mx-auto px-5 py-10 sm:py-16 space-y-8">
        <div className="border border-[#C8A860] bg-[#F5F0E8] p-4 text-sm">
          <strong>Read-only classroom sample.</strong> The example and scores below are fictional. This page uses no account, database, AI provider, or paid service.
        </div>
        <header className="grid md:grid-cols-[1fr_auto] gap-6 items-end">
          <div><p className="text-xs uppercase tracking-widest text-[#96792b] mb-3">Sample validation report</p>
            <h1 className="text-4xl sm:text-5xl font-light">CampusBorrow</h1>
            <p className="mt-4 text-[#1C1C1C]/70 max-w-xl">A hypothetical marketplace where students lend rarely used equipment to classmates. The report illustrates how Validore separates assumptions from evidence.</p>
          </div>
          <div className="border-l-4 border-[#C8A860] pl-5"><p className="text-xs uppercase tracking-wider">Illustrative score</p><p className="text-5xl font-light mt-2">62<span className="text-xl text-[#1C1C1C]/60"> / 100</span></p><p className="mt-2 font-medium text-[#96792b]">MODIFY</p></div>
        </header>
        <section aria-labelledby="dimensions" className="border-t border-[#E8E0D0] pt-6">
          <h2 id="dimensions" className="text-xl font-medium mb-5">Weighted dimensions</h2>
          <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5">{scores.map(([name, score, weight]) => (
            <div key={name}><div className="flex justify-between gap-4 text-sm mb-2"><span>{name}</span><span>{score} / {weight}</span></div><div className="h-2 bg-[#E8E0D0]"><div className="h-full bg-[#C8A860]" style={{ width: (score / weight * 100) + '%' }} /></div></div>
          ))}</div>
        </section>
        <section className="grid md:grid-cols-2 gap-8 border-t border-[#E8E0D0] pt-6">
          <div><h2 className="text-xl font-medium mb-3">Assumptions to test</h2><ul className="list-disc pl-5 space-y-3 text-sm text-[#1C1C1C]/80"><li>Students need temporary access to equipment more often than they want to buy it.</li><li>Owners will lend items if deposits and damage handling are clear.</li><li>A campus pilot can achieve enough supply and demand in one place.</li></ul></div>
          <div><h2 className="text-xl font-medium mb-3">Decision rationale</h2><p className="text-sm leading-7 text-[#1C1C1C]/80">Narrow the first version to one campus and one equipment category. Test trust and repeat demand before building payments or expanding. No market statistics or customer interviews have been verified in this sample.</p></div>
        </section>
        <section className="border-t border-[#E8E0D0] pt-6"><h2 className="text-xl font-medium mb-3">Proposed next steps</h2><ol className="list-decimal pl-5 space-y-3 text-sm text-[#1C1C1C]/80"><li>Interview potential borrowers about the last time they needed equipment.</li><li>Run a small manual lending pilot and record completed loans, disputes, and repeat requests.</li><li>Use the results to revise the problem, customer, pricing, and execution assumptions.</li></ol></section>
        <div className="flex flex-wrap gap-4 pt-4"><Link href="/" className="px-5 py-3 bg-[#0A1628] text-white text-sm">Back to Validore</Link><Link href="/auth/signin" className="px-5 py-3 border border-[#E8E0D0] text-sm">Use the live application on localhost</Link></div>
      </div>
    </main>
  )
}
