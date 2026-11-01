import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readPublicAsset } from '../public-assets'
import type { ReportDocument } from './document'

const WIDTH = 595.28, HEIGHT = 841.89, MARGIN = 46, BOTTOM = 62
const ink = rgb(0.19, 0.22, 0.28), muted = rgb(0.40, 0.44, 0.50)
const rule = rgb(0.89, 0.90, 0.92), gold = rgb(0.53, 0.38, 0.06)

/** Pure JS rendering: no runtime WASM compilation or filesystem dependency on Workers. */
export async function renderReportPdf(report: ReportDocument, options: { whiteLabel?: boolean } = {}): Promise<Buffer> {
  const document = await PDFDocument.create()
  document.registerFontkit(fontkit)
  document.setTitle(report.title + ' — ' + report.subtitle)
  document.setAuthor(options.whiteLabel ? '' : 'Validore')
  document.setSubject('Startup research and decision support')
  const [regularBytes, boldBytes] = await Promise.all([
    readPublicAsset('/fonts/NotoSans-Regular.ttf'), readPublicAsset('/fonts/NotoSans-Bold.ttf'),
  ])
  const regular = await document.embedFont(regularBytes, { subset: true })
  const bold = await document.embedFont(boldBytes, { subset: true })
  const logo = options.whiteLabel ? null : await document.embedPng(await readPublicAsset('/logo/validore-report.png'))
  let page: PDFPage, y = 0
  const newPage = () => {
    page = document.addPage([WIDTH, HEIGHT])
    y = HEIGHT - 44
  }
  newPage()
  const ensureSpace = (height: number) => { if (y - height < BOTTOM) newPage() }
  const width = WIDTH - MARGIN * 2

  // Split long URLs/tokens as well as prose; never let an unbroken source URL
  // or founder answer run outside the page. Preserve explicit paragraph breaks.
  const wrap = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
    const lines: string[] = []
    for (const paragraph of text.replace(/\r/g, '').split('\n')) {
      let line = ''
      for (const token of paragraph.split(/\s+/).filter(Boolean)) {
        const candidate = line ? line + ' ' + token : token
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue }
        if (line) { lines.push(line); line = '' }
        if (font.widthOfTextAtSize(token, size) <= maxWidth) { line = token; continue }
        for (const character of token) {
          if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) { lines.push(line); line = '' }
          line += character
        }
      }
      lines.push(line)
    }
    return lines
  }
  const paragraph = (text: string, settings: {
    size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number;
    gap?: number; shaded?: boolean; keepWithNext?: number;
  } = {}) => {
    const size = settings.size ?? 9, font = settings.font ?? regular
    const indent = settings.indent ?? 0, padding = settings.shaded ? 5 : 0
    const lines = wrap(text, font, size, width - indent - padding * 2)
    const leading = size * 1.65
    ensureSpace(Math.min(lines.length * leading + padding * 2 + (settings.keepWithNext ?? 0), HEIGHT - 44 - BOTTOM))
    if (padding) y -= padding
    for (const line of lines) {
      ensureSpace(leading + padding)
      if (settings.shaded) page.drawRectangle({
        x: MARGIN + indent, y: y - leading, width: width - indent, height: leading + 2,
        color: rgb(0.96, 0.95, 0.92),
      })
      page.drawText(line, { x: MARGIN + indent + padding, y: y - size, size, font, color: settings.color ?? ink })
      y -= leading
    }
    y -= padding + (settings.gap ?? 5)
  }

  if (logo) { page!.drawImage(logo, { x: MARGIN, y: y - 30, width: 140, height: 30 }); y -= 54 }
  paragraph(report.title, { size: 27, font: bold, gap: 9 })
  paragraph(report.subtitle, { size: 14, color: gold, gap: 6 })
  paragraph(report.date, { size: 9, color: muted, gap: 23 })
  if (report.partial) paragraph('Partial analysis. Some specialists could not finish. Review the research activity and test the missing assumptions before acting.', { shaded: true, gap: 18 })

  for (const section of report.sections) {
    if (section.breakBefore) newPage()
    ensureSpace(65)
    y -= 16
    paragraph(section.title, { size: 13, font: bold, keepWithNext: 30, gap: 7 })
    page!.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, thickness: 0.6, color: rule })
    y -= 10
    for (const line of section.lines) paragraph((line.kind === 'bullet' ? '• ' : '') + line.text, {
      font: line.kind === 'label' ? bold : regular,
      indent: line.kind === 'bullet' ? 10 : 0,
      shaded: line.kind === 'field',
      size: line.kind === 'field' ? 9.5 : 9,
      keepWithNext: line.kind === 'label' ? 22 : 0,
    })
  }

  const pages = document.getPages()
  pages.forEach((sheet, index) => {
    sheet.drawLine({ start: { x: MARGIN, y: 46 }, end: { x: WIDTH - MARGIN, y: 46 }, thickness: 0.6, color: rule })
    const footer = options.whiteLabel ? 'Confidential | Assumptions and projections require validation' : 'Validore | Assumptions and projections require validation'
    sheet.drawText(footer, { x: MARGIN, y: 30, size: 7, font: regular, color: muted })
    const number = (index + 1) + ' / ' + pages.length
    sheet.drawText(number, { x: WIDTH - MARGIN - regular.widthOfTextAtSize(number, 7), y: 30, size: 7, font: regular, color: muted })
  })
  return Buffer.from(await document.save())
}
