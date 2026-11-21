import { planningSourceLink } from '@/lib/planning/report-content'

type Source = { title?: string; url?: string; fetchedAt?: string; retrievalKind?: string; evidenceNote?: string }

export function PlanningEvidence({ sources, gaps, warnings }: { sources?: Source[]; gaps?: string[]; warnings?: string[] }) {
  const entries = Array.isArray(sources) ? sources.flatMap(source => {
    const link = source && planningSourceLink(source.url)
    return link ? [{ source, link }] : []
  }) : []
  const limits = [...(warnings ?? []), ...(gaps ?? [])].filter((value, index, values) => value && values.indexOf(value) === index)
  return (
    <section className="card-angular bg-white p-5" aria-label="Sources and evidence limits">
      {!!limits.length && <div className="mb-4 text-sm leading-relaxed text-[#364152]"><h3 className="font-medium text-[#141923] mb-2">Evidence limits to resolve</h3><ul className="list-disc space-y-2 pl-5">{limits.map(limit => <li key={limit}>{limit}</li>)}</ul></div>}
      {!entries.length && <p className="mb-4 text-sm leading-relaxed text-[#364152]">No research source register was saved with this result. Treat external claims as unverified until you inspect the original source.</p>}
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-[#141923]">Sources and evidence gaps{entries.length ? ` · ${entries.length} sources` : ''}</summary>
      <div className="mt-4 space-y-4 text-sm text-[#364152]">
        {!!entries.length && <ul className="divide-y divide-[#E5E7EB]">{entries.map(({ source, link }, index) => (
          <li key={source.url + String(index)} className="py-3 first:pt-0">
            <a className="font-medium text-[#89620B] underline underline-offset-4 break-words" href={link.href} target="_blank" rel="noopener noreferrer">{source.title || link.hostname}</a>
            <p className="mt-1 text-xs text-[#657081]">{source.retrievalKind === 'page' || source.retrievalKind === 'open-data' ? 'Retrieved source' : 'Search or background context'}{source.fetchedAt ? ` · Retrieved ${source.fetchedAt.slice(0, 10)}` : ''}</p>
            {source.evidenceNote && <p className="mt-1 text-xs leading-relaxed">{source.evidenceNote}</p>}
          </li>
        ))}</ul>}
      </div>
    </details>
    </section>
  )
}
