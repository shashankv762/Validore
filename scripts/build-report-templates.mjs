import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createServer } from 'vite'

// Load the same TypeScript renderers used by Next and the export tests.
const runner = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { templatePack } = await runner.ssrLoadModule('/src/lib/exports/template-pack.ts')
  const { TEMPLATE_VERSION } = await runner.ssrLoadModule('/src/lib/exports/design.ts')
  const { renderReportPdf } = await runner.ssrLoadModule('/src/lib/exports/pdf.ts')
  const { renderReportWord } = await runner.ssrLoadModule('/src/lib/exports/word.ts')
  await mkdir('public/templates', { recursive: true })
  const artifacts = []
  for (const item of templatePack()) {
    for (const format of item.formats) {
      const bytes = format === 'pdf' ? await renderReportPdf(item.document) : await renderReportWord(item.document)
      const filename = item.name + '.' + format
      await writeFile('public/templates/' + filename, bytes)
      artifacts.push({ filename, format, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        title: item.document.subtitle, paper: item.document.design.paper, orientation: item.document.design.orientation,
        example: Boolean(item.document.design.example) })
      console.log('Created ' + filename + ' (' + bytes.length + ' bytes)')
    }
  }
  await writeFile('public/templates/manifest.json', JSON.stringify({ version: TEMPLATE_VERSION, generatedAt: new Date().toISOString(),
    notice: 'Public blank workbooks and explicitly fictional examples. No customer reports or provider calls.', artifacts }, null, 2) + '\n')
  console.log('Created ' + artifacts.length + ' branded template artifacts and their manifest.')
} finally {
  await runner.close()
}
