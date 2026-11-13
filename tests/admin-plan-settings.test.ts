import { readFile } from 'node:fs/promises'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { tierConfig } from '@/db/schema'
import { getPlatformSettings, savePlatformSettings, toAdminSettings } from '@/lib/platform-settings'
import { getPlan, getPlanCatalog, getPlanBillingAvailability, getPublicPlanCatalog, PlanUpdateSchema, resolvePlan, tierForStripePrice, toAdminPlan, updatePlan } from '@/lib/plan-catalog'
import { formatUsd } from '@/lib/plans'
import { legacyTierConfigSql } from './fixtures/tier-config-sql'

const state = vi.hoisted(() => ({ client: null as unknown as PGlite, price: vi.fn() }))
vi.mock('@/db', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('@/db/schema')
  state.client = new PGlite()
  return { db: drizzle(state.client, { schema }) }
})
vi.mock('@/lib/stripe-client', () => ({ stripeBillingClient: () => ({ prices: { retrieve: state.price } }) }))

const owner = '11111111-1111-4111-8111-111111111111'
const validPrice = (amount = 2900) => ({ active: true, currency: 'usd', unit_amount: amount, billing_scheme: 'per_unit', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } })
beforeAll(async () => {
  await state.client.exec("CREATE TYPE tier AS ENUM ('free','premium','max_premium'); CREATE TABLE users (id uuid PRIMARY KEY, created_at timestamp DEFAULT now());")
  await state.client.exec(legacyTierConfigSql)
  await state.client.exec(await readFile(new URL('../drizzle/0006_admin_command_center.sql', import.meta.url), 'utf8'))
  await state.client.exec(`CREATE OR REPLACE FUNCTION pg_advisory_xact_lock(integer) RETURNS void LANGUAGE SQL AS 'SELECT NULL::void'; INSERT INTO users(id) VALUES ('${owner}');`)
}, 30000)
beforeEach(async () => {
  await state.client.exec('TRUNCATE tier_config, platform_settings')
  vi.stubEnv('DATABASE_URL', 'postgres://isolated-test')
  vi.stubEnv('STRIPE_SECRET_KEY', '')
  vi.stubEnv('STRIPE_PREMIUM_PRICE_ID', 'price_legacy')
  vi.stubEnv('STRIPE_MAX_PREMIUM_PRICE_ID', 'price_max')
  state.price.mockReset()
})
afterEach(() => vi.unstubAllEnvs())
afterAll(() => state.client.close())

