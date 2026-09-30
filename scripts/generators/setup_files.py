import os
import json

base_dir = r"c:\Users\2025\IIT DELHI\entrepreneur\aurexa"

files = {
    "next.config.ts": """import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverActions: { allowedOrigins: ['localhost:3000'] },
  },
}

export default nextConfig
""",
    "vitest.config.ts": """import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
""",
    ".env.example": """# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database (direct connection for Drizzle)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# AI Providers
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
ANTHROPIC_API_KEY=your_anthropic_key

# Web Search
TAVILY_API_KEY=your_tavily_key
SERPER_API_KEY=your_serper_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_MAX_PREMIUM_PRICE_ID=price_xxx

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
""",
    ".env.local": """# Supabase
NEXT_PUBLIC_SUPABASE_URL=placeholder
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Database (direct connection for Drizzle)
DATABASE_URL=postgresql://user:password@host:5432/dbname

# AI Providers
OPENROUTER_API_KEY=your_openrouter_key
OPENAI_API_KEY=your_openai_key
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key
ANTHROPIC_API_KEY=your_anthropic_key

# Web Search
TAVILY_API_KEY=your_tavily_key
SERPER_API_KEY=your_serper_key

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
STRIPE_PREMIUM_PRICE_ID=price_xxx
STRIPE_MAX_PREMIUM_PRICE_ID=price_xxx

# Razorpay
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
""",
    "src/db/schema.ts": """import {
  pgTable, text, integer, boolean, timestamp, uuid, jsonb, pgEnum
} from 'drizzle-orm/pg-core'

export const tierEnum = pgEnum('tier', ['free', 'premium', 'max_premium'])
export const evidenceEnum = pgEnum('evidence_strength', ['WEAK', 'MODERATE', 'STRONGER'])
export const jobStatusEnum = pgEnum('job_status', ['pending', 'running', 'partial', 'complete', 'failed'])
export const decisionEnum = pgEnum('decision', ['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  supabaseId: text('supabase_id').notNull().unique(),
  tier: tierEnum('tier').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  razorpayCustomerId: text('razorpay_customer_id'),
  subscriptionId: text('subscription_id'),
  subscriptionStatus: text('subscription_status'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  currentPeriodEnd: timestamp('current_period_end'),
  isFoundingMember: boolean('is_founding_member').default(false),
  crowdfundingCredits: integer('crowdfunding_credits').notNull().default(0),
  pitchDeckCredits: integer('pitch_deck_credits').notNull().default(0),
  validationsThisMonth: integer('validations_this_month').notNull().default(0),
  validationResetAt: timestamp('validation_reset_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const tierConfig = pgTable('tier_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  tier: tierEnum('tier').notNull().unique(),
  monthlyValidationLimit: integer('monthly_validation_limit').notNull(),
  maxActiveIdeas: integer('max_active_ideas').notNull(),
  maxConcurrentRequests: integer('max_concurrent_requests').notNull(),
  maxTokensPerCall: integer('max_tokens_per_call').notNull(),
  canExportPdf: boolean('can_export_pdf').notNull().default(false),
  canExportCsv: boolean('can_export_csv').notNull().default(false),
  canExportPptx: boolean('can_export_pptx').notNull().default(false),
  canWhitelabelPdf: boolean('can_whitelabel_pdf').notNull().default(false),
  canPortfolioExport: boolean('can_portfolio_export').notNull().default(false),
  canLeanCanvas: boolean('can_lean_canvas').notNull().default(false),
  canPricingSimulator: boolean('can_pricing_simulator').notNull().default(false),
  canCrowdfunding: boolean('can_crowdfunding').notNull().default(false),
  canPitchDeck: boolean('can_pitch_deck').notNull().default(false),
  canAiLeanCanvas: boolean('can_ai_lean_canvas').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const foundingMemberCounter = pgTable('founding_member_counter', {
  id: integer('id').primaryKey().default(1),
  count: integer('count').notNull().default(0),
  cap: integer('cap').notNull().default(100),
})

export const ideas = pgTable('ideas', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  industry: text('industry').notNull(),
  product: text('product').notNull(),
  targetCustomer: text('target_customer').notNull(),
  location: text('location').notNull(),
  businessModel: text('business_model').notNull(),
  coreProblem: text('core_problem').notNull(),
  proposedSolution: text('proposed_solution').notNull(),
  isReadOnly: boolean('is_read_only').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const validationJobs = pgTable('validation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  ideaId: uuid('idea_id').notNull().references(() => ideas.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  status: jobStatusEnum('status').notNull().default('pending'),
  isLite: boolean('is_lite').notNull().default(false),
  totalSections: integer('total_sections').notNull().default(0),
  completedSections: integer('completed_sections').notNull().default(0),
  tokensUsed: integer('tokens_used').notNull().default(0),
  estimatedCostUsd: text('estimated_cost_usd'),
  errorMessage: text('error_message'),
  aiProvider: text('ai_provider'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const validationReports = pgTable('validation_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => validationJobs.id),
  ideaId: uuid('idea_id').notNull().references(() => ideas.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  shareToken: uuid('share_token').notNull().defaultRandom(),
  overallScore: integer('overall_score'),
  problemScore: integer('problem_score'),
  customerScore: integer('customer_score'),
  marketScore: integer('market_score'),
  competitiveScore: integer('competitive_score'),
  wtpScore: integer('wtp_score'),
  businessModelScore: integer('business_model_score'),
  financialScore: integer('financial_score'),
  executionScore: integer('execution_score'),
  decision: decisionEnum('decision'),
  decisionReasons: jsonb('decision_reasons'),
  keyEvidence: jsonb('key_evidence'),
  keyRisks: jsonb('key_risks'),
  actionPlan: jsonb('action_plan'),
  reportData: jsonb('report_data'),
  isLite: boolean('is_lite').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

export const leanCanvases = pgTable('lean_canvases', {
  id: uuid('id').primaryKey().defaultRandom(),
  ideaId: uuid('idea_id').notNull().references(() => ideas.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  problem: jsonb('problem'),
  customerSegments: jsonb('customer_segments'),
  uvp: jsonb('uvp'),
  solution: jsonb('solution'),
  channels: jsonb('channels'),
  revenueStreams: jsonb('revenue_streams'),
  costStructure: jsonb('cost_structure'),
  keyMetrics: jsonb('key_metrics'),
  unfairAdvantage: jsonb('unfair_advantage'),
  confidenceScores: jsonb('confidence_scores'),
  validationScore: integer('validation_score'),
  changeReason: text('change_reason'),
  evidenceSummary: text('evidence_summary'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const crowdfundingAnalyses = pgTable('crowdfunding_analyses', {
  id: uuid('id').primaryKey().defaultRandom(),
  ideaId: uuid('idea_id').notNull().references(() => ideas.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  performanceScore: integer('performance_score'),
  classificationBand: text('classification_band'),
  fundingGoal: integer('funding_goal'),
  expectedFunding: integer('expected_funding'),
  expectedBackers: integer('expected_backers'),
  conversionRate: text('conversion_rate'),
  rewardTiers: jsonb('reward_tiers'),
  scenarioAnalysis: jsonb('scenario_analysis'),
  marketingChannels: jsonb('marketing_channels'),
  prelaunchPlan: jsonb('prelaunch_plan'),
  riskRegister: jsonb('risk_register'),
  recommendation: text('recommendation'),
  reportData: jsonb('report_data'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const pricingSimulations = pgTable('pricing_simulations', {
  id: uuid('id').primaryKey().defaultRandom(),
  ideaId: uuid('idea_id').notNull().references(() => ideas.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  pricingScore: integer('pricing_score'),
  scenarios: jsonb('scenarios'),
  sensitivityMatrix: jsonb('sensitivity_matrix'),
  recommendedPrice: text('recommended_price'),
  competitorPrices: jsonb('competitor_prices'),
  validationPlan: jsonb('validation_plan'),
  reportData: jsonb('report_data'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const pitchDecks = pgTable('pitch_decks', {
  id: uuid('id').primaryKey().defaultRandom(),
  ideaId: uuid('idea_id').notNull().references(() => ideas.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  qualityScore: integer('quality_score'),
  founderReadinessScore: integer('founder_readiness_score'),
  slides: jsonb('slides'),
  pitchScript3min: text('pitch_script_3min'),
  pitchScript60sec: text('pitch_script_60sec'),
  investorQa: jsonb('investor_qa'),
  portfolioSections: jsonb('portfolio_sections'),
  roadmap: jsonb('roadmap'),
  milestones: jsonb('milestones'),
  reportData: jsonb('report_data'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const creditPurchases = pgTable('credit_purchases', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  creditType: text('credit_type').notNull(), // 'crowdfunding' | 'pitch_deck' | 'bundle'
  quantity: integer('quantity').notNull().default(1),
  amountUsd: integer('amount_usd').notNull(),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  razorpayOrderId: text('razorpay_order_id'),
  status: text('status').notNull().default('pending'), // pending | completed | refunded
  createdAt: timestamp('created_at').defaultNow(),
})

export const syntheticCampaigns = pgTable('synthetic_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  campaignName: text('campaign_name').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory'),
  country: text('country').notNull(),
  fundingGoal: integer('funding_goal').notNull(),
  amountRaised: integer('amount_raised').notNull(),
  fundingPercentage: text('funding_percentage').notNull(),
  numberOfBackers: integer('number_of_backers').notNull(),
  averageContribution: text('average_contribution').notNull(),
  campaignDuration: integer('campaign_duration').notNull(),
  launchMonth: integer('launch_month').notNull(),
  rewardTiers: integer('reward_tiers').notNull(),
  lowestReward: integer('lowest_reward').notNull(),
  averageReward: integer('average_reward').notNull(),
  highestReward: integer('highest_reward').notNull(),
  videoAvailable: boolean('video_available').notNull(),
  numberOfImages: integer('number_of_images').notNull(),
  storyLength: integer('story_length').notNull(),
  socialMediaFollowers: integer('social_media_followers').notNull(),
  emailListSize: integer('email_list_size').notNull(),
  preLaunchCommunitySize: integer('pre_launch_community_size').notNull(),
  marketingSpend: integer('marketing_spend').notNull(),
  websiteTraffic: integer('website_traffic').notNull(),
  campaignPageVisits: integer('campaign_page_visits').notNull(),
  conversionRate: text('conversion_rate').notNull(),
  updatesPosted: integer('updates_posted').notNull(),
  commentsEngagement: integer('comments_engagement').notNull(),
  first24HourFunding: integer('first_24_hour_funding').notNull(),
  first7DayFunding: integer('first_7_day_funding').notNull(),
  repeatBackerIndicator: boolean('repeat_backer_indicator').notNull(),
  campaignStatus: text('campaign_status').notNull(), // 'Successful' | 'Unsuccessful'
  dataLabel: text('data_label').notNull().default('SYNTHETIC DATA'),
  createdAt: timestamp('created_at').defaultNow(),
})
""",
    "src/db/index.ts": """import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, { prepare: false })
export const db = drizzle(client, { schema })
""",
    "drizzle.config.ts": """import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
""",
    "src/lib/supabase/server.ts": """import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
""",
    "src/lib/supabase/client.ts": """import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
""",
    "src/middleware.ts": """import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protect dashboard routes
  if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/signin'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public|share).*)'],
}
""",
    "src/app/globals.css": """@import "tailwindcss";

:root {
  --gold: #C8A860;
  --gold-light: #D4AF37;
  --gold-dark: #B8963E;
  --navy: #0A1628;
  --charcoal: #1C1C1C;
  --cream: #F5F0E8;
  --ivory: #FAFAF7;
  --border-subtle: #E8E0D0;
  --gold-gradient: linear-gradient(135deg, #D4AF37, #C8A860, #B8963E);
}

.dark {
  --background: #0A1628;
  --foreground: #F5F0E8;
}

body {
  background-color: var(--cream);
  color: var(--charcoal);
  font-family: var(--font-geist-sans), system-ui, sans-serif;
}

/* Angular card corners — logo motif */
.card-angular {
  border-radius: 2px 12px 2px 12px;
  border: 1px solid var(--border-subtle);
  background: var(--ivory);
}

/* Gold score gauge ring */
.gauge-gold {
  stroke: var(--gold);
  stroke-linecap: round;
  fill: none;
  filter: drop-shadow(0 0 6px rgba(200, 168, 96, 0.4));
}
""",
    "src/lib/tier-gate.ts": """import { db } from '@/db'
import { users, tierConfig } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type Feature =
  | 'can_export_pdf' | 'can_export_csv' | 'can_export_pptx'
  | 'can_whitelabel_pdf' | 'can_portfolio_export'
  | 'can_lean_canvas' | 'can_ai_lean_canvas'
  | 'can_pricing_simulator' | 'can_crowdfunding' | 'can_pitch_deck'

export async function getUserWithTierConfig(supabaseId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.supabaseId, supabaseId),
  })
  if (!user) return null

  const config = await db.query.tierConfig.findFirst({
    where: eq(tierConfig.tier, user.tier),
  })
  return { user, config }
}

export async function canUserAccess(supabaseId: string, feature: Feature): Promise<boolean> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result?.config) return false
  return result.config[feature] === true
}

export async function canUserAccessWithCredits(
  supabaseId: string,
  feature: 'crowdfunding' | 'pitch_deck'
): Promise<{ allowed: boolean; reason: 'tier' | 'credit' | 'denied' }> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result) return { allowed: false, reason: 'denied' }

  const { user, config } = result

  // Max premium gets both via tier
  if (feature === 'crowdfunding' && config?.can_crowdfunding) return { allowed: true, reason: 'tier' }
  if (feature === 'pitch_deck' && config?.can_pitch_deck) return { allowed: true, reason: 'tier' }

  // Premium can use credits
  if (feature === 'crowdfunding' && user.crowdfundingCredits > 0) return { allowed: true, reason: 'credit' }
  if (feature === 'pitch_deck' && user.pitchDeckCredits > 0) return { allowed: true, reason: 'credit' }

  return { allowed: false, reason: 'denied' }
}

export async function checkValidationLimit(supabaseId: string): Promise<{ allowed: boolean; remaining: number }> {
  const result = await getUserWithTierConfig(supabaseId)
  if (!result?.config) return { allowed: false, remaining: 0 }

  const { user, config } = result
  const now = new Date()

  // Reset counter if new billing month
  if (!user.validationResetAt || now > user.validationResetAt) {
    await db.update(users).set({
      validationsThisMonth: 0,
      validationResetAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    }).where(eq(users.supabaseId, supabaseId))
    return { allowed: true, remaining: config.monthlyValidationLimit }
  }

  const remaining = config.monthlyValidationLimit - user.validationsThisMonth
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) }
}
""",
    "src/lib/scoring.ts": """import { z } from 'zod'

// ============ STARTUP VALIDATION SCORE (100 pts) ============
export const STARTUP_WEIGHTS = {
  problemValidation: 20,
  customerValidation: 20,
  marketOpportunity: 15,
  competitiveDifferentiation: 10,
  willingnessToPay: 15,
  businessModel: 10,
  financialFeasibility: 5,
  executionFeasibility: 5,
} as const

export function calculateStartupValidationScore(
  scores: typeof STARTUP_WEIGHTS
): number {
  return Object.values(scores).reduce((a, b) => a + b, 0)
}

export function clampScore(score: number, maxWeight: number): number {
  return Math.max(0, Math.min(score, maxWeight))
}

export const EvidenceStrength = z.enum(['WEAK', 'MODERATE', 'STRONGER'])
export type EvidenceStrength = z.infer<typeof EvidenceStrength>

export const ValidationDecision = z.enum(['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO'])
export type ValidationDecision = z.infer<typeof ValidationDecision>

export const CrowdfundingDecision = z.enum([
  'READY_TO_LAUNCH', 'LAUNCH_AFTER_IMPROVEMENTS', 'TEST_FURTHER', 'MAJOR_REWORK_REQUIRED'
])
export type CrowdfundingDecision = z.infer<typeof CrowdfundingDecision>

// ============ BUSINESS MODEL VALIDATION SCORE (100 pts) ============
export const BM_WEIGHTS = {
  problemEvidence: 15,
  customerEvidence: 15,
  valueProposition: 10,
  solutionFeasibility: 10,
  channelFeasibility: 10,
  revenueValidation: 10,
  costFeasibility: 10,
  unitEconomics: 10,
  competitivePosition: 5,
  executionReadiness: 5,
} as const

// ============ CAMPAIGN PERFORMANCE SCORE (100 pts) ============
export const CAMPAIGN_WEIGHTS = {
  problemAndProductAppeal: 15,
  fundingGoalFeasibility: 15,
  preLaunchAudience: 15,
  campaignPageQuality: 10,
  rewardStrategy: 10,
  pricingEconomics: 10,
  marketingReadiness: 10,
  founderCredibility: 5,
  earlyMomentumPlan: 5,
  operationalReadiness: 5,
} as const

export function getCampaignClassificationBand(score: number): {
  band: string
  label: string
  disclaimer: string
} {
  const disclaimer =
    'These are educational decision-support categories, not statistically guaranteed probabilities of success.'
  if (score >= 80) return { band: '80-100', label: 'Strong Readiness', disclaimer }
  if (score >= 65) return { band: '65-79', label: 'Promising but Improvements Required', disclaimer }
  if (score >= 50) return { band: '50-64', label: 'Significant Risk', disclaimer }
  return { band: '<50', label: 'Major Rework Required', disclaimer }
}

// ============ PITCH DECK QUALITY SCORE (100 pts) ============
export const PITCH_WEIGHTS = {
  problemClarity: 10,
  solutionStrength: 10,
  customerEvidence: 10,
  marketOpportunity: 10,
  businessModel: 10,
  competitivePositioning: 10,
  gtmStrategy: 10,
  financialLogic: 10,
  teamExecutionReadiness: 10,
  presentationQuality: 10,
} as const

// ============ PRICING STRATEGY SCORE (100 pts) ============
export const PRICING_WEIGHTS = {
  customerWillingnessToPay: 20,
  customerValue: 15,
  competitivePosition: 10,
  contributionMargin: 15,
  breakEvenFeasibility: 10,
  cacLtvEconomics: 10,
  demandPotential: 10,
  scalability: 5,
  pricingSimplicity: 5,
} as const

// Validate all weight tables sum to 100
export function validateWeightTable(weights: Record<string, number>): boolean {
  return Object.values(weights).reduce((a, b) => a + b, 0) === 100
}
""",
    "src/lib/scoring.test.ts": """import { describe, it, expect } from 'vitest'
import {
  STARTUP_WEIGHTS, BM_WEIGHTS, CAMPAIGN_WEIGHTS, PITCH_WEIGHTS, PRICING_WEIGHTS,
  validateWeightTable, clampScore, getCampaignClassificationBand
} from './scoring'

describe('Weight tables sum to 100', () => {
  it('STARTUP_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(STARTUP_WEIGHTS)).toBe(true)
  })
  it('BM_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(BM_WEIGHTS)).toBe(true)
  })
  it('CAMPAIGN_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(CAMPAIGN_WEIGHTS)).toBe(true)
  })
  it('PITCH_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(PITCH_WEIGHTS)).toBe(true)
  })
  it('PRICING_WEIGHTS sums to 100', () => {
    expect(validateWeightTable(PRICING_WEIGHTS)).toBe(true)
  })
})

describe('clampScore', () => {
  it('clamps to max weight', () => expect(clampScore(25, 20)).toBe(20))
  it('clamps to 0 minimum', () => expect(clampScore(-5, 20)).toBe(0))
  it('passes through valid score', () => expect(clampScore(15, 20)).toBe(15))
})

describe('getCampaignClassificationBand', () => {
  it('80+ is Strong Readiness', () => {
    expect(getCampaignClassificationBand(85).label).toBe('Strong Readiness')
  })
  it('65-79 is Promising', () => {
    expect(getCampaignClassificationBand(70).label).toBe('Promising but Improvements Required')
  })
  it('50-64 is Significant Risk', () => {
    expect(getCampaignClassificationBand(55).label).toBe('Significant Risk')
  })
  it('<50 is Major Rework', () => {
    expect(getCampaignClassificationBand(40).label).toBe('Major Rework Required')
  })
  it('includes disclaimer', () => {
    expect(getCampaignClassificationBand(80).disclaimer).toContain('educational decision-support')
  })
})
""",
    "public/logo/aurexa-logo-dark.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" fill="none">
  <defs>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#D4AF37"/>
      <stop offset="50%" style="stop-color:#C8A860"/>
      <stop offset="100%" style="stop-color:#B8963E"/>
    </linearGradient>
  </defs>
  <!-- Faceted A mark -->
  <polygon points="30,8 50,52 10,52" fill="url(#goldGrad)" opacity="0.15"/>
  <polygon points="30,8 46,52 14,52" fill="url(#goldGrad)"/>
  <polygon points="30,14 24,34 36,34" fill="#1C1C1C"/>
  <!-- Diamond motif -->
  <polygon points="30,36 34,44 30,48 26,44" fill="url(#goldGrad)"/>
  <!-- Wordmark -->
  <text x="62" y="40" font-family="system-ui, sans-serif" font-size="28" font-weight="300" letter-spacing="2" fill="#F5F0E8">aurexa</text>
  <!-- Gold accent underline on x -->
  <line x1="62" y1="46" x2="92" y2="46" stroke="#C8A860" stroke-width="2"/>
</svg>
""",
    "public/logo/aurexa-logo-light.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" fill="none">
  <defs>
    <linearGradient id="goldGradL" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#D4AF37"/>
      <stop offset="50%" style="stop-color:#C8A860"/>
      <stop offset="100%" style="stop-color:#B8963E"/>
    </linearGradient>
  </defs>
  <polygon points="30,8 46,52 14,52" fill="url(#goldGradL)"/>
  <polygon points="30,14 24,34 36,34" fill="#F5F0E8"/>
  <polygon points="30,36 34,44 30,48 26,44" fill="url(#goldGradL)"/>
  <text x="62" y="40" font-family="system-ui, sans-serif" font-size="28" font-weight="300" letter-spacing="2" fill="#1C1C1C">aurexa</text>
  <line x1="62" y1="46" x2="92" y2="46" stroke="#C8A860" stroke-width="2"/>
</svg>
""",
    "public/logo/aurexa-icon.svg": """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <rect width="48" height="48" rx="8" fill="#0A1628"/>
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#D4AF37"/>
      <stop offset="100%" style="stop-color:#B8963E"/>
    </linearGradient>
  </defs>
  <polygon points="24,6 38,42 10,42" fill="url(#g)"/>
  <polygon points="24,12 19,28 29,28" fill="#0A1628"/>
  <polygon points="24,30 28,37 24,40 20,37" fill="url(#g)"/>
</svg>
""",
    "src/app/page.tsx": """import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Aurexa — Know it\\'s gold before you dig.',
  description: 'AI-powered startup idea validation. Validate your startup with market research, competitor analysis, financial modelling, and a GO/NO-GO score — before you invest a single rupee.',
  openGraph: {
    title: 'Aurexa — Know it\\'s gold before you dig.',
    description: 'AI-powered startup idea validation platform. Get your Validation Score /100 in minutes.',
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: 'Aurexa',
    type: 'website',
    images: [{ url: `${process.env.NEXT_PUBLIC_APP_URL}/og-image.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Aurexa — Know it\\'s gold before you dig.',
    description: 'AI-powered startup idea validation. Get your GO/NO-GO score in minutes.',
  },
}

export default function LandingPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--cream)' }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[#E8E0D0] bg-[#FAFAF7]">
        <div className="flex items-center gap-3">
          <Image src="/logo/aurexa-icon.svg" alt="Aurexa" width={36} height={36} />
          <span className="text-xl font-light tracking-widest text-[#1C1C1C]">aurexa</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/auth/signin" className="text-sm text-[#1C1C1C] hover:text-[#C8A860] transition-colors">
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="px-5 py-2 text-sm font-medium text-[#0A1628] transition-all"
            style={{ background: 'var(--gold-gradient)', borderRadius: '2px 10px 2px 10px' }}
          >
            Start Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 py-24 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-xs font-medium text-[#C8A860] border border-[#C8A860] rounded-full bg-[#C8A86010]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8A860] animate-pulse" />
          AI-Powered Startup Validation
        </div>
        <h1 className="text-5xl md:text-6xl font-light text-[#0A1628] leading-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
          Know it&apos;s gold<br />
          <span style={{ background: 'var(--gold-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            before you dig.
          </span>
        </h1>
        <p className="text-xl text-[#1C1C1C] opacity-70 max-w-2xl mx-auto mb-10 leading-relaxed">
          Validate your startup idea with AI-driven market research, competitor analysis, financial modelling, and a scored GO / NO-GO recommendation — before you invest time or money.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="px-8 py-4 text-base font-medium text-[#0A1628] transition-all hover:opacity-90"
            style={{ background: 'var(--gold-gradient)', borderRadius: '2px 14px 2px 14px' }}
          >
            Validate Your Idea Free →
          </Link>
          <Link
            href="#pricing"
            className="px-8 py-4 text-base font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors card-angular"
          >
            See Pricing
          </Link>
        </div>
      </section>

      {/* Score preview cards */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Validation Score', value: '78/100', sub: 'GO' },
            { label: 'Market Opportunity', value: '$2.4B', sub: 'TAM' },
            { label: 'Competitors Found', value: '12', sub: 'Benchmarked' },
            { label: 'Financial Scenarios', value: '3', sub: 'Modelled' },
          ].map((card) => (
            <div key={card.label} className="card-angular p-5 text-center">
              <div className="text-2xl font-light text-[#C8A860] mb-1">{card.value}</div>
              <div className="text-xs text-[#1C1C1C] font-medium">{card.label}</div>
              <div className="text-xs text-[#1C1C1C] opacity-50">{card.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-3xl font-light text-center text-[#0A1628] mb-4">Simple, honest pricing</h2>
        <p className="text-center text-[#1C1C1C] opacity-60 mb-12">No lock-in. Cancel anytime.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              name: 'Free',
              price: '$0',
              description: 'The Validator',
              features: ['1 active idea', '2 AI validations/mo', 'Lite score + GO/NO-GO', 'Public shareable report', 'Manual Lean Canvas'],
              cta: 'Start Free',
              href: '/auth/signup',
              highlight: false,
            },
            {
              name: 'Premium',
              price: '$29',
              per: '/mo',
              description: 'The Business Model Suite',
              features: ['10 ideas · 15 validations/mo', '40-section deep report', 'Lean Canvas Automation', 'Smart Pricing Simulator', 'PDF + CSV exports'],
              cta: 'Start Premium',
              href: '/auth/signup?plan=premium',
              highlight: true,
            },
            {
              name: 'Max Premium',
              price: '$79',
              per: '/mo',
              description: 'The Fundraising Suite',
              features: ['50 validations/mo', 'Crowdfunding Predictor', 'Pitch Deck Builder', 'PPTX + White-label PDF', 'Portfolio site export'],
              cta: 'Go Max Premium',
              href: '/auth/signup?plan=max',
              highlight: false,
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`card-angular p-8 ${plan.highlight ? 'border-[#C8A860] ring-1 ring-[#C8A860]' : ''}`}
            >
              {plan.highlight && (
                <div className="text-xs font-medium text-[#C8A860] mb-3 uppercase tracking-wider">Most Popular</div>
              )}
              <div className="text-sm font-medium text-[#C8A860] mb-1">{plan.description}</div>
              <div className="text-3xl font-light text-[#0A1628] mb-1">
                {plan.price}<span className="text-base opacity-60">{plan.per}</span>
              </div>
              <div className="text-xl font-light text-[#1C1C1C] mb-6">{plan.name}</div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#1C1C1C]">
                    <span className="text-[#C8A860] mt-0.5">✦</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block w-full text-center py-3 text-sm font-medium transition-all ${
                  plan.highlight
                    ? 'text-[#0A1628]'
                    : 'text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860]'
                }`}
                style={plan.highlight ? { background: 'var(--gold-gradient)', borderRadius: '2px 10px 2px 10px' } : { borderRadius: '2px 10px 2px 10px' }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E0D0] py-10 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Image src="/logo/aurexa-icon.svg" alt="Aurexa" width={24} height={24} />
          <span className="text-sm font-light tracking-widest text-[#1C1C1C]">aurexa</span>
        </div>
        <p className="text-xs text-[#1C1C1C] opacity-40">© 2026 Aurexa. Know it&apos;s gold before you dig.</p>
      </footer>
    </main>
  )
}
""",
    "src/app/layout.tsx": """import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Aurexa', template: '%s | Aurexa' },
  description: 'AI-powered startup idea validation. Know it\\'s gold before you dig.',
  icons: { icon: '/logo/aurexa-favicon.svg' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
""",
    "src/app/auth/signin/page.tsx": """'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--cream)' }}>
      <div className="card-angular p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo/aurexa-icon.svg" alt="Aurexa" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-light text-[#0A1628]">Welcome back</h1>
          <p className="text-sm text-[#1C1C1C] opacity-60 mt-1">Sign in to your Aurexa account</p>
        </div>
        <form onSubmit={handleSignIn} className="space-y-4">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required
            className="w-full px-4 py-3 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:outline-none focus:border-[#C8A860]"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required
            className="w-full px-4 py-3 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:outline-none focus:border-[#C8A860]"
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 text-sm font-medium text-[#0A1628] disabled:opacity-60"
            style={{ background: 'var(--gold-gradient)', borderRadius: '2px 10px 2px 10px' }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#E8E0D0]" />
          <span className="text-xs text-[#1C1C1C] opacity-40">or</span>
          <div className="flex-1 h-px bg-[#E8E0D0]" />
        </div>
        <button
          onClick={handleGoogle}
          className="w-full py-3 text-sm font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors"
          style={{ borderRadius: '2px 10px 2px 10px' }}
        >
          Continue with Google
        </button>
        <p className="text-center text-xs text-[#1C1C1C] opacity-60 mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/signup" className="text-[#C8A860] hover:underline">Sign up free</Link>
        </p>
      </div>
    </div>
  )
}
""",
    "src/app/auth/signup/page.tsx": """'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
  }

  async function handleGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--cream)' }}>
      <div className="card-angular p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo/aurexa-icon.svg" alt="Aurexa" width={48} height={48} className="mx-auto mb-4" />
          <h1 className="text-2xl font-light text-[#0A1628]">Create an account</h1>
          <p className="text-sm text-[#1C1C1C] opacity-60 mt-1">Sign up to validate your startup ideas</p>
        </div>
        <form onSubmit={handleSignUp} className="space-y-4">
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" required
            className="w-full px-4 py-3 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:outline-none focus:border-[#C8A860]"
          />
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="Password" required
            className="w-full px-4 py-3 border border-[#E8E0D0] rounded bg-[#FAFAF7] text-sm focus:outline-none focus:border-[#C8A860]"
          />
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 text-sm font-medium text-[#0A1628] disabled:opacity-60"
            style={{ background: 'var(--gold-gradient)', borderRadius: '2px 10px 2px 10px' }}
          >
            {loading ? 'Signing up…' : 'Sign Up'}
          </button>
        </form>
        <div className="my-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-[#E8E0D0]" />
          <span className="text-xs text-[#1C1C1C] opacity-40">or</span>
          <div className="flex-1 h-px bg-[#E8E0D0]" />
        </div>
        <button
          onClick={handleGoogle}
          className="w-full py-3 text-sm font-medium text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors"
          style={{ borderRadius: '2px 10px 2px 10px' }}
        >
          Continue with Google
        </button>
        <p className="text-center text-xs text-[#1C1C1C] opacity-60 mt-6">
          Already have an account?{' '}
          <Link href="/auth/signin" className="text-[#C8A860] hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
""",
    "src/app/auth/callback/route.ts": """import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
""",
    "src/app/dashboard/layout.tsx": """import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/signin')

  return (
    <div className="min-h-screen" style={{ background: 'var(--cream)' }}>
      {/* Sidebar nav */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-[#0A1628] flex flex-col">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src="/logo/aurexa-icon.svg" alt="Aurexa" className="w-8 h-8" />
            <span className="text-lg font-light tracking-widest text-[#F5F0E8]">aurexa</span>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {[
            { href: '/dashboard', label: 'Validate Idea', icon: '◈', tier: 'free' },
            { href: '/dashboard/lean-canvas', label: 'Lean Canvas', icon: '⊞', tier: 'premium' },
            { href: '/dashboard/pricing', label: 'Pricing Simulator', icon: '◉', tier: 'premium' },
            { href: '/dashboard/crowdfunding', label: 'Crowdfunding', icon: '⬡', tier: 'max_premium' },
            { href: '/dashboard/pitch-deck', label: 'Pitch Deck', icon: '▲', tier: 'max_premium' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded text-sm text-[#F5F0E8] hover:bg-white/10 transition-colors group"
              style={{ borderRadius: '2px 8px 2px 8px' }}
            >
              <span className="text-[#C8A860] text-base">{item.icon}</span>
              {item.label}
              {item.tier === 'max_premium' && (
                <span className="ml-auto text-xs text-[#C8A860]">🔒</span>
              )}
            </a>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <a href="/dashboard/settings" className="flex items-center gap-2 text-xs text-[#F5F0E8] opacity-60 hover:opacity-100">
            ⚙ Settings
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-60 min-h-screen p-8">
        {children}
      </main>
    </div>
  )
}
""",
    "src/app/dashboard/page.tsx": """export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-light text-[#0A1628] mb-2">Validate Your Idea</h1>
      <p className="text-sm text-[#1C1C1C] opacity-60 mb-8">Enter your startup details to get an AI-powered Validation Score /100.</p>
      <div className="card-angular p-8 text-center">
        <p className="text-[#1C1C1C] opacity-40 text-sm">Idea input wizard — Phase 2</p>
      </div>
    </div>
  )
}
"""
}

for rel_path, content in files.items():
    full_path = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, "w", encoding="utf-8") as f:
        f.write(content)

print("Files written successfully")
