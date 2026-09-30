import {
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