describe('Owner settings with real database persistence', () => {
  it('keeps legacy role budgets intact until the owner explicitly saves a token ceiling', async () => {
    expect(resolvePlan('free').maxTokensPerCall).toBe(24000)
    expect(resolvePlan('premium', { maxTokensPerCall: 5000 }).maxTokensPerCall).toBe(24000)
    expect(resolvePlan('max_premium', { monthlyPriceCents: null, maxTokensPerCall: 16000 }).maxTokensPerCall).toBe(24000)
    await db.insert(tierConfig).values({ tier: 'free', monthlyValidationLimit: 2, maxActiveIdeas: 1,
      maxConcurrentRequests: 1, maxTokensPerCall: 4000 })
    expect((await getPlan('free', db)).maxTokensPerCall).toBe(24000)
    await db.transaction(tx => updatePlan(tx, 'free', { ...toAdminPlan(resolvePlan('free')), maxTokensPerCall: 3000 }))
    expect(await getPlan('free', db)).toMatchObject({ monthlyPriceCents: 0, maxTokensPerCall: 3000 })
    expect(resolvePlan('premium', { monthlyPriceCents: 2900, maxTokensPerCall: 5000 }).maxTokensPerCall).toBe(5000)
  })
  it('restores historical Free PDF access once and preserves later owner edits on migration replay', async () => {
    await db.insert(tierConfig).values({ tier: 'free', monthlyValidationLimit: 2, maxActiveIdeas: 1, maxConcurrentRequests: 1, maxTokensPerCall: 4000, canExportPdf: false })
    const migration = await readFile(new URL('../drizzle/0006_admin_command_center.sql', import.meta.url), 'utf8')
    await state.client.exec(migration)
    expect((await getPlan('free', db)).canExportPdf).toBe(true)
    await db.transaction(tx => updatePlan(tx, 'free', { ...toAdminPlan(resolvePlan('free')), canExportPdf: false }))
    await state.client.exec(migration)
    expect((await getPlan('free', db)).canExportPdf).toBe(false)
  })
  it('preserves Free PDF access by default, respects disabled PDF, and keeps explicit empty benefits', () => {
    expect(resolvePlan('free')).toMatchObject({ canExportPdf: true })
    expect(resolvePlan('free').benefits).toContain('PDF downloads')
    expect(resolvePlan('premium', { canExportPdf: false }).benefits).not.toContain('PDF downloads')
    expect(resolvePlan('premium', { canExportPdf: false }).benefits).toContain('Editable Word downloads')
    expect(resolvePlan('premium', { benefits: [] }).benefits).toEqual([])
  })
  it('defaults existing deployments to open signups and no announcement or maintenance', async () => {
    expect(toAdminSettings(await getPlatformSettings(db))).toEqual({ announcement: { enabled: false, message: '' }, maintenance: { enabled: false, message: '' }, signupEnabled: true })
  })
  it('stores and immediately reads all platform switches in the singleton', async () => {
    const settings = { announcement: { enabled: true, message: 'New plans available' }, maintenance: { enabled: true, message: 'Back shortly' }, signupEnabled: false }
    await db.transaction(tx => savePlatformSettings(tx, settings, owner))
    expect(toAdminSettings(await getPlatformSettings(db))).toEqual(settings)
    await expect(db.transaction(tx => savePlatformSettings(tx, { ...settings, announcement: { enabled: true, message: '' } }, owner))).rejects.toThrow()
    expect(toAdminSettings(await getPlatformSettings(db))).toEqual(settings)
  })
  it('reads fallback legacy prices, allowance, and flags when config columns are unset', async () => {
    await db.insert(tierConfig).values({ tier: 'premium', monthlyValidationLimit: 7, maxActiveIdeas: 4, maxConcurrentRequests: 2, maxTokensPerCall: 5000, canPricingSimulator: false })
    const plan = await getPlan('premium', db)
    expect(plan).toMatchObject({ name: 'Premium', monthlyPriceUsd: 29, monthlyCredits: 1500, validationLimit: 7, activeIdeaLimit: 4, canPricingSimulator: false, stripePriceId: 'price_legacy', maxTokensPerCall: 24000 })
    expect(plan.benefits).not.toContain('Pricing simulator')
  })
  it('persists editable prices, credits, limits, enforced features, and benefits', async () => {
    const value = { ...toAdminPlan(resolvePlan('premium')), name: 'Builder', monthlyPriceUsd: 39.5, monthlyCredits: 2400, validationLimit: 20, activeIdeaLimit: 12, canPricingSimulator: false, benefits: ['Dedicated planning workspace'], stripePriceId: 'price_builder' }
    await db.transaction(tx => updatePlan(tx, 'premium', value))
    const plan = await getPlan('premium', db)
    expect(plan).toMatchObject(value)
    expect(plan.monthlyPriceCents).toBe(3950)
    expect(plan.stripePriceHistory).toContain('price_legacy')
    const catalog = await getPlanCatalog(db)
    expect(tierForStripePrice(catalog, 'price_legacy')).toBe('premium')
    expect(tierForStripePrice(catalog, 'price_builder')).toBe('premium')
    expect(JSON.stringify(getPublicPlanCatalog(catalog))).not.toContain('price_builder')
    expect(formatUsd(plan.monthlyPriceUsd)).toBe('$39.50')
  })
  it('rejects price mismatch atomically when Stripe is configured', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_valid')
    state.price.mockResolvedValue(validPrice(2900))
    await expect(db.transaction(tx => updatePlan(tx, 'premium', { ...toAdminPlan(resolvePlan('premium')), monthlyPriceUsd: 45 }))).rejects.toThrow('does not match')
    expect(await getPlan('premium', db)).toMatchObject({ monthlyPriceUsd: 29 })
    expect(await db.select().from(tierConfig)).toHaveLength(0)
  })
  it('only enables purchases when actual Stripe pricing matches and plan is advertised', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_valid'); vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
    state.price.mockImplementation(async (id: string) => validPrice(id === 'price_legacy' ? 1900 : 7900))
    const catalog = await getPlanCatalog(db)
    expect(await getPlanBillingAvailability(catalog)).toEqual({ credits: true, premium: false, maxPremium: true })
    catalog.max_premium.advertised = false
    expect(await getPlanBillingAvailability(catalog)).toEqual({ credits: true, premium: false, maxPremium: false })
  })
  it('rejects unsupported flags, fractional cents, and negative usage settings', () => {
    const plan = toAdminPlan(resolvePlan('premium'))
    expect(PlanUpdateSchema.safeParse({ ...plan, monthlyPriceUsd: 29.001 }).success).toBe(false)
    expect(PlanUpdateSchema.safeParse({ ...plan, monthlyCredits: -1 }).success).toBe(false)
    expect(PlanUpdateSchema.safeParse({ ...plan, unlimited: true }).success).toBe(false)
  })
})
