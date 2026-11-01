import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Filename/ignore-policy checks only. This does not inspect secret values or
// upload files, and is not a replacement for a content-based secret scanner.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const excluded = [
  '.env.local', '.env.test.local', 'nested/.env.production', 'private/server.pem',
  'private/server.key', 'private/cert.p12', 'private/cert.pfx', 'private/store.jks',
  'private/service-account-admin.json', 'private/service_account_admin.json',
  'backups/account.dump', 'backups/account.dump.gz', 'backups/account.sql.gz',
  'reports/account-export.json', 'test-results/download.json', 'playwright-report/index.html',
  'blob-report/results.zip', 'playwright/.auth/session.json', 'nested/.auth/state.json',
  '.tmp/provider-response.json', 'tmp/archive.json', 'src/data/market/snapshot.tmp',
  '.classroom/config.json', '.agents/session.json', '.docker-auth.test/config.json',
  'node_modules/example/index.js', '.next/server/app.js', 'coverage/index.html',
  'debug.log', 'tsconfig.tsbuildinfo', '.vercel/project.json', '.venv/config.txt',
]
const included = [
  'package.json', 'package-lock.json', 'next.config.ts', 'vercel.json', 'tsconfig.json',
  'src/app/layout.tsx', 'src/lib/interview/schema.ts', 'src/lib/ai/research-store.ts',
  'src/data/market/seed-sources.json', 'src/data/market/source-catalog.json',
  'src/data/market/world-bank-metadata.json', 'src/data/market/refresh-status.json',
  'scripts/refresh-market-snapshot.mjs', 'drizzle/0003_founder_interviews_research.sql',
  'public/fonts/NotoSans-Regular.ttf', 'public/fonts/NOTO-LICENSE.txt',
  'public/logo/validore-report.png', 'public/templates/validore-report-template.pdf',
  'public/templates/validore-report-template.docx', 'README.md', 'LICENSE',
]
const environment = { ...process.env }
for (const name of Object.keys(environment)) if (name.startsWith('GIT_')) delete environment[name]
const git = (cwd, args, input, allowed = [0]) => {
  const result = spawnSync('git', ['-c', 'core.excludesFile=', ...args], { cwd, env: environment, input, encoding: 'utf8', windowsHide: true })
  if (result.error) throw new Error('Git is required for release-file checks: ' + result.error.message)
  if (!allowed.includes(result.status)) throw new Error('Git check failed: ' + result.stderr.trim())
  return result.stdout
}

const temporaryRoot = realpathSync(tmpdir())
const temporary = mkdtempSync(resolve(temporaryRoot, 'validore-release-check-'))
const checks = []
try {
  git(temporary, ['init', '--quiet', '--template='])
  for (const policy of ['.gitignore', '.vercelignore']) {
    writeFileSync(resolve(temporary, '.gitignore'), readFileSync(resolve(root, policy)))
    const keep = policy === '.gitignore' ? [...included, '.env.example'] : included
    const reject = policy === '.vercelignore' ? [...excluded, '.env.example'] : excluded
    const ignored = new Set(git(temporary, ['check-ignore', '--no-index', '-z', '--stdin'], [...reject, ...keep].join('\0') + '\0', [0, 1]).split('\0').filter(Boolean))
    for (const path of reject) assert(ignored.has(path), policy + ' must exclude ' + path)
    for (const path of keep) {
      assert(existsSync(resolve(root, path)), 'Required release input is missing: ' + path)
      assert(!ignored.has(path), policy + ' hides required release input ' + path)
    }
    checks.push({ policy, excluded: reject.length, included: keep.length })
  }
  const trackedIgnored = git(root, ['ls-files', '-ci', '--exclude-standard', '-z']).split('\0').filter(path => path && existsSync(resolve(root, path)))
  assert.equal(trackedIgnored.length, 0, 'Ignored files are still tracked; review them explicitly: ' + trackedIgnored.join(', '))
  console.log(JSON.stringify({ status: 'passed', checks, trackedIgnoredFiles: trackedIgnored.length,
    scope: 'Git ignore matching for source control and Vercel CLI upload inputs. No deployment or content-based secret scan.' }, null, 2))
} finally {
  // Verify the absolute resolved target before recursively removing this script's
  // own temporary repository. Never remove any path in the source workspace.
  const target = realpathSync(temporary)
  const within = relative(temporaryRoot, target)
  if (within && !within.startsWith('..') && !isAbsolute(within) && basename(target).startsWith('validore-release-check-')) rmSync(target, { recursive: true, force: true })
  else throw new Error('Temporary cleanup target is outside the expected directory')
}
