import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { resolve, join, sep } from 'node:path'
import { mkdir, lstat, realpath, writeFile } from 'node:fs/promises'

await import('./prepare-standalone.mjs')
const reservation = createServer()
reservation.listen(0, '127.0.0.1')
await once(reservation, 'listening')
const port = reservation.address().port
await new Promise((done, fail) => reservation.close(error => error ? fail(error) : done()))
const child = spawn(process.execPath, [resolve('.next/standalone/server.js')], {
  cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: String(port) },
  windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
})
const checksPassed = []
const writeReport = async status => {
  const root = await realpath(process.cwd())
  const directory = join(root, 'reports')
  const existing = await lstat(directory).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw new Error('Invalid smoke report directory')
  await mkdir(directory, { recursive: true })
  if (!(await realpath(directory)).startsWith(root + sep)) throw new Error('Smoke report directory escaped workspace')
  const target = join(directory, 'production-smoke.json')
  const file = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  if (file && (!file.isFile() || file.isSymbolicLink())) throw new Error('Invalid smoke report path')
  await writeFile(target, JSON.stringify({ status, checkedAt: new Date().toISOString(), artifact: 'standalone', checksPassed }, null, 2) + '\n')
}
let logs = ''
let spawnError
child.stdout.on('data', data => { logs = (logs + data).slice(-65_536) })
child.stderr.on('data', data => { logs = (logs + data).slice(-65_536) })
child.on('error', error => { spawnError = error })
const closed = new Promise(done => child.once('close', done))
const base = 'http://127.0.0.1:' + port
const fetchPage = path => fetch(base + path, { signal: AbortSignal.timeout(5000) })
const stop = () => child.kill('SIGTERM')
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
try {
  const deadline = Date.now() + 45000
  let healthy = false
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError
    if (child.exitCode !== null) throw new Error('Production server exited before becoming healthy')
    try {
      const response = await fetchPage('/api/health')
      if (response.ok && (await response.json()).status === 'ok') { healthy = true; break }
    } catch {}
    await new Promise(done => setTimeout(done, 250))
  }
  assert(healthy, 'Production health endpoint did not become ready')
  checksPassed.push('liveness')
  const home = await fetchPage('/')
  assert.equal(home.status, 200, 'Landing page failed')
  const html = await home.text()
  assert(html.toLowerCase().includes('validore'), 'Landing page content missing')
  checksPassed.push('landing')
  const demo = await fetchPage('/demo')
  assert.equal(demo.status, 200, 'Classroom sample page failed')
  assert((await demo.text()).includes('Read-only classroom sample'), 'Sample must be clearly labeled')
  checksPassed.push('classroom-sample')
  const logo = await fetchPage('/logo/validore-favicon.svg')
  assert.equal(logo.status, 200, 'Public logo asset failed')
  assert((await logo.text()).includes('<svg'), 'Logo content is not SVG')
  checksPassed.push('logo')
  const health = await fetchPage('/api/health')
  assert.equal(health.headers.get('cache-control'), 'no-store', 'Liveness must not be cached')
  checksPassed.push('cache-policy')
  await writeReport('passed')
  console.log('Production smoke passed: liveness, landing, classroom sample, logo asset, cache policy')
} catch (error) {
  console.error(error)
  console.error(logs)
  await writeReport('failed').catch(() => console.error('Smoke failure report could not be written'))
  process.exitCode = 1
} finally {
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  if (child.exitCode === null) child.kill('SIGTERM')
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 5000)
  await closed
  clearTimeout(killTimer)
}
