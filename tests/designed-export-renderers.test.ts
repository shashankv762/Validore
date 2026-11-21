import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { PDFArray, PDFDocument, PDFHexString, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib'
import { buildCanvasTemplate } from '@/lib/exports/template-pack'
import { designedSection, TEMPLATE_VERSION, type DesignedReport } from '@/lib/exports/design'
import { renderReportPdf } from '@/lib/exports/pdf'
import { renderReportWord } from '@/lib/exports/word'
import { wrapDocumentText } from '@/lib/exports/designed-pdf'
import { buildReportDocument } from '@/lib/exports/document'

const decodedPageOperators = (pdf: PDFDocument) => pdf.getPages().flatMap(page =>
  pdf.context.lookup(page.node.get(PDFName.of('Contents')), PDFArray).asArray().map(ref => {
    const stream = pdf.context.lookup(ref)
    if (!(stream instanceof PDFRawStream)) throw new Error('Expected a saved PDF content stream')
    return Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1')
  })).join('\n')

describe('Designed printable export regressions', () => {
  it('prints the editable Canvas on landscape paper whose cells fit the usable width', async () => {
    const report = buildCanvasTemplate('a4', true)
    const zip = await JSZip.loadAsync(await renderReportWord(report))
    const xml = await zip.file('word/document.xml')!.async('string')
    const page = /<w:pgSz[^>]*w:w="(\d+)"[^>]*w:h="(\d+)"[^>]*w:orient="landscape"/.exec(xml)
    expect(page).not.toBeNull()
    expect(Number(page![1])).toBeGreaterThan(Number(page![2]))
    const margins = /<w:pgMar[^>]*w:right="(\d+)"[^>]*w:left="(\d+)"/.exec(xml)
    expect(margins).not.toBeNull()
    const usable = Number(page![1]) - Number(margins![1]) - Number(margins![2])
    const grid = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].reduce((sum, match) => sum + Number(match[1]), 0)
    expect(grid).toBeLessThanOrEqual(usable + 10)
    for (const label of ['Problem', 'Solution', 'Unique value proposition', 'Unfair advantage', 'Customer segments', 'Key metrics', 'Channels', 'Cost structure', 'Revenue streams']) {
      expect(xml).toContain(label)
    }
    const pdf = await PDFDocument.load(await renderReportPdf(report))
    expect(pdf.getPage(0).getWidth()).toBeGreaterThan(pdf.getPage(0).getHeight())
  })
  it('keeps line breaks, zero and unknown values, and milestone evidence states in editable Word', async () => {
    const report: DesignedReport = { title: 'Synthetic evidence fixture', subtitle: 'Print regression', date: '16 November 2026', partial: false,
      design: { version: TEMPLATE_VERSION, paper: 'a4', orientation: 'portrait' }, sections: [designedSection('Reviewed inputs', [
        { kind: 'callout', text: 'Zero revenue is an entered scenario.\nUnknown demand remains unknown.' },
        { kind: 'table', headers: ['Value', 'Evidence state'], rows: [['₹0', 'Recorded zero'], ['Unavailable', 'Missing denominator'], ['Interview preparation', 'ACHIEVED'], ['Paid offer test', 'PLANNED']] },
        { kind: 'text', text: 'ग्राहक की प्रस्तावित कीमत ₹1,200 प्रति माह है।' },
      ])] }
    const zip = await JSZip.loadAsync(await renderReportWord(report))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toMatch(/Zero revenue is an entered scenario\.[\s\S]*?<w:br\/>[\s\S]*?Unknown demand remains unknown\./)
    for (const value of ['₹0', 'Unavailable', 'Missing denominator', 'ACHIEVED', 'PLANNED', 'ग्राहक']) expect(xml).toContain(value)
    expect(xml.match(/<w:tr>/g)).toHaveLength(5)
  })
  it('renders Hindi with real glyph shaping and retains logical Unicode for selection', async () => {
    const report: DesignedReport = { title: 'Hindi print regression', subtitle: 'Synthetic output', date: '16 November 2026', partial: false,
      design: { version: TEMPLATE_VERSION, paper: 'a4', orientation: 'portrait' }, sections: [designedSection('Recorded statement', [
        { kind: 'text', text: 'ग्राहक ने प्रस्तावित कीमत ₹1,200 प्रति माह बताई।' },
      ])] }
    const pdf = await PDFDocument.load(await renderReportPdf(report))
    const operators = decodedPageOperators(pdf)
    expect(operators).toContain('/ActualText ' + PDFHexString.fromText('ग्राहक').toString())
    expect(pdf.getPages()).toHaveLength(1)
    const clusters = wrapDocumentText('किकिकिकिकिकिकिकि', value => [...new Intl.Segmenter('hi', { granularity: 'grapheme' }).segment(value)].length, 3)
    expect(clusters.join('')).toBe('किकिकिकिकिकिकिकि')
    expect(clusters.every(line => !line.startsWith('ि'))).toBe(true)
  })
  it('uses the same Unicode rendering on the actual saved customer PDF download path', async () => {
    const report = buildReportDocument({ overallScore: 0, decision: 'TEST_FURTHER', reportData: {
      quote: 'ग्राहक ने कहा कि स्टॉक मिलाने में समय लगता है।', revenue: 0,
      uncertainty: 'Willingness to pay is not established; an unavailable ratio is not zero.',
      milestones: [{ milestone: 'Write interview guide', status: 'ACHIEVED' }, { milestone: 'Paid offer test', status: 'PLANNED' }],
    } }, { name: 'Synthetic saved customer fixture' }, 'validation')
    const legacy = { title: report.title, subtitle: report.subtitle, date: report.date, partial: report.partial, sections: report.sections }
    for (const document of [report, legacy]) {
      const pdf = await PDFDocument.load(await renderReportPdf(document))
      expect(decodedPageOperators(pdf)).toContain('/ActualText ' + PDFHexString.fromText('ग्राहक').toString())
      expect(pdf.getPage(0).getWidth()).toBeLessThan(pdf.getPage(0).getHeight())
    }
  })
})
