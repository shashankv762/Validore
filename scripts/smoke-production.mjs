import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { resolve, join, sep } from 'node:path'
import { mkdir, lstat, writeFile } from 'node:fs/promises'
import { realpath as resolveRealpath } from 'node:fs'
import { promisify } from 'node:util'

const realpath = promisify(resolveRealpath)

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
  assert(html.includes('rel="canonical"'), 'Landing canonical URL missing')
  assert(html.includes('property="og:image"') && html.includes('summary_large_image'), 'Social metadata missing')
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff', 'Content type protection missing')
  checksPassed.push('metadata-and-headers')
  const demo = await fetchPage('/demo')
  assert.equal(demo.status, 200, 'Sample report page failed')
  assert((await demo.text()).includes('Sample report.'), 'Sample must be clearly labeled')
  checksPassed.push('sample-report')
  const logo = await fetchPage('/logo/validore-favicon.svg')
  assert.equal(logo.status, 200, 'Public logo asset failed')
  assert((await logo.text()).includes('<svg'), 'Logo content is not SVG')
  checksPassed.push('logo')
  for (const path of ['/logo/validore-logo-dark.svg', '/logo/validore-logo-light.svg']) {
    const response = await fetchPage(path)
    assert.equal(response.status, 200, 'Brand artwork failed: ' + path)
    assert(response.headers.get('content-type')?.includes('image/svg+xml'), 'Brand artwork MIME type is incorrect')
  }
  for (const path of ['/opengraph-image', '/apple-icon']) {
    const response = await fetchPage(path)
    assert.equal(response.status, 200, 'Generated image failed: ' + path)
    assert(response.headers.get('content-type')?.includes('image/png'), 'Generated image is not PNG: ' + path)
    const bytes = new Uint8Array(await response.arrayBuffer())
    assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'Generated image has an invalid PNG signature')
  }
  checksPassed.push('brand-and-generated-images')
  const signin = await fetchPage('/auth/signin?next=%2Fdashboard%2Freports')
  assert.equal(signin.status, 200, 'Sign-in page failed')
  const signinHtml = await signin.text()
  assert(signinHtml.includes('action="/api/auth/signin"') && signinHtml.includes('action="/api/auth/google"'), 'Native authentication forms missing')
  assert(signinHtml.includes('name="next"') && signinHtml.includes('/dashboard/reports'), 'Sign-in return path missing')
  checksPassed.push('sign-in-rendering')
  const policy = signin.headers.get('content-security-policy') || ''
  const nonce = policy.match(/'nonce-([^']+)'/)?.[1]
  assert(nonce && signinHtml.includes('nonce="' + nonce + '"'), 'Dynamic auth scripts must use the response CSP nonce')
  assert(!policy.includes('unsafe-eval'), 'Production must not allow unsafe-eval')
  const secondSignin = await fetchPage('/auth/signin')
  assert.notEqual(secondSignin.headers.get('content-security-policy'), policy, 'Auth CSP nonce must change per response')
  await secondSignin.text()
  checksPassed.push('dynamic-csp')
  for (const path of ['/legal/terms', '/legal/privacy', '/legal/cookies', '/legal/refund', '/legal/acceptable-use']) {
    const response = await fetchPage(path)
    assert.equal(response.status, 200, 'Policy page failed: ' + path)
    const policyHtml = await response.text()
    assert(policyHtml.includes('Shashank V') && policyHtml.includes('India') && policyHtml.includes('aegixchainai@gmail.com'), 'Confirmed policy identity missing: ' + path)
  }
  checksPassed.push('policy-pages')
  const signup = await fetchPage('/auth/signup')
  const signupHtml = await signup.text()
  assert.equal(signup.status, 200, 'Signup page failed')
  assert(signupHtml.includes('name="consent"') && signupHtml.includes('name="policyVersion"'), 'Signup terms acceptance fields missing')
  checksPassed.push('signup-consent')
  const deniedOrigin = await fetch(base + '/api/ideas', { method: 'POST', headers: { origin: 'https://untrusted.example', 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(5000) })
  assert.equal(deniedOrigin.status, 403, 'API must reject a cross-origin mutation before accessing user data')
  const oversized = await fetch(base + '/api/ideas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(140_000) }), signal: AbortSignal.timeout(5000) })
  assert.equal(oversized.status, 413, 'API must reject an oversized request before authentication')
  for (const path of ['/api/me/data', '/api/ideas/11111111-1111-4111-8111-111111111111/interview']) {
    const response = await fetchPage(path)
    assert.equal(response.status, 401, 'Private data endpoint must require authentication: ' + path)
    assert(response.headers.get('cache-control')?.includes('no-store'), 'Private data endpoint must not be cached')
  }
  checksPassed.push('api-request-and-privacy-boundaries')
  const missing = await fetchPage('/missing-page-production-smoke')
  assert.equal(missing.status, 404, 'Missing page must return 404')
  assert((await missing.text()).includes('Page not found'), 'Missing-page recovery content missing')
  checksPassed.push('not-found-recovery')
  const robots = await fetchPage('/robots.txt')
  assert.equal(robots.status, 200, 'Robots endpoint failed')
  assert((await robots.text()).includes('Disallow:'), 'Private-route indexing rules missing')
  const sitemap = await fetchPage('/sitemap.xml')
  assert.equal(sitemap.status, 200, 'Sitemap endpoint failed')
  const sitemapXml = await sitemap.text()
  assert(sitemapXml.includes('/demo</loc>') && !sitemapXml.includes('/dashboard'), 'Sitemap must contain public pages only')
  checksPassed.push('search-indexing')
  const health = await fetchPage('/api/health')
  assert(health.headers.get('cache-control')?.split(',').map(value => value.trim()).includes('no-store'), 'Liveness must not be cached')
  checksPassed.push('cache-policy')
  const marketingHealth = await fetch(base + '/api/health', { headers: { Origin: 'https://validore.tech' }, signal: AbortSignal.timeout(5000) })
  assert.equal(marketingHealth.status, 200)
  assert.equal(marketingHealth.headers.get('access-control-allow-origin'), 'https://validore.tech', 'Marketing site must be able to read liveness')
  assert.equal(marketingHealth.headers.get('access-control-allow-credentials'), null, 'Liveness must never enable credentials')
  assert.deepEqual((({ status, service }) => ({ status, service }))(await marketingHealth.json()), { status: 'ok', service: 'validore' })
  const foreignHealth = await fetch(base + '/api/health', { headers: { Origin: 'https://untrusted.example' }, signal: AbortSignal.timeout(5000) })
  assert.equal(foreignHealth.headers.get('access-control-allow-origin'), null, 'Liveness must not reflect an untrusted origin')
  const marketingOptions = await fetch(base + '/api/health', { method: 'OPTIONS', headers: { Origin: 'https://validore.tech' }, signal: AbortSignal.timeout(5000) })
  assert.equal(marketingOptions.status, 204)
  assert.equal(marketingOptions.headers.get('access-control-allow-methods'), 'GET, HEAD, OPTIONS')
  checksPassed.push('marketing-liveness-cors')
  await writeReport('passed')
  console.log('Production smoke passed: ' + checksPassed.join(', '))
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
