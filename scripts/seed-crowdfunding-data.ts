/**
 * Validore — Synthetic Crowdfunding Dataset Seed Script
 * Generates exactly 300 synthetic campaigns for benchmark analysis.
 * ALL records are labeled SYNTHETIC DATA — not real platform data.
 * Idempotent: skips if ≥300 records already exist.
 *
 * Run: npx ts-node --project tsconfig.json scripts/seed-crowdfunding-data.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { syntheticCampaigns } from '../src/db/schema'
import { count } from 'drizzle-orm'

const client = postgres(process.env.DATABASE_URL!, { prepare: false })
const db = drizzle(client)

const CATEGORIES = [
  { name: 'Technology', count: 60 },
  { name: 'Consumer Products', count: 40 },
  { name: 'Education', count: 35 },
  { name: 'Gaming', count: 35 },
  { name: 'Design', count: 30 },
  { name: 'Food', count: 25 },
  { name: 'Sustainability', count: 25 },
  { name: 'Fashion', count: 25 },
  { name: 'Social Impact', count: 25 },
]

const SUBCATEGORIES: Record<string, string[]> = {
  'Technology': ['Apps', 'Hardware', 'Wearables', 'SaaS', 'AI Tools'],
  'Consumer Products': ['Home Goods', 'Personal Care', 'Outdoor', 'Fitness', 'Pets'],
  'Education': ['EdTech', 'Kids Learning', 'Professional Dev', 'STEM', 'Language'],
  'Gaming': ['Video Games', 'Board Games', 'Card Games', 'VR/AR', 'Tabletop RPG'],
  'Design': ['Product Design', 'Typography', 'Illustration', 'Photography', 'Architecture'],
  'Food': ['Specialty Food', 'Beverages', 'Snacks', 'Restaurant', 'Farm-to-Table'],
  'Sustainability': ['Clean Energy', 'Zero Waste', 'Sustainable Fashion', 'Eco Tech', 'Conservation'],
  'Fashion': ['Accessories', 'Clothing', 'Jewelry', 'Footwear', 'Upcycled'],
  'Social Impact': ['Community', 'Healthcare', 'Environment', 'Arts & Culture', 'Education Access'],
}

const COUNTRIES = [
  { name: 'United States', count: 100 },
  { name: 'United Kingdom', count: 50 },
  { name: 'India', count: 40 },
  { name: 'Canada', count: 30 },
  { name: 'Australia', count: 25 },
  { name: 'Germany', count: 30 },
  { name: 'France', count: 25 },
]

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateCampaign(
  category: string,
  country: string,
  index: number
): typeof syntheticCampaigns.$inferInsert {
  // ~38% success rate (matches historical Kickstarter)
  const isSuccessful = Math.random() < 0.38

  const fundingGoal = pick([
    rand(1000, 5000),
    rand(5000, 25000),
    rand(25000, 100000),
    rand(100000, 500000),
  ])

  const campaignDuration = rand(20, 45)
  const numberOfBackers = isSuccessful ? rand(50, 2000) : rand(0, 49)
  const averageContribution = randFloat(15, 150)
  const amountRaised = isSuccessful
    ? Math.round(fundingGoal * randFloat(1.0, 3.5))
    : Math.round(fundingGoal * randFloat(0.05, 0.99))
  const fundingPercentage = ((amountRaised / fundingGoal) * 100).toFixed(1)

  const socialMediaFollowers = rand(100, 50000)
  const emailListSize = rand(0, socialMediaFollowers * 0.3)
  const preLaunchCommunitySize = rand(0, emailListSize)

  const websiteTraffic = rand(500, 100000)
  const campaignPageVisits = rand(200, websiteTraffic)
  const conversionRate = campaignPageVisits > 0
    ? ((numberOfBackers / campaignPageVisits) * 100).toFixed(2)
    : '0.00'

  const marketingSpend = rand(0, Math.round(fundingGoal * 0.15))
  const rewardTiers = rand(3, 8)
  const lowestReward = rand(5, 25)
  const averageReward = rand(lowestReward + 10, lowestReward + 100)
  const highestReward = rand(averageReward + 50, averageReward + 500)

  const first24HourFunding = isSuccessful
    ? Math.round(amountRaised * randFloat(0.15, 0.35))
    : Math.round(amountRaised * randFloat(0.05, 0.20))
  const first7DayFunding = Math.min(
    amountRaised,
    first24HourFunding + Math.round(amountRaised * randFloat(0.2, 0.5))
  )

  const subcategory = pick(SUBCATEGORIES[category] ?? ['General'])
  const launchMonth = rand(1, 12)

  return {
    campaignName: `${category} Project ${index + 1} — ${country}`,
    category,
    subcategory,
    country,
    fundingGoal,
    amountRaised,
    fundingPercentage,
    numberOfBackers,
    averageContribution: averageContribution.toFixed(2),
    campaignDuration,
    launchMonth,
    rewardTiers,
    lowestReward,
    averageReward,
    highestReward,
    videoAvailable: Math.random() > 0.3,
    numberOfImages: rand(3, 20),
    storyLength: rand(300, 3000),
    socialMediaFollowers,
    emailListSize: Math.round(emailListSize),
    preLaunchCommunitySize,
    marketingSpend,
    websiteTraffic,
    campaignPageVisits,
    conversionRate,
    updatesPosted: rand(0, isSuccessful ? 20 : 5),
    commentsEngagement: rand(0, numberOfBackers * 3),
    first24HourFunding,
    first7DayFunding,
    repeatBackerIndicator: isSuccessful && Math.random() > 0.5,
    campaignStatus: isSuccessful ? 'Successful' : 'Unsuccessful',
    dataLabel: 'SYNTHETIC DATA',
  }
}

// ── Data cleaning validations ──────────────────────────────────────────────────

function validateCampaign(c: ReturnType<typeof generateCampaign>): boolean {
  if (!c.fundingGoal || c.fundingGoal <= 0) return false               // No missing/zero goals
  if (!c.amountRaised || c.amountRaised < 0) return false              // No negative amounts
  if (c.numberOfBackers < 0) return false                              // No negative backers
  if (c.campaignDuration < 1 || c.campaignDuration > 60) return false  // Reasonable duration
  if (c.lowestReward <= 0 || c.averageReward <= 0) return false         // No zero rewards
  if (c.averageReward < c.lowestReward) return false                   // Average >= lowest
  if (c.highestReward < c.averageReward) return false                  // Highest >= average
  if (c.marketingSpend < 0) return false                               // No negative spend
  if (!['Successful', 'Unsuccessful'].includes(c.campaignStatus)) return false
  if (c.dataLabel !== 'SYNTHETIC DATA') return false                   // Always labeled
  return true
}

async function seed() {
  console.log('🌱 Validore Synthetic Campaign Seed Script')
  console.log('⚠️  ALL DATA IS SYNTHETIC — NOT REAL PLATFORM DATA\n')

  // Check idempotency
  const existing = await db.select({ total: count() }).from(syntheticCampaigns)
  const existingCount = Number(existing[0]?.total ?? 0)
  if (existingCount >= 300) {
    console.log(`✅ ${existingCount} synthetic campaigns already exist. Skipping seed (idempotent).`)
    await client.end()
    return
  }

  console.log(`Found ${existingCount} existing campaigns. Generating ${300 - existingCount} more...`)

  const campaigns: typeof syntheticCampaigns.$inferInsert[] = []

  // Generate campaigns per category × country distribution
  let globalIndex = 0
  for (const cat of CATEGORIES) {
    for (let i = 0; i < cat.count; i++) {
      // Pick country weighted by distribution
      const countryPool = COUNTRIES.flatMap(c => Array(c.count).fill(c.name))
      const country = pick(countryPool)
      const campaign = generateCampaign(cat.name, country, globalIndex++)

      // Data cleaning validation
      if (!validateCampaign(campaign)) {
        console.warn(`Skipped invalid campaign ${globalIndex} — validation failed`)
        continue
      }

      campaigns.push(campaign)
    }
  }

  // Remove duplicates (by campaign name — simple deduplication)
  const unique = campaigns.filter((c, idx, arr) =>
    arr.findIndex(x => x.campaignName === c.campaignName) === idx
  )

  // Ensure we have exactly 300
  while (unique.length < 300) {
    const extra = generateCampaign('Technology', 'United States', unique.length + 1000)
    if (validateCampaign(extra)) unique.push(extra)
  }
  const final = unique.slice(0, 300)

  // Sanity checks before insert
  console.log(`\n📊 Dataset Summary (SYNTHETIC DATA):`)
  const successful = final.filter(c => c.campaignStatus === 'Successful').length
  console.log(`  Total: ${final.length}`)
  console.log(`  Successful: ${successful} (${(successful / final.length * 100).toFixed(1)}%)`)
  console.log(`  Unsuccessful: ${final.length - successful}`)
  console.log(`  Categories: ${[...new Set(final.map(c => c.category))].join(', ')}`)
  console.log(`  Countries: ${[...new Set(final.map(c => c.country))].join(', ')}`)
  console.log(`  Avg Funding Goal: $${Math.round(final.reduce((s, c) => s + c.fundingGoal, 0) / final.length).toLocaleString()}`)
  console.log(`  All labeled: ${final.every(c => c.dataLabel === 'SYNTHETIC DATA') ? '✅ SYNTHETIC DATA' : '❌ MISSING LABELS'}`)

  // Insert in batches of 50
  const BATCH_SIZE = 50
  for (let b = 0; b < final.length; b += BATCH_SIZE) {
    const batch = final.slice(b, b + BATCH_SIZE)
    await db.insert(syntheticCampaigns).values(batch)
    console.log(`  Inserted batch ${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(final.length / BATCH_SIZE)}`)
  }

  console.log(`\n✅ Seed complete: ${final.length} synthetic campaigns inserted.`)
  console.log('⚠️  Remember: This is SYNTHETIC DATA for educational benchmarks only.')
  await client.end()
}

seed().catch(err => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})