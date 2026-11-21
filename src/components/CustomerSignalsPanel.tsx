import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { CustomerAgentSchema } from '@/lib/validation/schemas'

const SOURCES = { recorded_feedback: 'Recorded customer evidence', public_review: 'Public review sample', founder_statement: 'Founder statement', assumption: 'Hypothesis to test' }
export function CustomerSignalsPanel({ value, ideaId }: { value: unknown; ideaId?: string }) {
  const parsed = CustomerAgentSchema.shape.customerSignals.safeParse(value)
  if (!parsed.success || !parsed.data) return null
  const signals = parsed.data
  const sourceLink = (value: string) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null } catch { return null } }
  return <section className="card-angular p-6 mb-8 sm:p-8" aria-labelledby="customer-signals-heading"><h2 id="customer-signals-heading" className="text-lg font-medium text-[#141923]">Customer reviews and recorded evidence</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-[#536172]">{signals.summary}</p>
    <ul className="mt-5 divide-y divide-[#E5E7EB]">{signals.observations.map((observation, index) => <li key={index} className="py-4"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium text-sm">{observation.theme}</h3><span className="text-xs text-[#536172]">{SOURCES[observation.sourceType]} · {observation.direction}</span></div>
      <p className="mt-2 text-xs text-[#536172]">{observation.count === null ? 'Observed count not established' : observation.sampleSize === null ? observation.count + ' recorded observations; denominator unknown' : observation.count + ' / ' + observation.sampleSize + ' records in the observed sample'}</p>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-[#536172]">{observation.limitation}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">{observation.sourceUrls.map(url => { const href = sourceLink(url); return href ? <a key={url} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-xs text-[#536172] underline underline-offset-4">View source <ExternalLink size={13} aria-hidden="true" /></a> : null })}</div>
    </li>)}</ul>
    {signals.unresolvedQuestions.length > 0 && <div className="mt-4"><h3 className="text-sm font-medium">What to investigate next</h3><ul className="mt-2 list-disc pl-5 text-sm leading-7 text-[#536172]">{signals.unresolvedQuestions.map(question => <li key={question}>{question}</li>)}</ul></div>}
    {ideaId && <Link href={'/dashboard/feedback?idea=' + ideaId} className="workspace-text-link mt-3">Review the customer evidence notebook</Link>}
  </section>
}
