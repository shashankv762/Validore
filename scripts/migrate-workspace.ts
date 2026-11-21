import { config } from 'dotenv'
import postgres from 'postgres'
import { applyWorkspaceMigrations, workspaceMigrationOptions, WORKSPACE_MIGRATIONS } from './lib/workspace-migrations'
import { databaseErrorCode } from '../src/lib/database-errors'

async function main() {
  const options = workspaceMigrationOptions(process.argv.slice(2))
  if (options.help) {
    console.log('Usage: npm run db:migrate:workspace -- [--apply --backup-confirmed]')
    console.log('The default is a dry run. Review the target, verify a backup, and test in staging before applying.')
    return
  }
  config({ path: new URL('../.env.local', import.meta.url), quiet: true })
  const target = process.env.DATABASE_URL
  let url: URL | undefined
  if (target) {
    try { url = new URL(target) } catch { throw new Error('DATABASE_URL must be a PostgreSQL connection URL.') }
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL connection URL.')
  }
  console.log('Database host: ' + (url?.hostname ?? 'not configured'))
  console.log('Workspace upgrade: reviewed deltas 0007–0015, in order:')
  WORKSPACE_MIGRATIONS.forEach(filename => console.log('  ' + filename))
  console.log('Existing balances, ledger entries and private briefs are preserved. The legacy, unedited Free plan allocation is updated by 0007; owner-saved plan settings are preserved.')
  console.log('Subscription prices (0016) are not changed by this command.')
  if (!options.apply) {
    console.log('DRY RUN: no connection opened and no database changes made. After verifying a backup, use --apply --backup-confirmed, then npm run db:verify.')
    return
  }
  if (!target) throw new Error('DATABASE_URL is required to apply workspace migrations.')
  const client = postgres(target, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {},
    connection: { application_name: 'validore-workspace-upgrade', lock_timeout: 5000, statement_timeout: 60_000 } })
  try {
    await client.begin(async tx => {
      await tx.unsafe('SET LOCAL search_path TO public')
      const [lock] = await tx`SELECT pg_try_advisory_xact_lock(hashtext('validore:workspace-upgrade')) AS acquired`
      if (!lock.acquired) throw new Error('Another workspace upgrade is running. No changes were made.')
      const baseline = await tx`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
        AND table_name IN ('users', 'ideas', 'tier_config', 'credit_ledger', 'validation_jobs', 'platform_settings', 'admin_audit_log')`
      if (baseline.length !== 7) throw new Error('The owner-console baseline is required. Review earlier deltas in docs/PRODUCTION_SETUP.md.')
      await applyWorkspaceMigrations(sql => tx.unsafe(sql))
    })
    console.log('Workspace upgrade committed. Run npm run db:verify and check the authenticated workspace before deployment.')
  } finally { await client.end({ timeout: 5 }) }
}

main().catch(error => {
  // PostgreSQL/Drizzle error messages can contain SQL, parameters or credentials.
  const message = error instanceof Error && (error.message.startsWith('Workspace migration ') || error.message.startsWith('Another workspace upgrade') ||
    error.message.startsWith('The owner-console baseline') || error.message.startsWith('Take and verify') || error.message.startsWith('Use --help') ||
    error.message.startsWith('DATABASE_URL')) ? error.message : 'Workspace upgrade failed. No changes were committed.'
  console.error(message, { code: databaseErrorCode(error) })
  process.exitCode = 1
})
