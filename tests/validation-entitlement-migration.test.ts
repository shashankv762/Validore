import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

describe('validation entitlement snapshot migration', () => {
  it('upgrades existing jobs without rewriting them and permits new JSON snapshots idempotently', async () => {
    const db = new PGlite()
    try {
      await db.exec(`CREATE TABLE validation_jobs (id integer PRIMARY KEY, status text NOT NULL);
        INSERT INTO validation_jobs VALUES (1, 'pending');`)
      const migration = readFileSync('drizzle/0011_validation_entitlement_snapshot.sql', 'utf8')
      await db.exec(migration); await db.exec(migration)

      const column = await db.query<{ data_type: string; is_nullable: string }>(`
        SELECT data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'validation_jobs' AND column_name = 'entitlement_snapshot'`)
      expect(column.rows).toEqual([{ data_type: 'jsonb', is_nullable: 'YES' }])
      const legacy = await db.query<{ id: number; status: string; entitlement_snapshot: unknown }>(
        'SELECT id, status, entitlement_snapshot FROM validation_jobs WHERE id = 1')
      expect(legacy.rows).toEqual([{ id: 1, status: 'pending', entitlement_snapshot: null }])

      const snapshot = { version: 1, tier: 'free', creditCost: 50 }
      await db.query('INSERT INTO validation_jobs (id, status, entitlement_snapshot) VALUES (2, $1, $2::jsonb)',
        ['pending', JSON.stringify(snapshot)])
      const stored = await db.query<{ id: number; entitlement_snapshot: unknown }>(
        'SELECT id, entitlement_snapshot FROM validation_jobs ORDER BY id')
      expect(stored.rows).toEqual([{ id: 1, entitlement_snapshot: null }, { id: 2, entitlement_snapshot: snapshot }])
    } finally { await db.close() }
  })
})
