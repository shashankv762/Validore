import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

describe('saved planning context and validation dispatch migrations', () => {
  it('adds bounded private context and dispatch leases idempotently', async () => {
    const db = new PGlite()
    try {
      await db.exec('CREATE TABLE public.planning_module_requests (id integer PRIMARY KEY); CREATE TABLE public.validation_jobs (id integer PRIMARY KEY);')
      const contextMigration = readFileSync('drizzle/0013_planning_context_snapshot.sql', 'utf8')
      const dispatchMigration = readFileSync('drizzle/0014_validation_dispatch_outbox.sql', 'utf8')
      await db.exec(contextMigration); await db.exec(dispatchMigration)
      await db.exec(contextMigration); await db.exec(dispatchMigration)

      const columns = await db.query<{ table_name: string; column_name: string }>(`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND (table_name = 'planning_module_requests' OR table_name = 'validation_jobs')`)
      expect(columns.rows).toEqual(expect.arrayContaining([
        { table_name: 'planning_module_requests', column_name: 'context_snapshot' },
        { table_name: 'validation_jobs', column_name: 'dispatched_at' },
        { table_name: 'validation_jobs', column_name: 'dispatch_lease_expires_at' },
      ]))

      await db.query('INSERT INTO public.planning_module_requests (id, context_snapshot) VALUES (1, $1::jsonb)', [JSON.stringify({ source: 'captured brief' })])
      await expect(db.query('INSERT INTO public.planning_module_requests (id, context_snapshot) VALUES (2, $1::jsonb)', [JSON.stringify('x'.repeat(256_001))])).rejects.toThrow()
      await db.query(`INSERT INTO public.validation_jobs (id, dispatched_at, dispatch_lease_expires_at) VALUES
        (1, '2026-11-17T10:00:00Z', '2026-11-17T10:01:00Z')`)
      const dispatch = await db.query<{ dispatched_at: Date; dispatch_lease_expires_at: Date }>(
        'SELECT dispatched_at, dispatch_lease_expires_at FROM public.validation_jobs WHERE id = 1')
      expect(dispatch.rows[0].dispatched_at).not.toBeNull()
      expect(dispatch.rows[0].dispatch_lease_expires_at).not.toBeNull()
    } finally { await db.close() }
  })
})
