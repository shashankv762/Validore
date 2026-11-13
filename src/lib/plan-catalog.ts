import { z } from 'zod'
import { eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '@/db'
import { tierConfig } from '@/db/schema'
import { PLAN_CATALOG, type PlanTier } from './plans'
import type { AdminPlan } from './admin-types'
import type { SettingsExecutor } from './platform-settings'
import { billingAvailability } from './billing-availability'

export const PLAN_TIERS = ['free', 'premium', 'max_premium'] as const
const featureFields = ['canExportPdf', 'canExportCsv', 'canExportPptx', 'canWhitelabelPdf', 'canPortfolioExport', 'canLeanCanvas', 'canAiLeanCanvas', 'canPricingSimulator', 'canCrowdfunding', 'canPitchDeck'] as const
export const PlanUpdateSchema = z.strictObject({
  tier: z.enum(PLAN_TIERS).optional(), name: z.string().trim().min(1).max(80),
  monthlyPriceUsd: z.number().finite().min(0).max(10000).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, 'Prices must use whole cents.'),
  monthlyCredits: z.number().int().min(0).max(10000000),
  validationLimit: z.number().int().min(0).max(1000000), activeIdeaLimit: z.number().int().min(0).max(1000000),
  benefits: z.array(z.string().trim().min(1).max(200)).max(30),
  stripePriceId: z.string().regex(/^price_[A-Za-z0-9]+$/).nullable(), advertised: z.boolean(),
  maxConcurrentRequests: z.number().int().min(1).max(100), maxTokensPerCall: z.number().int().min(256).max(128000),
  canExportPdf: z.boolean(), canExportCsv: z.boolean(), canExportPptx: z.boolean(), canWhitelabelPdf: z.boolean(),
  canPortfolioExport: z.boolean(), canLeanCanvas: z.boolean(), canAiLeanCanvas: z.boolean(), canPricingSimulator: z.boolean(),
  canCrowdfunding: z.boolean(), canPitchDeck: z.boolean(),
})

const defaultFeatures = {
  free: { maxConcurrentRequests: 1, maxTokensPerCall: 4000, canExportPdf: true, canExportCsv: false, canExportPptx: false, canWhitelabelPdf: false, canPortfolioExport: false, canLeanCanvas: true, canAiLeanCanvas: false, canPricingSimulator: false, canCrowdfunding: false, canPitchDeck: false },
  premium: { maxConcurrentRequests: 3, maxTokensPerCall: 8000, canExportPdf: true, canExportCsv: true, canExportPptx: false, canWhitelabelPdf: false, canPortfolioExport: false, canLeanCanvas: true, canAiLeanCanvas: true, canPricingSimulator: true, canCrowdfunding: false, canPitchDeck: false },
  max_premium: { maxConcurrentRequests: 10, maxTokensPerCall: 16000, canExportPdf: true, canExportCsv: true, canExportPptx: true, canWhitelabelPdf: true, canPortfolioExport: true, canLeanCanvas: true, canAiLeanCanvas: true, canPricingSimulator: true, canCrowdfunding: true, canPitchDeck: true },
}
export type RuntimePlan = AdminPlan & {
  monthlyPriceCents: number; monthlyValidationLimit: number; maxActiveIdeas: number; stripePriceHistory: string[]; advertised: boolean
}
export type RuntimePlanCatalog = Record<PlanTier, RuntimePlan>

function environmentPrice(tier: PlanTier) {
  const value = tier === 'premium' ? process.env.STRIPE_PREMIUM_PRICE_ID : tier === 'max_premium' ? process.env.STRIPE_MAX_PREMIUM_PRICE_ID : null
  return value && /^price_[A-Za-z0-9]+$/.test(value) ? value : null
}

