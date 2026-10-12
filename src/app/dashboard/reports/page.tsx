import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText, ArrowRight, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationJobs, validationReports } from '@/db/schema'
import { and, eq, desc, inArray } from 'drizzle-orm'
import RefreshReports from './RefreshReports'

export const metadata = { title: 'Your reports' }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect('/auth/signin')
  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) redirect('/dashboard')
  const params = await searchParams
  const requested = Number(params.page || 1)
  const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(1000, requested)) : 1
  const [reports, jobs] = await Promise.all([
    db.select({ id: validationReports.id, name: ideas.name, score: validationReports.overallScore,
      decision: validationReports.decision, status: validationReports.status, createdAt: validationReports.createdAt })
      .from(validationReports).innerJoin(ideas, eq(validationReports.ideaId, ideas.id))
      .where(eq(validationReports.userId, dbUser.id)).orderBy(desc(validationReports.createdAt)).limit(26).offset((page - 1) * 25),
    db.query.validationJobs.findMany({ where: and(eq(validationJobs.userId, dbUser.id), inArray(validationJobs.status, ['pending', 'running'])),
      orderBy: (table, { desc }) => [desc(table.createdAt)], limit: 10 }),
  ])
  return <div className="mx-auto max-w-5xl">
    <RefreshReports active={jobs.length > 0} />
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-light tracking-tight text-[#0A1628]">Your reports</h1>
        <p className="mt-2 max-w-xl text-sm text-[#1C1C1C]/75">Review your startup analyses and track work in progress.</p></div>
      <Link href="/dashboard" className="rounded-lg bg-[#0A1628] px-5 py-3 text-sm font-medium text-[#FAFAF7]">Validate an idea</Link>
    </div>
    {jobs.length > 0 && <section aria-label="Analyses in progress" className="card-angular mb-6 p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg text-[#0A1628]"><Clock size={18} aria-hidden="true" />Analyses in progress</h2>
      <ul className="space-y-3">{jobs.map(job => <li key={job.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E8E0D0] pt-3 text-sm">
        <span>{job.isLite ? 'Lite validation' : 'Full validation'}</span>
        <span className="text-[#1C1C1C]/75">{job.status === 'pending' ? 'Queued' : job.completedSections + ' of ' + job.totalSections + ' sections complete'}</span>
      </li>)}</ul>
      <p className="mt-4 text-xs text-[#1C1C1C]/75">This page updates while analyses are running. You can return at any time.</p>
    </section>}
    {reports.length === 0 ? <section className="card-angular flex flex-col items-center px-6 py-16 text-center">
      <FileText size={32} className="mb-5 text-[#B8963E]" aria-hidden="true" />
      <h2 className="text-xl text-[#0A1628]">{jobs.length ? 'Your analysis is on its way' : 'Start with your first idea'}</h2>
      <p className="mt-3 max-w-md text-sm text-[#1C1C1C]/75">{jobs.length ? 'Completed reports will appear here automatically.' : 'Describe your startup and get a structured report on the market, customers, risks and next steps.'}</p>
      {!jobs.length && <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-[#0A1628] underline underline-offset-4">Validate an idea<ArrowRight size={16} aria-hidden="true" /></Link>}
    </section> : <section aria-label="Completed analyses" className="card-angular overflow-hidden">
      <ul className="divide-y divide-[#E8E0D0]">{reports.slice(0, 25).map(report => <li key={report.id}>
        <Link href={'/dashboard/report/' + report.id} className="flex items-center justify-between gap-4 px-5 py-5 transition-colors hover:bg-[#F5F0E8] sm:px-6">
          <div className="min-w-0"><h2 className="truncate font-medium text-[#0A1628]">{report.name}</h2>
            <p className="mt-1 text-xs text-[#1C1C1C]/75">{report.createdAt ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(report.createdAt) : 'Date unavailable'}{report.status === 'partial' ? ' · Partial analysis' : ''}</p></div>
          <div className="flex shrink-0 items-center gap-4"><div className="text-right"><span className="text-lg font-medium tabular-nums text-[#0A1628]">{report.score ?? '—'}<span className="text-xs font-normal text-[#1C1C1C]/70"> / 100</span></span>
            <p className="text-xs text-[#1C1C1C]/75">{report.decision?.replaceAll('_', ' ') || 'Review findings'}</p></div><ArrowRight size={18} aria-hidden="true" className="text-[#B8963E]" /></div>
        </Link>
      </li>)}</ul>
    </section>}
    <nav aria-label="Report pages" className="mt-6 flex justify-between text-sm">
      {page > 1 ? <Link className="underline underline-offset-4" href={'/dashboard/reports?page=' + (page - 1)}>Newer reports</Link> : <span />}
      {reports.length > 25 && <Link className="underline underline-offset-4" href={'/dashboard/reports?page=' + (page + 1)}>Older reports</Link>}
    </nav>
  </div>
}
