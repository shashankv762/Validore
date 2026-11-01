import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// Render supplies NODE_ENV=production. Run tests in their own test environment
// without changing the production build that follows, on Windows and Linux.
const child = spawn(process.execPath, [
  fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run',
  ...process.argv.slice(2),
], {
  cwd: fileURLToPath(new URL('../', import.meta.url)),
  env: { ...process.env, NODE_ENV: 'test', CI: 'true' },
  windowsHide: true,
  stdio: 'inherit',
})
const interrupt = () => child.kill('SIGINT')
const terminate = () => child.kill('SIGTERM')
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
child.once('error', () => {
  console.error('Unable to start the test runner. Install development dependencies with npm ci --include=dev.')
  process.exitCode = 1
})
child.once('close', code => {
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', terminate)
  process.exitCode = code ?? 1
})
