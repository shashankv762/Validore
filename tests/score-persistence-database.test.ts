import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
import { db } from '@/db'
import * as schema from '@/db/schema'
import { completeValidationJob } from '@/lib/validation/jobs'
import { clampScore, normalizeValidationScores } from '@/lib/scoring'
import { PIPELINE_LITE_REPLY } from './fixtures/agent-payloads'

const owner = '11111111-1111-4111-8111-111111111111'
const idea = '22222222-2222-4222-8222-222222222222'
const job = '33333333-3333-4333-8333-333333333333'
const { users, ideas, validationJobs, validationReports, pitchDecks, crowdfundingAnalyses, pricingSimulations } = schema
beforeAll(async () => {
  // Use the actual application schema, including account status and ownership FKs.
  const { generateDrizzleJson, generateMigration } = await import('drizzle-kit/api')
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema))
  for (const statement of statements) await state.client.exec(statement)
  await db.insert(users).values({ id: owner, email: 'scores@example.test', supabaseId: 'score-fixture-identity', accountStatus: 'active' })
  await db.insert(ideas).values({ id: idea, userId: owner, name: 'Score fixture', industry: 'Software', product: 'Planning workspace',
    targetCustomer: 'Founders', location: 'India', businessModel: 'Subscription', coreProblem: 'Missing evidence', proposedSolution: 'Structured research' })
  await db.insert(validationJobs).values({ id: job, userId: owner, ideaId: idea, status: 'running', isLite: true })
}, 30_000)
afterAll(() => state.client.close())
describe('Fractional AI scores in PostgreSQL', () => {
  it('saves a cached fractional report once with consistent whole-point totals', async () => {
    const report = { ...PIPELINE_LITE_REPLY, problemScore: 12.5, marketScore: 6.4, financialScore: 9.1,
      overallScore: 999, provider: 'synthetic', tokensUsed: 17 } as Parameters<typeof completeValidationJob>[1]
    const savedId = await completeValidationJob(job, report)
    expect(await completeValidationJob(job, report)).toBe(savedId)
    const [saved] = await db.select().from(validationReports).where(eq(validationReports.id, savedId))
    const expected = normalizeValidationScores(report)
    expect(saved).toMatchObject({ problemScore: 13, marketScore: 6, financialScore: 5, overallScore: expected.overallScore,
      reportData: { problemScore: 13, overallScore: expected.overallScore } })
    expect(await db.select().from(validationReports)).toHaveLength(1)
  })
  it('writes normalized planning scores into actual integer columns', async () => {
    const quality = clampScore(12.5, 20) + clampScore(7.2, 10)
    const pitch = await db.insert(pitchDecks).values({ userId: owner, ideaId: idea,
      qualityScore: quality, founderReadinessScore: clampScore(64.5, 100) }).returning({ quality: pitchDecks.qualityScore, readiness: pitchDecks.founderReadinessScore })
    const campaign = await db.insert(crowdfundingAnalyses).values({ userId: owner, ideaId: idea,
      performanceScore: clampScore(74.7, 100) }).returning({ score: crowdfundingAnalyses.performanceScore })
    const pricing = await db.insert(pricingSimulations).values({ userId: owner, ideaId: idea,
      pricingScore: clampScore(49.5, 100) }).returning({ score: pricingSimulations.pricingScore })
    expect(pitch).toEqual([{ quality: 20, readiness: 65 }])
    expect(campaign).toEqual([{ score: 75 }]); expect(pricing).toEqual([{ score: 50 }])
  })
})
