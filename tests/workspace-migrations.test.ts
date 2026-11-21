import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { getTableColumns, getTableName, is, Table } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { applyWorkspaceMigrations, workspaceMigrationOptions, WORKSPACE_MIGRATIONS } from '../scripts/lib/workspace-migrations'

const owner = '11111111-1111-4111-8111-111111111111'
const ideaId = '22222222-2222-4222-8222-222222222222'

describe('guarded upgrade from the deployed owner-console database', () => {
  it('requires explicit apply and verified-backup flags and excludes subscription-price changes', () => {
    expect(workspaceMigrationOptions([])).toEqual({ apply: false, help: false })
    expect(workspaceMigrationOptions(['--apply', '--backup-confirmed'])).toEqual({ apply: true, help: false })
    expect(() => workspaceMigrationOptions(['--apply'])).toThrow('verify a database backup')
    expect(() => workspaceMigrationOptions(['--force'])).toThrow('supported workspace migration options')
    expect(WORKSPACE_MIGRATIONS).toHaveLength(9)
    expect(WORKSPACE_MIGRATIONS.join(' ')).not.toContain('0016')
  })

  it('keeps dry runs disconnected and never prints database credentials', () => {
    const result = spawnSync(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('scripts/migrate-workspace.ts')], {
      encoding: 'utf8', windowsHide: true, timeout: 10_000,
      env: { ...process.env, DATABASE_URL: 'postgres://private-user:private-password@unreachable.invalid:6543/postgres' },
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('DRY RUN: no connection opened')
    expect(result.stdout).toContain('unreachable.invalid')
    expect(result.stdout + result.stderr).not.toMatch(/private-user|private-password/)
  })

  it('reproduces the deployed missing column, rolls back a failed upgrade, then restores all workspace schema without changing saved work', async () => {
    const client = new PGlite()
    const db = drizzle(client, { schema })
    try {
      const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
      for (const statement of await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))) await client.exec(statement)
      await client.exec('CREATE ROLE anon; CREATE ROLE authenticated;')
      await db.insert(schema.users).values({ id: owner, email: 'founder@example.test', supabaseId: 'auth-founder', creditBalance: 77, purchasedCredits: 31, rewardCredits: 9 })
      await db.insert(schema.ideas).values({ id: ideaId, userId: owner, name: 'Existing private idea', industry: 'Software', product: 'Stock planner',
        targetCustomer: 'Shops', location: 'India', businessModel: 'Subscription', coreProblem: 'PRIVATE problem', proposedSolution: 'PRIVATE solution' })
      await db.insert(schema.validationJobs).values({ userId: owner, ideaId, status: 'running' })
      await db.insert(schema.creditLedger).values({ userId: owner, amount: 31, transactionType: 'PURCHASE', description: 'Existing purchased credits' })
      await db.insert(schema.tierConfig).values({ tier: 'free', monthlyPriceCents: 0, monthlyCredits: 123, monthlyValidationLimit: 2,
        maxActiveIdeas: 1, maxConcurrentRequests: 1, maxTokensPerCall: 4000 })
      const snapshot = async () => ({ users: await db.select().from(schema.users), ideas: await db.select().from(schema.ideas),
        jobs: await db.select().from(schema.validationJobs), ledger: await db.select().from(schema.creditLedger), plans: await db.select().from(schema.tierConfig) })
      const before = await snapshot()
      await client.exec(`DROP TABLE ai_execution_leases, customer_feedback_analyses, customer_feedback, planning_module_requests;
        ALTER TABLE ideas DROP COLUMN public_research_focus;
        ALTER TABLE validation_jobs DROP COLUMN entitlement_snapshot, DROP COLUMN dispatched_at, DROP COLUMN dispatch_lease_expires_at;`)
      await expect(db.query.ideas.findMany()).rejects.toThrow('Failed query')

      let executed = 0
      await expect(client.transaction(async tx => applyWorkspaceMigrations(async sql => {
        if (++executed === 4) throw new Error('Synthetic upgrade interruption')
        await tx.exec(sql)
      }))).rejects.toThrow('0010_planning_stage_checkpoints.sql')
      expect((await client.query('SELECT 1 FROM information_schema.tables WHERE table_name = \'customer_feedback\'')).rows).toHaveLength(0)
      await expect(db.query.ideas.findMany()).rejects.toThrow('Failed query')

      await client.transaction(tx => applyWorkspaceMigrations(sql => tx.exec(sql)))
      expect(await snapshot()).toEqual(before)
      await client.transaction(tx => applyWorkspaceMigrations(sql => tx.exec(sql)))
      expect(await snapshot()).toEqual(before)
      expect((await db.query.ideas.findMany())[0].publicResearchFocus).toBeNull()

      const columns = (await client.query<{ table_name: string; column_name: string }>("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'")).rows
      for (const table of Object.values(schema)) {
        if (!is(table, Table)) continue
        for (const column of Object.values(getTableColumns(table))) {
          expect(columns.some(row => row.table_name === getTableName(table) && row.column_name === column.name), getTableName(table) + '.' + column.name).toBe(true)
        }
      }
      const access = (await client.query<{ name: string; rls: boolean; exposed: boolean }>(`SELECT c.relname AS name, c.relrowsecurity AS rls,
        (has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) AS exposed
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
        AND c.relname IN ('customer_feedback', 'customer_feedback_analyses', 'planning_module_requests', 'ai_execution_leases')`)).rows
      expect(access).toHaveLength(4)
      expect(access.every(table => table.rls && !table.exposed)).toBe(true)
    } finally { await client.close() }
  }, 30_000)
})
