import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

describe('shared AI execution capacity leases', () => {
  it('adds an expiring owner-scoped lease table with browser-role access revoked, idempotently', async () => {
    const client = new PGlite()
    try {
      await client.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
        CREATE TABLE public.users (id uuid PRIMARY KEY);
        INSERT INTO public.users VALUES ('11111111-1111-4111-8111-111111111111');`)
      const migration = await readFile(new URL('../drizzle/0015_ai_execution_leases.sql', import.meta.url), 'utf8')
      await client.exec(migration); await client.exec(migration)
      await client.exec(`INSERT INTO public.ai_execution_leases (user_id, lease_kind, expires_at)
        VALUES ('11111111-1111-4111-8111-111111111111', 'customer-feedback-analysis', now() + interval '1 minute')`)
      expect(Number((await client.query<{ count: number }>('SELECT count(*)::int AS count FROM public.ai_execution_leases')).rows[0].count)).toBe(1)
      expect((await client.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_execution_leases'::regclass`)).rows[0].relrowsecurity).toBe(true)
      await client.exec('SET ROLE authenticated')
      await expect(client.query('SELECT * FROM public.ai_execution_leases')).rejects.toThrow()
      await client.exec('RESET ROLE')
      const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ai_execution_leases_expiry_idx'")
      expect(indexes.rows).toHaveLength(1)
    } finally { await client.close() }
  })
})
