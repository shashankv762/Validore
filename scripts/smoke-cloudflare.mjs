import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import ts from 'typescript'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'

// A separate, local-only entry point exercises exports with synthetic data.
// It is generated under .tmp and is never part of the deployment configuration.
const root = process.cwd()
await mkdir('.tmp', { recursive: true })
const temporary = await mkdtemp(resolve('.tmp/cloudflare-smoke-'))
const entry = `import worker from '../../cloudflare/worker.mjs';
import { withWorkerScope } from '../../src/lib/worker-scope.ts';
import { renderReportPdf } from '../../src/lib/exports/pdf.ts';
import { renderReportWord } from '../../src/lib/exports/word.ts';
import PptxGenJS from 'pptxgenjs';
const report = {title:'Synthetic Worker report',subtitle:'Runtime compatibility',date:'2026-11-01',partial:false,
sections:[{title:'Evidence',lines:Array.from({length:60},(_,i)=>({kind:'text',text:'Observation '+i+': synthetic content; no account data.'}))}]};
export default {fetch(request,env,ctx){
 const path=new URL(request.url).pathname;
 if(path.startsWith('/__local_test/')) return withWorkerScope(env,ctx,async()=>{
   if(path.endsWith('pptx')) {
     const deck=new PptxGenJS(); deck.addSlide().addText('Synthetic Worker slide',{x:1,y:1,w:6,h:1});
     return new Response(new Uint8Array(await deck.write({outputType:'nodebuffer'})));
   }
   const data=path.endsWith('docx')?await renderReportWord(report):await renderReportPdf(report,{whiteLabel:path.endsWith('white-label')});
   return new Response(new Uint8Array(data));
 });
 return worker.fetch(request,env,ctx);
}};`
await writeFile(join(temporary, 'worker.mjs'), entry)
// Prevent Wrangler from loading any developer .env files into the test Worker.
await writeFile(join(temporary, '.dev.vars'), 'APP_ENV=preview\n')
const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', await readFile('wrangler.jsonc', 'utf8'))
if (parsed.error) throw new Error('Invalid Wrangler JSONC configuration')
const config = { ...parsed.config, name: 'validore-smoke', main: './worker.mjs',
  assets: { ...parsed.config.assets, directory: resolve('.open-next/assets') },
  services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'validore-smoke' }],
  triggers: { crons: [] }, workers_dev: false, preview_urls: false, routes: [],
  vars: { APP_ENV: 'preview', VALIDATION_RUNNER: 'inngest' },
}
delete config.$schema
await writeFile(join(temporary, 'wrangler.json'), JSON.stringify(config, null, 2))
const reservation = createServer().listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise(done => reservation.close(done))
const child = spawn(process.execPath, [resolve('node_modules/wrangler/bin/wrangler.js'), 'dev',
  '--config', join(temporary, 'wrangler.json'), '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0'], {
  cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
})
let logs = '', startupError
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { logs = (logs + data).slice(-12000) })
child.on('error', error => { startupError = error })
const stop = () => {
  if (!child.pid || child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  else child.kill('SIGTERM')
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
const checks = []
const get = path => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000) })
try {
  let ready = false
  const deadline = Date.now() + 55000
  while (Date.now() < deadline) {
    if (startupError) throw startupError
    if (child.exitCode !== null) throw new Error('Local Worker exited: ' + logs.slice(-2500))
    try { const response = await get('/api/health'); if (response.ok && (await response.json()).status === 'ok') { ready = true; break } } catch {}
    await new Promise(done => setTimeout(done, 300))
  }
  assert(ready, 'Worker did not become ready: ' + logs.slice(-2500))
  checks.push('liveness')
  for (const path of ['/', '/demo', '/legal/privacy', '/robots.txt', '/sitemap.xml', '/apple-icon', '/opengraph-image', '/templates/validore-report-template.pdf']) {
    const response = await get(path)
    assert.equal(response.status, 200, path)
    assert((await response.arrayBuffer()).byteLength > 20, path + ' is empty')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff', path)
    checks.push(path)
  }
  const unauthorized = await get('/api/cron/reset-credits')
  assert.equal(unauthorized.status, 401)
  assert.match(unauthorized.headers.get('cache-control') ?? '', /no-store/)
  await unauthorized.arrayBuffer()
  checks.push('unauthorized-cron')
  for (const format of ['pdf', 'white-label', 'docx', 'pptx']) {
    const response = await get('/__local_test/' + format)
    assert.equal(response.status, 200, format + ' rendering failed')
    const bytes = await response.arrayBuffer()
    if (format === 'docx' || format === 'pptx') {
      const zip = await JSZip.loadAsync(bytes)
      if (format === 'docx') assert.match(await zip.file('word/document.xml').async('string'), /Observation 59/)
      else assert.match(await zip.file('ppt/slides/slide1.xml').async('string'), /Synthetic Worker slide/)
    } else {
      const pdf = await PDFDocument.load(bytes)
      assert(pdf.getPageCount() > 1, 'Expected a paginated PDF')
      assert.equal(pdf.getAuthor(), format === 'white-label' ? '' : 'Validore')
    }
    checks.push('synthetic-' + format)
  }
  await mkdir('reports', { recursive: true })
  await writeFile('reports/cloudflare-smoke.json', JSON.stringify({ status: 'passed', checkedAt: new Date().toISOString(), checks,
    scope: 'Local workerd, built Next routes, synthetic document exports. No hosted account, database, payment or AI acceptance.' }, null, 2))
  console.log(`Cloudflare runtime smoke passed (${checks.length} checks).`)
} finally { stop() }
