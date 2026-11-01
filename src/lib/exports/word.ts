import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Document, Packer, Paragraph, TextRun, ImageRun, Footer, Header, PageNumber, HeadingLevel, AlignmentType } from 'docx'
import type { ReportDocument } from './document'

export async function renderReportWord(report: ReportDocument): Promise<Buffer> {
  const logo = await readFile(join(process.cwd(), 'public/logo/validore-report.png'))
  const document = new Document({
    creator: 'Validore', title: report.title + ' — ' + report.subtitle, description: 'Startup research and decision support',
    styles: { default: { document: { run: { font: 'Arial', size: 21, color: '303948' }, paragraph: { spacing: { after: 120, line: 285 } } } },
      paragraphStyles: [{ id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Arial', bold: true, size: 52, color: '000000' }, paragraph: { spacing: { before: 220, after: 160 }, keepNext: true } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: 'Arial', bold: true, size: 28, color: '000000' }, paragraph: { spacing: { before: 300, after: 160 }, keepNext: true } }] },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 960, right: 960 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: [new ImageRun({ type: 'png', data: logo, transformation: { width: 140, height: 30 } })] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
        new TextRun({ text: 'Validore  •  Assumptions require validation   |   ', size: 16, color: '667181' }),
        new TextRun({ children: [PageNumber.CURRENT, ' / ', PageNumber.TOTAL_PAGES], size: 16 }),
      ] })] }) },
      children: [
        new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
        new Paragraph({ children: [new TextRun({ text: report.subtitle, size: 30, color: '000000' })] }),
        new Paragraph({ children: [new TextRun({ text: report.date, color: '667181' })], spacing: { after: 280 } }),
        ...(report.partial ? [new Paragraph({ children: [new TextRun({ text: 'Partial analysis. Some specialists could not finish. Review the missing evidence before acting.', bold: true })], shading: { fill: 'FFF4D7' } })] : []),
        ...report.sections.flatMap(section => [
          new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_1, pageBreakBefore: section.breakBefore }),
          ...section.lines.map(line => new Paragraph({
            children: [new TextRun({ text: line.text, bold: line.kind === 'label', ...(line.kind === 'field' ? { color: '59616E' } : {}) })],
            ...(line.kind === 'field' ? { shading: { fill: 'F5F3EC' }, indent: { left: 120, right: 120 }, spacing: { before: 70, after: 130, line: 300 }, keepLines: true } : {}),
            ...(line.kind === 'bullet' ? { bullet: { level: 0 } } : {}),
            keepNext: line.kind === 'label', widowControl: true,
          })),
        ]),
      ],
    }],
  })
  return Packer.toBuffer(document)
}
