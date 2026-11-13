import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import nextEnv from '@next/env'
import { validateBuildConfig } from './ci-config.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
// Match Next.js' production environment loading before validating the values
// that it will compile into the browser. Existing host variables take priority.
nextEnv.loadEnvConfig(root, false)
const environment = { ...process.env, NODE_ENV: 'production' }
if (environment.RENDER === 'true' || environment.RENDER_SERVICE_ID) environment.BUILD_PROFILE = 'release'
validateBuildConfig(environment)
const configuredRevision = environment.RENDER_GIT_COMMIT || environment.BUILD_COMMIT_SHA
const gitRevision = configuredRevision || spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).stdout?.trim()
if (/^[a-f0-9]{40}$/i.test(gitRevision || '')) environment.BUILD_COMMIT_SHA = gitRevision

const child = spawn(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'build', '--webpack'], {
  cwd: root, env: environment, windowsHide: true, stdio: 'inherit',
})
const interrupt = () => child.kill('SIGINT')
const terminate = () => child.kill('SIGTERM')
process.once('SIGINT', interrupt)
process.once('SIGTERM', terminate)
child.once('error', () => {
  console.error('Unable to start the build. Install dependencies with npm ci --include=dev.')
  process.exitCode = 1
})
child.once('close', async code => {
  process.removeListener('SIGINT', interrupt)
  process.removeListener('SIGTERM', terminate)
  if (code !== 0) { process.exitCode = code ?? 1; return }
  try { await import('./prepare-standalone.mjs') }
  catch (error) { console.error(error); process.exitCode = 1 }
})