export function resolvePlan(tier: PlanTier, row?: Partial<typeof tierConfig.$inferSelect> | null): RuntimePlan {
  const defaults = PLAN_CATALOG[tier]
  const monthlyPriceCents = row?.monthlyPriceCents ?? defaults.monthlyPriceUsd * 100
  const features = { ...defaultFeatures[tier] }
  for (const key of featureFields) features[key] = row?.[key] ?? features[key]
  const monthlyCredits = row?.monthlyCredits ?? defaults.monthlyCredits
  const validationLimit = row?.monthlyValidationLimit ?? defaults.validationLimit
  const activeIdeaLimit = row?.maxActiveIdeas ?? defaults.activeIdeaLimit
  const benefits = [`${monthlyCredits.toLocaleString('en-US')} monthly credits`, `${validationLimit} validations per month`, `${activeIdeaLimit} active ${activeIdeaLimit === 1 ? 'idea' : 'ideas'}`]
  if (features.canLeanCanvas) benefits.push('Manual Lean Canvas')
  if (features.canAiLeanCanvas) benefits.push('AI Lean Canvas')
  if (features.canPricingSimulator) benefits.push('Pricing simulator')
  if (features.canExportPdf) benefits.push('PDF downloads')
  benefits.push('Editable Word downloads')
  if (features.canCrowdfunding) benefits.push('Crowdfunding analysis')
  if (features.canPitchDeck) benefits.push('Pitch deck builder')
  if (features.canExportCsv) benefits.push('CSV exports')
  if (features.canExportPptx) benefits.push('PPTX exports')
  if (features.canWhitelabelPdf) benefits.push('White-label PDF')
  if (features.canPortfolioExport) benefits.push('Portfolio ZIP export')
  return { tier, name: row?.name ?? defaults.name, monthlyPriceCents, monthlyPriceUsd: monthlyPriceCents / 100,
    monthlyCredits, validationLimit, monthlyValidationLimit: validationLimit, activeIdeaLimit, maxActiveIdeas: activeIdeaLimit,
    ...features, maxConcurrentRequests: row?.maxConcurrentRequests ?? features.maxConcurrentRequests,
    // Legacy token columns were never enforced by generation. Preserve its role
    // budgets until a full owner plan save supplies the new price marker (Free = 0).
    maxTokensPerCall: row?.monthlyPriceCents != null ? row.maxTokensPerCall ?? 24000 : 24000,
    benefits: row?.benefits ?? benefits, advertised: row?.advertised ?? true,
    stripePriceId: row?.stripePriceId ?? environmentPrice(tier), stripePriceHistory: row?.stripePriceHistory ?? [] }
}

export async function getPlanCatalog(executor: SettingsExecutor = db): Promise<RuntimePlanCatalog> {
  const rows = executor === db && !process.env.DATABASE_URL ? [] : await executor.select().from(tierConfig)
  return Object.fromEntries(PLAN_TIERS.map(tier => [tier, resolvePlan(tier, rows.find(row => row.tier === tier))])) as RuntimePlanCatalog
}

export async function getPlan(tier: PlanTier, executor: SettingsExecutor = db) {
  if (executor === db && !process.env.DATABASE_URL) return resolvePlan(tier)
  const [row] = await executor.select().from(tierConfig).where(eq(tierConfig.tier, tier)).limit(1)
  return resolvePlan(tier, row)
}

export function toAdminPlan(plan: RuntimePlan): AdminPlan {
  const { monthlyPriceCents: _price, monthlyValidationLimit: _validation, maxActiveIdeas: _ideas, stripePriceHistory: _history, ...admin } = plan
  void _price; void _validation; void _ideas; void _history
  return admin
}

export function getPublicPlanCatalog(catalog: RuntimePlanCatalog) {
  return Object.fromEntries(PLAN_TIERS.map(tier => {
    const { stripePriceId: _price, ...plan } = toAdminPlan(catalog[tier])
    void _price
    return [tier, plan]
  })) as Record<PlanTier, Omit<AdminPlan, 'stripePriceId'>>
}

export function assertMonthlyStripePrice(price: Pick<Stripe.Price, 'active' | 'currency' | 'unit_amount' | 'recurring' | 'billing_scheme'>, expectedAmount: number) {
  if (!price.active || price.currency !== 'usd' || price.unit_amount !== expectedAmount ||
      (price.billing_scheme && price.billing_scheme !== 'per_unit') || price.recurring?.interval !== 'month' ||
      price.recurring.interval_count !== 1 || price.recurring.usage_type === 'metered') {
    throw new Error('The configured subscription price does not match the advertised monthly plan')
  }
}

