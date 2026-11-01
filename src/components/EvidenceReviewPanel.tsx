import { FileCheck2, ExternalLink } from 'lucide-react'

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
function sourceUrl(value: unknown) {
  try { const url = new URL(String(value)); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null }
}

export function EvidenceReviewPanel({ value }: { value: unknown }) {
  const review = object(value)
  if (!review.summary) return null
  const checks = (Array.isArray(review.checks) ? review.checks : []).map(object).slice(0, 8)
  const gaps = (Array.isArray(review.gaps) ? review.gaps : []).filter((gap): gap is string => typeof gap === 'string').slice(0, 8)
  return <section className="card-angular mb-8 p-5 sm:p-8" aria-label="Source review">
    <h2 className="flex items-center gap-2 text-lg font-medium text-[#141923]"><FileCheck2 size={20} className="text-[#A4730C]" aria-hidden="true" />Source review</h2>
    <p className="mt-3 text-sm leading-relaxed text-[#364152]">{String(review.summary)}</p>
    <p className="mt-2 text-xs leading-relaxed text-[#667085]">These are AI interpretations of retrieved sources. Check the original passages before relying on an important claim.</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">{checks.map((check, index) => {
      const url = sourceUrl(check.url)
      const assessment = check.assessment === 'supports' ? 'Supports the claim' : check.assessment === 'contradicts' ? 'Contradicts the claim' : 'Inconclusive'
      return <article key={index} className="min-w-0 rounded-lg border border-[#E5E7EB] p-4">
        <span className="text-xs font-medium text-[#88620F]">{assessment}</span><h3 className="mt-2 text-sm font-medium text-[#141923]">{String(check.claim ?? '')}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#667085]">{String(check.rationale ?? '')}</p>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#88620F] underline underline-offset-4">Read original source<ExternalLink size={12} aria-hidden="true" /></a>}
      </article>
    })}</div>
    {gaps.length > 0 && <div className="mt-5 rounded-lg bg-[#F7F5EE] p-4"><h3 className="text-sm font-medium text-[#141923]">Evidence still needed</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#667085]">{gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul></div>}
  </section>
}
