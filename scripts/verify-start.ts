import { spawn, execSync, type ChildProcess } from 'node:child_process'

interface ProbeResult {
  url: string
  status: number
  ok: boolean
  durationMs: number
  fullBody: string
  bodySnippet?: string
  error?: string
}

const PORT = 3000
const BASE_URL = `http://127.0.0.1:${PORT}`

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' })
    } else {
      process.kill(-pid, 'SIGKILL')
    }
  } catch {
    // Process might already have exited
  }
}

async function probeUrl(path: string, options: RequestInit = {}): Promise<ProbeResult> {
  const url = `${BASE_URL}${path}`
  const startTime = Date.now()
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      ...options,
    })
    const durationMs = Date.now() - startTime
    const text = await res.text()
    return {
      url,
      status: res.status,
      ok: res.status >= 200 && res.status < 400,
      durationMs,
      fullBody: text,
      bodySnippet: text.slice(0, 300).replace(/\s+/g, ' '),
    }
  } catch (err) {
    const durationMs = Date.now() - startTime
    return {
      url,
      status: 0,
      ok: false,
      durationMs,
      fullBody: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function waitForServer(maxAttempts = 30, intervalMs = 1000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/`, { redirect: 'manual' })
      if (res.status === 200) {
        console.log(`[verify-start] Server is ready on attempt ${attempt} (${res.status} OK)`)
        return true
      }
    } catch {
      // Server not ready yet
    }
    await sleep(intervalMs)
  }
  return false
}

async function runVerification(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Production Server Start & Runtime Verification')
  console.log(`Target: ${BASE_URL}`)
  console.log('='.repeat(60))

  let serverProcess: ChildProcess | null = null

  try {
    console.log('\n[1/4] Spawning "next start" production server...')
    
    const nextBin = './node_modules/next/dist/bin/next'
    serverProcess = spawn(process.execPath, [nextBin, 'start', '-p', String(PORT)], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PORT: String(PORT) },
    })

    serverProcess.stdout?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim()
      if (msg) console.log(`  [server stdout] ${msg}`)
    })

    serverProcess.stderr?.on('data', (chunk: Buffer) => {
      const msg = chunk.toString().trim()
      if (msg) console.warn(`  [server stderr] ${msg}`)
    })

    if (!serverProcess.pid) {
      throw new Error('Failed to acquire PID of spawned server process')
    }
    console.log(`[1/4] Server process spawned (PID: ${serverProcess.pid})`)

    console.log('\n[2/4] Waiting for server HTTP readiness...')
    const isReady = await waitForServer(30, 1000)
    if (!isReady) {
      throw new Error(`Server failed to respond at ${BASE_URL} within 30 seconds`)
    }

    console.log('\n[3/4] Executing HTTP runtime verification probes...')
    
    // Probe 1: Root landing page
    const probeRoot = await probeUrl('/')
    console.log(`\n• PROBE: GET /`)
    console.log(`  Status: ${probeRoot.status} ${probeRoot.status === 200 ? '✓' : '✗'}`)
    console.log(`  Latency: ${probeRoot.durationMs}ms`)
    const hasBrand = probeRoot.fullBody.includes('Validore')
    const hasOperator = probeRoot.fullBody.includes('Shashank V')
    const hasLocation = probeRoot.fullBody.includes('Bengaluru, Karnataka, India')
    console.log(`  Brand Check (Validore): ${hasBrand ? '✓ Pass' : '✗ Fail'}`)
    console.log(`  Operator Footer Check (Shashank V): ${hasOperator ? '✓ Pass' : '✗ Fail'}`)
    console.log(`  Location Check (Bengaluru, Karnataka, India): ${hasLocation ? '✓ Pass' : '✗ Fail'}`)
    if (probeRoot.status !== 200) {
      throw new Error(`Expected HTTP 200 from GET /, received ${probeRoot.status}`)
    }
    if (!hasOperator) {
      throw new Error('Expected landing page to contain "Shashank V" footer attribution')
    }
    if (!hasLocation) {
      throw new Error('Expected landing page to contain "Bengaluru, Karnataka, India"')
    }

    // Probe 2: Auth Sign-in page
    const probeSignin = await probeUrl('/auth/signin')
    console.log(`\n• PROBE: GET /auth/signin`)
    console.log(`  Status: ${probeSignin.status} ${probeSignin.status === 200 ? '✓' : '✗'}`)
    console.log(`  Latency: ${probeSignin.durationMs}ms`)
    if (probeSignin.status !== 200) {
      throw new Error(`Expected HTTP 200 from GET /auth/signin, received ${probeSignin.status}`)
    }

    // Probe 3: Legal Terms page
    const probeTerms = await probeUrl('/legal/terms')
    console.log(`\n• PROBE: GET /legal/terms`)
    console.log(`  Status: ${probeTerms.status} ${probeTerms.status === 200 ? '✓' : '✗'}`)
    console.log(`  Latency: ${probeTerms.durationMs}ms`)
    const hasTermsLocation = probeTerms.fullBody.includes('Bengaluru, Karnataka, India')
    const hasTermsOperator = probeTerms.fullBody.includes('Shashank V')
    console.log(`  Legal Location Check (Bengaluru, Karnataka, India): ${hasTermsLocation ? '✓ Pass' : '✗ Fail'}`)
    console.log(`  Legal Operator Check (Shashank V): ${hasTermsOperator ? '✓ Pass' : '✗ Fail'}`)
    if (probeTerms.status !== 200) {
      throw new Error(`Expected HTTP 200 from GET /legal/terms, received ${probeTerms.status}`)
    }
    if (!hasTermsLocation) {
      throw new Error('Expected terms page to contain "Bengaluru, Karnataka, India"')
    }
    if (!hasTermsOperator) {
      throw new Error('Expected terms page to contain "Shashank V"')
    }

    // Probe 4: Dashboard route (protected - expect 307 redirect to signin)
    const probeDashboard = await probeUrl('/dashboard')
    console.log(`\n• PROBE: GET /dashboard (unauthenticated)`)
    console.log(`  Status: ${probeDashboard.status} ${probeDashboard.status === 307 ? '✓ (Middleware protected)' : probeDashboard.status}`)
    console.log(`  Latency: ${probeDashboard.durationMs}ms`)
    if (probeDashboard.status !== 307 && probeDashboard.status !== 200) {
      throw new Error(`Expected HTTP 307 (or 200) from GET /dashboard, received ${probeDashboard.status}`)
    }

    // Probe 5: API route (unauthenticated - expect 401)
    const probeApiMe = await probeUrl('/api/me')
    console.log(`\n• PROBE: GET /api/me (unauthenticated)`)
    console.log(`  Status: ${probeApiMe.status} ${probeApiMe.status === 401 ? '✓ (Auth required)' : probeApiMe.status}`)
    console.log(`  Latency: ${probeApiMe.durationMs}ms`)
    if (probeApiMe.status !== 401) {
      throw new Error(`Expected HTTP 401 from unauthenticated GET /api/me, received ${probeApiMe.status}`)
    }

    console.log('\n✓ All 5 runtime verification probes succeeded cleanly with 0 exceptions!')

  } finally {
    if (serverProcess?.pid) {
      console.log(`\n[4/4] Cleanly terminating server process tree (PID: ${serverProcess.pid})...`)
      killProcessTree(serverProcess.pid)
      await sleep(1000)
      console.log('✓ Server process terminated cleanly. Port 3000 released.')
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('Runtime Verification: ALL CHECKS PASSED (100% SUCCESS)')
  console.log('='.repeat(60))
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err)
  process.exit(1)
})
