import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import * as schema from '../src/db/schema'

// This runner never reads .env.local. It provisions a disposable schema on an
// explicitly supplied, local PostgreSQL server and runs the real multi-client
// tests. Hosted/customer databases are not valid targets for this command.
async function main() {
const root = fileURLToPath(new URL('../', import.meta.url))
const target = process.env.TEST_DATABASE_URL
if (!target) throw new Error('Set TEST_DATABASE_URL to a disposable local PostgreSQL database')
const parsed = new URL(target)
if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
  throw new Error('PostgreSQL integration tests require an explicit loopback database')
}
const schemaName = 'validore_test_' + randomUUID().replaceAll('-', '')
const administrator = postgres(target, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} })
let created = false
try {
  await administrator.unsafe(`CREATE SCHEMA "${schemaName}"`)
  created = true
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  await administrator.begin(async tx => {
    await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)
    // Supabase browser roles exist in production. Local PostgreSQL needs these
    // non-login test roles so the actual access-restriction migrations run too.
    await tx.unsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`)
    for (const statement of statements) await tx.unsafe(statement.replaceAll('"public".', `"${schemaName}".`))
  })
  for (const filename of ['0000_credit_payment_idempotency.sql', '0001_application_access_and_indexes.sql',
    '0002_free_model_default.sql', '0003_founder_interviews_research.sql', '0004_rewarded_ads.sql', '0005_credit_cycle_start.sql', '0006_admin_command_center.sql', '0007_starting_daily_manual_plans.sql', '0008_customer_feedback.sql', '0009_planning_module_requests.sql',
    '0010_planning_stage_checkpoints.sql', '0011_validation_entitlement_snapshot.sql', '0012_public_research_focus.sql',
    '0013_planning_context_snapshot.sql', '0014_validation_dispatch_outbox.sql', '0015_ai_execution_leases.sql', '0016_subscription_prices.sql']) {
    const migration = (await readFile(resolve(root, 'drizzle', filename), 'utf8'))
      .replaceAll('public.', `"${schemaName}".`)
    // Each reviewed migration contains its own transaction, except 0000/0002.
    await administrator.unsafe(`SET search_path TO "${schemaName}", public`)
    await administrator.unsafe(migration)
    if (['0006_admin_command_center.sql', '0007_starting_daily_manual_plans.sql', '0008_customer_feedback.sql', '0009_planning_module_requests.sql', '0010_planning_stage_checkpoints.sql', '0011_validation_entitlement_snapshot.sql', '0012_public_research_focus.sql', '0013_planning_context_snapshot.sql', '0014_validation_dispatch_outbox.sql', '0015_ai_execution_leases.sql', '0016_subscription_prices.sql'].includes(filename)) await administrator.unsafe(migration)
  }
  const scoped = new URL(target)
  scoped.searchParams.set('options', `-c search_path=${schemaName}`)
  console.log('Running PostgreSQL transaction and ownership tests in an isolated schema')
  const child = spawn(process.execPath, [resolve(root, 'scripts/test-ci.mjs'),
    'tests/database-release.test.ts', 'src/lib/auth-sync.test.ts', 'tests/admin-postgres.test.ts', '--no-file-parallelism'], {
    cwd: root, env: { ...process.env, TEST_DATABASE_URL: scoped.toString(), DATABASE_URL: scoped.toString(), DB_MAX_CONNECTIONS: '4' },
    stdio: 'inherit', windowsHide: true,
  })
  const code = await new Promise<number>((done, fail) => { child.once('error', fail); child.once('close', value => done(value ?? 1)) })
  if (code !== 0) process.exitCode = code
} finally {
  // The only removable target is the fresh UUID schema created above on the
  // verified loopback database. No application/public schema is dropped.
  if (created && /^validore_test_[a-f0-9]{32}$/.test(schemaName)) await administrator.unsafe(`DROP SCHEMA "${schemaName}" CASCADE`)
  await administrator.end({ timeout: 5 })
}
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'PostgreSQL release tests failed')
  process.exitCode = 1
})
