import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { count } from 'drizzle-orm'
import {
  tierConfig,
  foundingMemberCounter,
  syntheticCampaigns,
} from '../src/db/schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const client = postgres(process.env.DATABASE_URL, { prepare: false })
const db = drizzle(client)

const EXPECTED_TABLES = [
  'credit_purchases',
  'crowdfunding_analyses',
  'founding_member_counter',
  'ideas',
  'lean_canvases',
  'pitch_decks',
  'pricing_simulations',
  'synthetic_campaigns',
  'tier_config',
  'users',
  'validation_jobs',
  'validation_reports',
].sort()

const EXPECTED_ENUMS: Record<string, string[]> = {
  tier: ['free', 'premium', 'max_premium'],
  evidence_strength: ['WEAK', 'MODERATE', 'STRONGER'],
  job_status: ['pending', 'running', 'partial', 'complete', 'failed'],
  decision: ['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO'],
}

async function verify() {
  console.log('🔍 Running Database Setup & Seeding Verification...')
  let hasErrors = false

  // 1. Verify connection
  try {
    const [nowResult] = await client`SELECT NOW() as current_time, current_database() as db_name, version() as pg_version`
    console.log(`\n✓ Database connection successful`)
    console.log(`  Database: ${nowResult.db_name}`)
    console.log(`  Time: ${nowResult.current_time}`)
    console.log(`  Version: ${nowResult.pg_version}`)
  } catch (err) {
    console.error('❌ Database connection failed:', err)
    process.exit(1)
  }

  // 2. Verify all 12 tables
  console.log('\n--- 1. Tables Verification ---')
  const tablesResult = await client`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `
  const existingTables = tablesResult.map(r => r.table_name)
  console.log(`Found ${existingTables.length} public tables in database:`)
  existingTables.forEach(t => console.log(`  - ${t}`))

  const missingTables = EXPECTED_TABLES.filter(t => !existingTables.includes(t))
  if (missingTables.length > 0) {
    console.error(`❌ Missing tables: ${missingTables.join(', ')}`)
    hasErrors = true
  } else {
    console.log(`✅ All ${EXPECTED_TABLES.length} expected tables exist.`)
  }

  // 3. Verify all 4 enums
  console.log('\n--- 2. Enums Verification ---')
  const enumsResult = await client`
    SELECT t.typname AS enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    GROUP BY t.typname
    ORDER BY t.typname;
  `
  const existingEnums: Record<string, string[]> = {}
  enumsResult.forEach(r => {
    existingEnums[r.enum_name] = r.enum_values
    console.log(`  Enum '${r.enum_name}': [${r.enum_values.join(', ')}]`)
  })

  for (const [enumName, expectedValues] of Object.entries(EXPECTED_ENUMS)) {
    if (!existingEnums[enumName]) {
      console.error(`❌ Missing enum: ${enumName}`)
      hasErrors = true
    } else {
      const actualValues = existingEnums[enumName]
      const matches = expectedValues.every(v => actualValues.includes(v)) && actualValues.length === expectedValues.length
      if (!matches) {
        console.error(`❌ Enum '${enumName}' values mismatch. Expected [${expectedValues}], got [${actualValues}]`)
        hasErrors = true
      } else {
        console.log(`  ✓ Enum '${enumName}' matches specification`)
      }
    }
  }

  // 4. Verify tier_config rows
  console.log('\n--- 3. Tier Config Verification ---')
  const tiers = await db.select().from(tierConfig)
  console.log(`tier_config has ${tiers.length} rows:`)
  tiers.forEach(t => {
    console.log(`  Tier: ${t.tier} | Limit: ${t.monthlyValidationLimit} | Ideas: ${t.maxActiveIdeas} | PDF: ${t.canExportPdf} | CSV: ${t.canExportCsv} | PPTX: ${t.canExportPptx} | WhiteLabel: ${t.canWhitelabelPdf} | Portfolio: ${t.canPortfolioExport}`)
  })

  if (tiers.length !== 3) {
    console.error(`❌ Expected exactly 3 tiers, found ${tiers.length}`)
    hasErrors = true
  } else {
    const tierNames = tiers.map(t => t.tier).sort()
    if (JSON.stringify(tierNames) !== JSON.stringify(['free', 'max_premium', 'premium'])) {
      console.error(`❌ Missing expected tier names: ${tierNames}`)
      hasErrors = true
    } else {
      console.log(`✅ tier_config contains free, premium, and max_premium tiers.`)
    }
  }

  // 5. Verify founding_member_counter rows
  console.log('\n--- 4. Founding Member Counter Verification ---')
  const counters = await db.select().from(foundingMemberCounter)
  console.log(`founding_member_counter has ${counters.length} rows:`)
  counters.forEach(c => console.log(`  ID: ${c.id}, Count: ${c.count}, Cap: ${c.cap}`))

  if (counters.length !== 1) {
    console.error(`❌ Expected 1 counter row, found ${counters.length}`)
    hasErrors = true
  } else if (counters[0].id !== 1 || counters[0].count !== 0 || counters[0].cap !== 100) {
    console.error(`❌ founding_member_counter unexpected values: ${JSON.stringify(counters[0])}`)
    hasErrors = true
  } else {
    console.log(`✅ founding_member_counter initialized correctly (id=1, count=0, cap=100).`)
  }

  // 6. Verify synthetic_campaigns rows
  console.log('\n--- 5. Synthetic Campaigns Verification ---')
  const [campaignCountResult] = await db.select({ total: count() }).from(syntheticCampaigns)
  const totalCampaigns = Number(campaignCountResult?.total ?? 0)
  console.log(`synthetic_campaigns total row count: ${totalCampaigns}`)

  if (totalCampaigns < 300) {
    console.error(`❌ Expected >= 300 synthetic campaigns, found ${totalCampaigns}`)
    hasErrors = true
  } else {
    console.log(`✅ synthetic_campaigns count >= 300 (${totalCampaigns} rows).`)
  }

  // Check categories and data label
  const sampleCampaigns = await db.select().from(syntheticCampaigns).limit(5)
  console.log(`Sample campaign 1: ${sampleCampaigns[0]?.campaignName} (${sampleCampaigns[0]?.category}, $${sampleCampaigns[0]?.fundingGoal} goal, status: ${sampleCampaigns[0]?.campaignStatus}, label: ${sampleCampaigns[0]?.dataLabel})`)

  const [nonLabeledCountResult] = await client`SELECT count(*) as cnt FROM synthetic_campaigns WHERE data_label != 'SYNTHETIC DATA'`
  const nonLabeled = Number(nonLabeledCountResult.cnt)
  if (nonLabeled > 0) {
    console.error(`❌ Found ${nonLabeled} campaigns without 'SYNTHETIC DATA' label`)
    hasErrors = true
  } else {
    console.log(`✅ All ${totalCampaigns} campaigns have data_label='SYNTHETIC DATA'.`)
  }

  await client.end()

  console.log('\n==========================================')
  if (hasErrors) {
    console.error('❌ VERIFICATION FAILED: Issues found in database setup.')
    process.exit(1)
  } else {
    console.log('✅ ALL VERIFICATIONS PASSED: Database is production ready!')
    console.log('==========================================')
  }
}

verify().catch(err => {
  console.error('❌ Verification script crashed:', err)
  process.exit(1)
})
