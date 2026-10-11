import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { tierConfig, foundingMemberCounter } from '../src/db/schema'
import { count } from 'drizzle-orm'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const client = postgres(process.env.DATABASE_URL, { prepare: false })
const db = drizzle(client)

const TIERS_DATA: (typeof tierConfig.$inferInsert)[] = [
  {
    tier: 'free',
    monthlyValidationLimit: 2,
    maxActiveIdeas: 1,
    maxConcurrentRequests: 1,
    maxTokensPerCall: 4000,
    canExportPdf: false,
    canExportCsv: false,
    canExportPptx: false,
    canWhitelabelPdf: false,
    canPortfolioExport: false,
    canLeanCanvas: true,
    canPricingSimulator: false,
    canCrowdfunding: false,
    canPitchDeck: false,
    canAiLeanCanvas: false,
  },
  {
    tier: 'premium',
    monthlyValidationLimit: 15,
    maxActiveIdeas: 10,
    maxConcurrentRequests: 3,
    maxTokensPerCall: 8000,
    canExportPdf: true,
    canExportCsv: true,
    canExportPptx: false,
    canWhitelabelPdf: false,
    canPortfolioExport: false,
    canLeanCanvas: true,
    canPricingSimulator: true,
    canCrowdfunding: false,
    canPitchDeck: false,
    canAiLeanCanvas: true,
  },
  {
    tier: 'max_premium',
    monthlyValidationLimit: 50,
    maxActiveIdeas: 100,
    maxConcurrentRequests: 10,
    maxTokensPerCall: 16000,
    canExportPdf: true,
    canExportCsv: true,
    canExportPptx: true,
    canWhitelabelPdf: true,
    canPortfolioExport: true,
    canLeanCanvas: true,
    canPricingSimulator: true,
    canCrowdfunding: true,
    canPitchDeck: true,
    canAiLeanCanvas: true,
  },
]

async function seedTiersAndCounter() {
  console.log('🌱 Seeding tier_config and founding_member_counter...')

  for (const tierData of TIERS_DATA) {
    await db
      .insert(tierConfig)
      .values(tierData)
      .onConflictDoUpdate({
        target: tierConfig.tier,
        set: {
          monthlyValidationLimit: tierData.monthlyValidationLimit,
          maxActiveIdeas: tierData.maxActiveIdeas,
          maxConcurrentRequests: tierData.maxConcurrentRequests,
          maxTokensPerCall: tierData.maxTokensPerCall,
          canExportPdf: tierData.canExportPdf,
          canExportCsv: tierData.canExportCsv,
          canExportPptx: tierData.canExportPptx,
          canWhitelabelPdf: tierData.canWhitelabelPdf,
          canPortfolioExport: tierData.canPortfolioExport,
          canLeanCanvas: tierData.canLeanCanvas,
          canPricingSimulator: tierData.canPricingSimulator,
          canCrowdfunding: tierData.canCrowdfunding,
          canPitchDeck: tierData.canPitchDeck,
          canAiLeanCanvas: tierData.canAiLeanCanvas,
          updatedAt: new Date(),
        },
      })
    console.log(`  ✓ Seeded tier: ${tierData.tier}`)
  }

  await db
    .insert(foundingMemberCounter)
    .values({
      id: 1,
      count: 0,
      cap: 100,
    })
    .onConflictDoNothing({ target: foundingMemberCounter.id })

  console.log('  ✓ Initialized founding_member_counter (id=1, count=0, cap=100)')

  const [tierCount] = await db.select({ val: count() }).from(tierConfig)
  const [counterCount] = await db.select({ val: count() }).from(foundingMemberCounter)

  console.log(`\n✅ Seeding complete:`)
  console.log(`  tier_config rows: ${tierCount?.val ?? 0}`)
  console.log(`  founding_member_counter rows: ${counterCount?.val ?? 0}`)

  await client.end()
}

seedTiersAndCounter().catch(err => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
