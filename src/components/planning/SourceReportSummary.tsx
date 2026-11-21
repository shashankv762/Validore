import { SourceReportSnapshotSchema } from '@/lib/planning/source-report-contract'
export function SourceReportSummary({ value }: { value:unknown }) {
  const parsed = SourceReportSnapshotSchema.safeParse(value)
  if (!parsed.success) return null
  const source = parsed.data
  return <details className="card-angular bg-white p-5" aria-label="Linked validation report">
    <summary className="cursor-pointer text-sm font-medium text-[#141923]">Linked {source.mode === 'lite' ? 'Lite' : 'Full'} validation · {source.status === 'partial' ? 'Partial' : 'Complete'} · {source.score === null ? 'Score unavailable' : source.score+'/100'}</summary>
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-[#657081]">
      <p>{source.reportCreatedAt && Number.isFinite(Date.parse(source.reportCreatedAt)) ? 'Report saved '+new Date(source.reportCreatedAt).toLocaleDateString()+'. ' : 'Original report date unavailable. '}This output uses the captured report findings, with their original assumptions and evidence limits.</p>
      <ul className="list-disc pl-5 space-y-2">{source.coverage.notices.map(notice=><li key={notice}>{notice}</li>)}</ul>
      <p>{source.coverage.suppliedFields.length} captured fields supplied; {source.coverage.suppliedSourceCount} of {source.coverage.sourceCount} dated source entries supplied.</p>
      {source.coverage.omittedFields.length>0 && <p>Ancillary fields omitted: {source.coverage.omittedFields.join(', ')}.</p>}
    </div>
  </details>
}
