import fontkit, { type Font } from '@pdf-lib/fontkit'
import { PDFDocument, PDFHexString, PDFName, PDFOperator, PDFOperatorNames, beginText, endText, popGraphicsState, pushGraphicsState,
  setFillingColor, setFontAndSize, setTextMatrix, showText, type Color, type PDFFont, type PDFPage } from 'pdf-lib'
import { readPublicAsset } from '../public-assets'

const devanagari = /[\u0900-\u097f\u1cd0-\u1cff\ua8e0-\ua8ff\u200c\u200d]/u
export const hasDevanagari = (text: string) => devanagari.test(text)
export function splitPdfTextRuns(text: string): { text: string; devanagari: boolean }[] {
  const runs: { text: string; devanagari: boolean }[] = []
  for (const character of text) {
    const script = hasDevanagari(character)
    const previous = runs.at(-1)
    if (previous && previous.devanagari === script) previous.text += character
    else runs.push({ text: character, devanagari: script })
  }
  return runs
}

/** Use real script fonts and fontkit glyph positions. pdf-lib's ordinary
 * drawText uses substitutions but omits mark positioning and kerning offsets. */
export async function loadPdfText(pdf: PDFDocument, needsDevanagari = false) {
  const [regularBytes, boldBytes] = await Promise.all([readPublicAsset('/fonts/NotoSans-Regular.ttf'), readPublicAsset('/fonts/NotoSans-Bold.ttf')])
  const regular = await pdf.embedFont(regularBytes, { subset: true })
  const bold = await pdf.embedFont(boldBytes, { subset: true })
  const fallback = new Map<PDFFont, { font: PDFFont; shaping: Font }>()
  if (needsDevanagari) {
    // fontkit 1.1.1 omitted its generator runtime from the Indic shaper bundle.
    // Reuse the installed Next runtime. Define the global binding first so its
    // compatibility fallback never invokes Function on constrained Workers.
    const globals = globalThis as typeof globalThis & { regeneratorRuntime?: unknown }
    if (!globals.regeneratorRuntime) {
      Object.defineProperty(globals, 'regeneratorRuntime', { value: undefined, writable: true, configurable: true })
      await import('next/dist/compiled/regenerator-runtime/runtime')
    }
    for (const [base, path] of [[regular, '/fonts/NotoSansDevanagari-Regular.ttf'], [bold, '/fonts/NotoSansDevanagari-Bold.ttf']] as const) {
      const bytes = await readPublicAsset(path)
      fallback.set(base, { font: await pdf.embedFont(bytes, { subset: true }), shaping: fontkit.create(bytes) })
    }
  }
  const measure = (text: string, size: number, base: PDFFont = regular) => splitPdfTextRuns(text).reduce((width, run) => {
    const selected = run.devanagari ? fallback.get(base) : undefined
    if (run.devanagari && !selected) throw new Error('Devanagari document font was not loaded')
    return width + (selected ? selected.shaping.layout(run.text).positions.reduce((sum, position) => sum + position.xAdvance, 0) * size / selected.shaping.unitsPerEm
      : base.widthOfTextAtSize(run.text, size))
  }, 0)
  const keys = new WeakMap<PDFPage, Map<PDFFont, PDFName>>()
  const draw = (page: PDFPage, text: string, x: number, y: number, size: number, base: PDFFont = regular, color: Color) => {
    let cursor = x
    for (const run of splitPdfTextRuns(text)) {
      const selected = run.devanagari ? fallback.get(base) : undefined
      if (run.devanagari && !selected) throw new Error('Devanagari document font was not loaded')
      if (!selected) {
        page.drawText(run.text, { x: cursor, y, size, font: base, color })
        cursor += base.widthOfTextAtSize(run.text, size)
        continue
      }
      const layout = selected.shaping.layout(run.text)
      const encoded = selected.font.encodeText(run.text).asString().match(/.{4}/g) ?? []
      const scale = size / selected.shaping.unitsPerEm
      let fontKeys = keys.get(page)
      if (!fontKeys) { fontKeys = new Map(); keys.set(page, fontKeys) }
      let key = fontKeys.get(selected.font)
      if (!key) { key = page.node.newFontDictionary(selected.font.name, selected.font.ref); fontKeys.set(selected.font, key) }
      // Preserve logical Unicode for selection and accessible text extraction
      // even when visual glyph order changes (for example the Hindi i-matra).
      page.pushOperators(pushGraphicsState(), PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence,
        [PDFName.of('Span'), pdf.context.obj({ ActualText: PDFHexString.fromText(run.text) }).toString()]),
      beginText(), setFillingColor(color), setFontAndSize(key, size))
      let advance = 0
      layout.positions.forEach((position, index) => {
        page.pushOperators(setTextMatrix(1, 0, 0, 1, cursor + (advance + position.xOffset) * scale, y + position.yOffset * scale),
          showText(PDFHexString.of(encoded[index])))
        advance += position.xAdvance
      })
      page.pushOperators(endText(), PDFOperator.of(PDFOperatorNames.EndMarkedContent), popGraphicsState())
      cursor += advance * scale
    }
  }
  return { regular, bold, measure, draw }
}
