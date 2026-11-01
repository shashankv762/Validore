import { createElement as h } from 'react'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from '@react-pdf/renderer'
import type { ReportDocument } from './document'

Font.register({ family: 'Noto Sans', fonts: [
  { src: join(process.cwd(), 'public/fonts/NotoSans-Regular.ttf'), fontWeight: 400 },
  { src: join(process.cwd(), 'public/fonts/NotoSans-Bold.ttf'), fontWeight: 700 },
] })
const styles = StyleSheet.create({
  page: { paddingTop: 44, paddingBottom: 62, paddingHorizontal: 46, fontFamily: 'Noto Sans', fontSize: 9, color: '#303948', lineHeight: 1.65 },
  logo: { width: 140, height: 30, marginBottom: 24 },
  title: { fontSize: 27, color: '#141923', fontWeight: 700, lineHeight: 1.2, marginBottom: 9 },
  subtitle: { fontSize: 14, color: '#88620F', marginBottom: 6 },
  date: { color: '#667181', fontSize: 9, marginBottom: 23 },
  notice: { backgroundColor: '#FFF4D7', padding: 12, marginBottom: 18, borderLeft: '3px solid #E0A526' },
  section: { fontSize: 13, fontWeight: 700, color: '#141923', borderBottom: '1px solid #E3E6EB', paddingBottom: 7, marginTop: 18, marginBottom: 10 },
  text: { marginBottom: 5 },
  label: { fontWeight: 700, marginTop: 6, marginBottom: 4 },
  bullet: { marginLeft: 10, marginBottom: 5 },
  field: { backgroundColor: '#F5F3EC', padding: 6, marginBottom: 6, color: '#59616E', fontSize: 9.5, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 23, left: 46, right: 46, height: 24, borderTop: '1px solid #E3E6EB', paddingTop: 8, flexDirection: 'row', justifyContent: 'space-between', color: '#667181', fontSize: 7, lineHeight: 1.2 },
  footerText: { fontSize: 7, lineHeight: 1.2 },
})

export async function renderReportPdf(report: ReportDocument): Promise<Buffer> {
  // Buffers also work on Windows, where the image loader treats C:\ paths as URLs.
  const logo = await readFile(join(process.cwd(), 'public/logo/validore-report.png'))
  return renderToBuffer(h(Document, { title: report.title + ' — ' + report.subtitle, author: 'Validore', subject: 'Startup research and decision support' },
    h(Page, { size: 'A4', style: styles.page },
      h(Image, { src: logo, style: styles.logo }),
      h(Text, { style: styles.title }, report.title),
      h(Text, { style: styles.subtitle }, report.subtitle),
      h(Text, { style: styles.date }, report.date),
      report.partial ? h(Text, { style: styles.notice }, 'Partial analysis. Some specialists could not finish. Review the research activity and test the missing assumptions before acting.') : null,
      ...report.sections.flatMap((section, index) => [
        h(Text, { key: 'heading-' + index, style: styles.section, minPresenceAhead: 35, break: section.breakBefore }, section.title),
        ...section.lines.map((line, lineIndex) => h(Text, {
          key: index + '-' + lineIndex, style: line.kind === 'label' ? styles.label : line.kind === 'bullet' ? styles.bullet : line.kind === 'field' ? styles.field : styles.text,
          orphans: 2, widows: 2, ...(line.kind === 'label' ? { minPresenceAhead: 22 } : {}),
          ...(line.kind === 'field' ? { wrap: false } : {}),
        }, (line.kind === 'bullet' ? '• ' : '') + line.text)),
      ]),
      h(View, { style: styles.footer, fixed: true, render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages?: number }) => [
        h(Text, { key: 'note', style: styles.footerText }, 'Validore  |  Assumptions and projections require validation'),
        h(Text, { key: 'page', style: { ...styles.footerText, width: 48, textAlign: 'right' } }, totalPages ? pageNumber + ' / ' + totalPages : 'Page ' + pageNumber),
      ] }),
    ),
  ))
}