export async function getPlanBillingAvailability(catalog: RuntimePlanCatalog) {
  const base = billingAvailability()
  if (!base.credits) return { credits: false, premium: false, maxPremium: false }
  const { stripeBillingClient } = await import('./stripe-client')
  const stripe = stripeBillingClient()
  const check = async (plan: RuntimePlan) => {
    if (!plan.advertised || !plan.stripePriceId || plan.monthlyPriceCents <= 0) return false
    try { assertMonthlyStripePrice(await stripe.prices.retrieve(plan.stripePriceId), plan.monthlyPriceCents); return true }
    catch { return false }
  }
  const [premium, maxPremium] = await Promise.all([check(catalog.premium), check(catalog.max_premium)])
  return { credits: base.credits, premium, maxPremium }
}

/** Use the same lock in checkout and updates so a new checkout cannot race a plan change. */
export async function lockPlan(tx: SettingsExecutor, tier: PlanTier) {
  void tier
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('validore-plans'))`)
}

/** Caller authorizes the owner, controls idempotency, and audits in this transaction. */
export async function updatePlan(tx: SettingsExecutor, tier: PlanTier, input: unknown) {
  const value = PlanUpdateSchema.parse(input)
  if (value.tier && value.tier !== tier) throw new Error('Plan tier mismatch')
  if (tier === 'free' && (value.monthlyPriceUsd !== 0 || value.stripePriceId !== null)) throw new Error('The free plan must remain free')
  if (tier !== 'free' && value.monthlyPriceUsd <= 0) throw new Error('Paid plans need a positive monthly price')
  await lockPlan(tx, tier)
  const previous = await getPlan(tier, tx)
  const monthlyPriceCents = Math.round(value.monthlyPriceUsd * 100)
  const priceId = value.stripePriceId ?? environmentPrice(tier)
  if (tier !== 'free' && /^(sk|rk)_(test|live)_/.test(process.env.STRIPE_SECRET_KEY || '') && priceId) {
    const { stripeBillingClient } = await import('./stripe-client')
    assertMonthlyStripePrice(await stripeBillingClient().prices.retrieve(priceId), monthlyPriceCents)
  }
  // Retain identities of grandfathered subscriptions. Price history never changes their tier.
  const stripePriceHistory = [...new Set([...previous.stripePriceHistory, ...(previous.stripePriceId ? [previous.stripePriceId] : [])])]
  if (stripePriceHistory.length > 1000) throw new Error('Plan price history limit reached')
  const catalog = await getPlanCatalog(tx)
  const ownPrices = new Set([...stripePriceHistory, ...(priceId ? [priceId] : [])])
  for (const other of PLAN_TIERS.filter(item => item !== tier)) {
    if ([catalog[other].stripePriceId, ...catalog[other].stripePriceHistory].some(id => id && ownPrices.has(id))) {
      throw new Error('Stripe price IDs must belong to only one plan')
    }
  }
  const values = { name: value.name, monthlyPriceCents, monthlyCredits: value.monthlyCredits,
    stripePriceId: value.stripePriceId, stripePriceHistory, advertised: value.advertised, benefits: value.benefits,
    monthlyValidationLimit: value.validationLimit, maxActiveIdeas: value.activeIdeaLimit,
    maxConcurrentRequests: value.maxConcurrentRequests, maxTokensPerCall: value.maxTokensPerCall,
    ...Object.fromEntries(featureFields.map(key => [key, value[key]])), updatedAt: new Date() }
  await tx.insert(tierConfig).values({ tier, ...values }).onConflictDoUpdate({ target: tierConfig.tier, set: values })
  return getPlan(tier, tx)
}

/** An allocation is fixed for the current period; plan edits apply on renewal. */
export function creditCycleAllowance(user: { tier: PlanTier; creditCycleAllowance?: number | null; creditBalance: number; monthlyCreditsUsedThisCycle?: number | null }) {
  return user.creditCycleAllowance ?? Math.max(PLAN_CATALOG[user.tier].monthlyCredits, user.creditBalance + (user.monthlyCreditsUsedThisCycle ?? 0))
}

export function tierForStripePrice(catalog: RuntimePlanCatalog, priceId: string): PlanTier | null {
  return PLAN_TIERS.find(tier => tier !== 'free' && (catalog[tier].stripePriceId === priceId || catalog[tier].stripePriceHistory.includes(priceId))) ?? null
}
