import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

describe('local PostgreSQL-compatible public research topic migration', () => {
  it('keeps existing private briefs generic, can be reapplied, and bounds stored public topics', async () => {
    const db = new PGlite()
    try {
      await db.exec("CREATE TABLE ideas (id integer PRIMARY KEY, core_problem text, proposed_solution text); INSERT INTO ideas VALUES (1, 'PRIVATE-PROBLEM', 'PRIVATE-SOLUTION');")
      const migration = readFileSync('drizzle/0012_public_research_focus.sql', 'utf8')
      await db.exec(migration); await db.exec(migration)
      const result = await db.query<{ public_research_focus: string | null }>('SELECT public_research_focus FROM ideas')
      expect(result.rows[0].public_research_focus).toBeNull()
      await db.query('UPDATE ideas SET public_research_focus = $1', ['Inventory reconciliation using spreadsheets'])
      await expect(db.query('UPDATE ideas SET public_research_focus = $1', ['x'.repeat(281)])).rejects.toThrow()
      const stored = await db.query<{ public_research_focus: string }>('SELECT public_research_focus FROM ideas')
      expect(stored.rows[0].public_research_focus).toBe('Inventory reconciliation using spreadsheets')
    } finally { await db.close() }
  })
})
