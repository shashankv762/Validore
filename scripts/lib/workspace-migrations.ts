import { readFile } from 'node:fs/promises'

// This is an explicit upgrade from the owner-console schema, not a fresh
// database initializer. Subscription-price changes require separate approval.
export const WORKSPACE_MIGRATIONS = [
  '0007_starting_daily_manual_plans.sql',
  '0008_customer_feedback.sql',
  '0009_planning_module_requests.sql',
  '0010_planning_stage_checkpoints.sql',
  '0011_validation_entitlement_snapshot.sql',
  '0012_public_research_focus.sql',
  '0013_planning_context_snapshot.sql',
  '0014_validation_dispatch_outbox.sql',
  '0015_ai_execution_leases.sql',
] as const

export function workspaceMigrationOptions(args: string[]) {
  const allowed = new Set(['--apply', '--backup-confirmed', '--help'])
  if (args.some(arg => !allowed.has(arg))) throw new Error('Use --help to see the supported workspace migration options.')
  const apply = args.includes('--apply')
  if (apply && !args.includes('--backup-confirmed')) throw new Error('Take and verify a database backup before using --apply --backup-confirmed.')
  return { apply, help: args.includes('--help') }
}

/** Execute inside a single transaction so a failed upgrade leaves no partial schema. */
export async function applyWorkspaceMigrations(execute: (sql: string) => Promise<unknown>) {
  for (const filename of WORKSPACE_MIGRATIONS) {
    const source = await readFile(new URL('../../drizzle/' + filename, import.meta.url), 'utf8')
    // Reviewed deltas contain their own top-level transactions. The caller owns
    // the batch transaction; PostgreSQL must not commit it midway through.
    const sql = source.replace(/^(?:BEGIN|COMMIT);[ \t]*\r?$/gm, '')
    try { await execute(sql) }
    catch (cause) { throw new Error('Workspace migration ' + filename + ' failed.', { cause }) }
  }
}
