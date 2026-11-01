'use client'

import { buildReportDocument } from '@/lib/exports/document'
import type { ReportModel } from './ReportView'

export function FullReportNarrative({ report }: { report: ReportModel }) {
  const document = buildReportDocument(report as unknown as Record<string, unknown>, null, 'validation')
  return <article className="report-narrative">
    <header><h2>Full report</h2><p>All saved findings, assumptions and source references in reading order.</p></header>
    <nav aria-label="Report sections"><ol>{document.sections.map((section, index) => <li key={index}><a href={'#narrative-' + index}>{section.title}</a></li>)}</ol></nav>
    {document.sections.map((section, index) => <section key={index} id={'narrative-' + index}>
      <h3>{section.title}</h3>
      {section.lines.map((line, lineIndex) => line.kind === 'label'
        ? <h4 key={lineIndex}>{line.text}</h4>
        : <p key={lineIndex} className={line.kind === 'bullet' ? 'narrative-bullet' : undefined}>{line.text}</p>)}
    </section>)}
  </article>
}
