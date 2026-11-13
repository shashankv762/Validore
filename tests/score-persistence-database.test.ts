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
import { validationJobs, validationReports, pitchDecks, crowdfundingAnalyses, pricingSimulations } from '@/db/schema'
import { completeValidationJob } from '@/lib/validation/jobs'
import { clampScore, normalizeValidationScores } from '@/lib/scoring'
import { PIPELINE_LITE_REPLY } from './fixtures/agent-payloads'

const owner = '11111111-1111-4111-8111-111111111111'
const idea = '22222222-2222-4222-8222-222222222222'
const job = '33333333-3333-4333-8333-333333333333'
beforeAll(async () => {
  await state.client.exec(`CREATE TYPE job_status AS ENUM ('pending','running','partial','complete','failed');
    CREATE TYPE decision AS ENUM ('GO','MODIFY','TEST_FURTHER','NO_GO');
    CREATE TABLE validation_jobs (id uuid PRIMARY KEY, user_id uuid NOT NULL, idea_id uuid NOT NULL,
      status job_status NOT NULL, is_lite boolean NOT NULL, total_sections integer NOT NULL DEFAULT 0,
      completed_sections integer NOT NULL DEFAULT 0, tokens_used integer NOT NULL DEFAULT 0,
      estimated_cost_usd text, error_message text, ai_provider text, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now());
    CREATE TABLE validation_reports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL UNIQUE,
      idea_id uuid NOT NULL, user_id uuid NOT NULL, share_token uuid NOT NULL,
      overall_score integer, problem_score integer, customer_score integer, market_score integer,
      competitive_score integer, wtp_score integer, business_model_score integer, financial_score integer, execution_score integer,
      decision decision, decision_reasons jsonb, key_evidence jsonb, key_risks jsonb, action_plan jsonb,
      report_data jsonb, is_lite boolean NOT NULL, status text, created_at timestamp DEFAULT now());
    CREATE TABLE pitch_decks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, idea_id uuid NOT NULL,
      quality_score integer, founder_readiness_score integer, slides jsonb, pitch_script_3min text, pitch_script_60sec text,
      investor_qa jsonb, portfolio_sections jsonb, roadmap jsonb, milestones jsonb, report_data jsonb, created_at timestamp DEFAULT now());
    CREATE TABLE crowdfunding_analyses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, idea_id uuid NOT NULL,
      performance_score integer, classification_band text, funding_goal integer, expected_funding integer, expected_backers integer,
      conversion_rate text, reward_tiers jsonb, scenario_analysis jsonb, marketing_channels jsonb, prelaunch_plan jsonb,
      risk_register jsonb, recommendation text, report_data jsonb, created_at timestamp DEFAULT now());
    CREATE TABLE pricing_simulations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, idea_id uuid NOT NULL,
      pricing_score integer, scenarios jsonb, sensitivity_matrix jsonb, recommended_price text, competitor_prices jsonb,
      validation_plan jsonb, report_data jsonb, created_at timestamp DEFAULT now());`)
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
