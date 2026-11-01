import Link from 'next/link'
import { redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { BarChart3, Users, ScanSearch, Calculator, ShieldCheck, Network, ArrowRight, Search, BookOpen, FileCheck2, Layers, TrendingUp } from 'lucide-react'
import { db } from '@/db'
import { users, validationReports, ideas } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { AgentActivity } from '@/components/AgentActivity'
import { ReportTemplateDownloads } from '@/components/ReportTemplateDownloads'

export const metadata = { title: 'Research team' }
const specialists = [
  { name: 'Market analyst', icon: BarChart3, scope: 'Lite & full', work: 'Sizes the opportunity, explores market conditions, and identifies what the available sources can support.', tools: 'Search · Read sources · Calculate' },
  { name: 'Customer researcher', icon: Users, scope: 'Lite & full', work: 'Examines the customer, the problem, and willingness to pay. Turns assumptions into interview questions.', tools: 'Search · Read sources · Review evidence' },
  { name: 'Competition analyst', icon: ScanSearch, scope: 'Full', work: 'Finds alternatives, compares positioning, and checks pricing claims against available evidence.', tools: 'Search · Read sources · Calculate' },
  { name: 'Financial analyst', icon: Calculator, scope: 'Full', work: 'Builds explicit assumptions and tests unit economics with deterministic calculations.', tools: 'Calculate · Financial scenarios · Sources' },
  { name: 'Risk reviewer', icon: ShieldCheck, scope: 'Full', work: 'Challenges the plan, prioritizes risks, and proposes practical experiments to reduce uncertainty.', tools: 'Review evidence · Search · Financial checks' },
  { name: 'Source reviewer', icon: FileCheck2, scope: 'Full', work: 'Reads important original sources and checks whether their claims, dates, and customer segments support the report.', tools: 'Read pages · Source coverage · Evidence gaps' },
  { name: 'Product strategist', icon: Layers, scope: 'Full', work: 'Shapes a focused MVP, compares feature priorities, and drafts a clear value proposition and proposed landing page.', tools: 'Priority ranking · Sources · Survey planning' },
  { name: 'Growth planner', icon: TrendingUp, scope: 'Full', work: 'Designs customer and pricing experiments with measurable thresholds, owners, and a practical weekly plan.', tools: 'Experiments · Conversion analysis · Cash runway' },
  { name: 'Lead reviewer', icon: Network, scope: 'Lite & full', work: 'Reconciles the team’s findings into a clear recommendation, evidence limits, and a plan you can act on.', tools: 'Shared evidence · Sources · Calculations' },
]

export default async function AgentsPage() {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect('/auth/signin')
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!owner) redirect('/dashboard')
  const latest = await db.query.validationReports.findFirst({ where: eq(validationReports.userId, owner.id), orderBy: [desc(validationReports.createdAt)] })
  const idea = latest ? await db.query.ideas.findFirst({ where: and(eq(ideas.id, latest.ideaId), eq(ideas.userId, owner.id)), columns: { name: true } }) : null
  const data = latest?.reportData && typeof latest.reportData === 'object' ? latest.reportData as Record<string, unknown> : {}
  return <div className="research-team-page">
    <div className="workspace-page-heading"><div><h1>Meet your research team.</h1><p>Different perspectives. Shared evidence. Specialists work together, then a lead reviewer brings the findings into one report.</p></div><Link href="/dashboard" className="workspace-button-primary">Start a validation<ArrowRight size={15} aria-hidden="true" /></Link></div>
    <div className="team-workflow" aria-label="Research workflow">
      <div><Search size={20} aria-hidden="true" /><strong>Research</strong><p>Market, customer, and competition findings</p></div><ArrowRight size={18} aria-hidden="true" />
      <div><Calculator size={20} aria-hidden="true" /><strong>Analyze and plan</strong><p>Economics, risk, product, growth and source review</p></div><ArrowRight size={18} aria-hidden="true" />
      <div><FileCheck2 size={20} aria-hidden="true" /><strong>Review</strong><p>Reconcile findings and audit citation links</p></div>
    </div>
    <p className="team-plan-note">Lite reports use three specialists. Full reports use all nine, with fourteen research and planning tools across the team. Specialists reuse dated market knowledge, official datasets and earlier findings before requesting more research.</p>
    <section className="team-specialists" aria-label="Research specialists">{specialists.map(({ name, icon: Icon, scope, work, tools }) => <article key={name}>
      <div className="team-specialist-top"><span><Icon size={21} aria-hidden="true" /></span><small>{scope}</small></div><h2>{name}</h2><p>{work}</p><div className="team-specialist-tools"><BookOpen size={13} aria-hidden="true" />{tools}</div>
    </article>)}</section>
    <section className="team-latest"><div><h2>Your latest research</h2>{latest && <Link className="workspace-text-link" href={'/dashboard/report/' + latest.id}>Open report<ArrowRight size={14} aria-hidden="true" /></Link>}</div>
      {data.agentTrail ? <><p>{idea?.name || 'Latest validation'}</p><AgentActivity trail={data.agentTrail} defaultOpen /></> : <div className="team-empty"><Network size={24} aria-hidden="true" /><div><strong>See the work behind your report.</strong><p>{latest ? 'Your existing report predates the activity log. New analyses will show the specialists and tools that contributed.' : 'After your first analysis, this space will show which specialists finished and which tools they used.'}</p></div></div>}
    </section>
    <ReportTemplateDownloads />
    <p className="team-evidence-note"><ShieldCheck size={16} aria-hidden="true" />Market memory preserves source dates and scope. Current pricing and important evidence gaps can trigger fresh research. Source matching checks provenance; it does not prove a claim is true.</p>
  </div>
}
