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
  'src/data/market/bundle.json.previous.json', '.agents/session.json', '.docker-auth.test/config.json',
  'node_modules/example/index.js', '.next/server/app.js', 'coverage/index.html',
  'debug.log', 'tsconfig.tsbuildinfo', '.dev.vars', '.dev.vars.production', '.venv/config.txt',
]
const included = [
  'package.json', 'package-lock.json', 'next.config.ts', 'tsconfig.json',
  'scripts/prepare-standalone.mjs', 'scripts/smoke-production.mjs',
  'static webpage/package.json', 'static webpage/scripts/check.mjs',
  'static webpage/public/index.html', 'static webpage/public/404.html',
  'static webpage/public/styles.css', 'static webpage/public/site.js', 'static webpage/public/wake.js',
  'static webpage/public/_headers', 'static webpage/public/_redirects',
  'static webpage/public/robots.txt', 'static webpage/public/sitemap.xml',
  'src/app/layout.tsx', 'src/app/api/pricing/currency/route.ts', 'src/lib/interview/schema.ts', 'src/lib/ai/research-store.ts',
  'src/data/market/NOTICE.txt', 'src/data/market/seed-sources.json', 'src/data/market/source-catalog.json',
  'src/data/market/world-bank-metadata.json', 'src/data/market/refresh-status.json',
  'src/data/market/trend-series.json', 'src/lib/ai/market-trends.ts', 'src/lib/validation/knowledge/playbooks.ts',
  'src/data/market/bundle.json', 'src/lib/ai/bundled-market.ts', 'src/lib/ai/market-bundle.mjs',
  'src/lib/daily-credits.ts', 'src/components/DailyCredits.tsx', 'src/lib/customer-feedback/schema.ts',
  'src/lib/customer-feedback/store.ts', 'src/lib/customer-feedback/public-reviews.ts', 'src/components/CustomerEvidence.tsx',
  'src/lib/planning/requests.ts', 'src/lib/planning/run-identity.ts',
  'drizzle/0007_starting_daily_manual_plans.sql', 'drizzle/0008_customer_feedback.sql', 'drizzle/0009_planning_module_requests.sql',
  'drizzle/0010_planning_stage_checkpoints.sql', 'drizzle/0011_validation_entitlement_snapshot.sql',
  'drizzle/0012_public_research_focus.sql',
  'drizzle/0013_planning_context_snapshot.sql', 'drizzle/0014_validation_dispatch_outbox.sql',
  'drizzle/0015_ai_execution_leases.sql', 'drizzle/0016_subscription_prices.sql',
  'scripts/refresh-market-snapshot.mjs', 'drizzle/0003_founder_interviews_research.sql', 'drizzle/0004_rewarded_ads.sql',
  'scripts/ci-config.mjs', 'scripts/test-ci.mjs', 'scripts/build-deploy.mjs', 'scripts/test-postgres.ts',
  '.github/workflows/ci.yml', 'render.yaml', 'drizzle/0005_credit_cycle_start.sql', 'drizzle/0006_admin_command_center.sql',
  'src/app/admin/page.tsx', 'src/lib/admin-access.ts', 'src/lib/admin-actions.ts',
  'src/lib/ads/rewards.ts', 'src/components/RewardedCredits.tsx',
  'AGENTS.md', 'CLAUDE.md',
  'public/fonts/NotoSans-Regular.ttf', 'public/fonts/NOTO-LICENSE.txt',
  'public/fonts/NotoSansDevanagari-Regular.ttf', 'public/fonts/NotoSansDevanagari-Bold.ttf', 'public/fonts/DEVANAGARI-PROVENANCE.txt',
  'src/lib/exports/pdf-text.ts',
  'public/logo/validore-report.png', 'public/templates/validore-report-template.pdf',
  'public/templates/validore-report-template.docx', '.env.example', 'LICENSE',
  'public/templates/manifest.json',
  'public/templates/validore-decision-brief-template.pdf', 'public/templates/validore-decision-brief-template.docx',
  'public/templates/validore-lean-canvas-template.pdf', 'public/templates/validore-lean-canvas-template.docx',
  'public/templates/validore-lean-canvas-a3-template.pdf',
  'public/templates/validore-canvas-evidence-workbook.pdf', 'public/templates/validore-canvas-evidence-workbook.docx',
  'public/templates/validore-report-example.pdf', 'public/templates/validore-report-example.docx',
  'public/templates/validore-lean-canvas-example.pdf', 'public/templates/validore-lean-canvas-example.docx',
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
try {
  const policy = '.gitignore'
  git(temporary, ['init', '--quiet', '--template='])
  writeFileSync(resolve(temporary, policy), readFileSync(resolve(root, policy)))
  const ignored = new Set(git(temporary, ['check-ignore', '--no-index', '-z', '--stdin'], [...excluded, ...included].join('\0') + '\0', [0, 1]).split('\0').filter(Boolean))
  for (const path of excluded) assert(ignored.has(path), policy + ' must exclude ' + path)
  for (const path of included) {
    assert(existsSync(resolve(root, path)), 'Required release input is missing: ' + path)
    assert(!ignored.has(path), policy + ' hides required release input ' + path)
  }
  const trackedIgnored = git(root, ['ls-files', '-ci', '--exclude-standard', '-z']).split('\0').filter(path => path && existsSync(resolve(root, path)))
  assert.equal(trackedIgnored.length, 0, 'Ignored files are still tracked; review them explicitly: ' + trackedIgnored.join(', '))
  console.log(JSON.stringify({ status: 'passed', checks: [{ policy, excluded: excluded.length, included: included.length }],
    trackedIgnoredFiles: trackedIgnored.length, scope: 'Git file boundaries for the Render app and Cloudflare landing page. No deployment or content-based secret scan.' }, null, 2))
} finally {
  // Verify the absolute resolved target before recursively removing this script's
  // own temporary repository. Never remove any path in the source workspace.
  const target = realpathSync(temporary)
  const within = relative(temporaryRoot, target)
  if (within && !within.startsWith('..') && !isAbsolute(within) && basename(target).startsWith('validore-release-check-')) rmSync(target, { recursive: true, force: true })
  else throw new Error('Temporary cleanup target is outside the expected directory')
}
