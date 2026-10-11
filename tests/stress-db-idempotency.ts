import { config } from 'dotenv'
config({ path: '.env.local' })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { tierConfig, foundingMemberCounter, syntheticCampaigns } from '../src/db/schema'
import { count, eq } from 'drizzle-orm'
import { execSync } from 'child_process'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const client = postgres(process.env.DATABASE_URL, { prepare: false })
const db = drizzle(client)

async function runStressTests() {
  console.log('🧪 Starting Empirical Database Idempotency & Resilience Stress Test...')

  // Test 1: Verify Initial State
  console.log('\n--- Test 1: Initial Baseline State ---')
  const [initialTiers] = await db.select({ total: count() }).from(tierConfig)
  const [initialCounters] = await db.select({ total: count() }).from(foundingMemberCounter)
  const [initialCampaigns] = await db.select({ total: count() }).from(syntheticCampaigns)

  console.log(`Initial tier_config count: ${initialTiers.total}`)
  console.log(`Initial founding_member_counter count: ${initialCounters.total}`)
  console.log(`Initial synthetic_campaigns count: ${initialCampaigns.total}`)

  if (Number(initialTiers.total) !== 3) throw new Error(`Expected 3 tiers, got ${initialTiers.total}`)
  if (Number(initialCounters.total) !== 1) throw new Error(`Expected 1 counter, got ${initialCounters.total}`)
  if (Number(initialCampaigns.total) !== 300) throw new Error(`Expected 300 campaigns, got ${initialCampaigns.total}`)
  console.log('✅ Test 1 Passed: Initial state matches specification.')

  // Test 2: Counter Non-Reset Under Re-seed (Active Business State Preservation)
  console.log('\n--- Test 2: Counter Non-Reset Under Re-seed ---')
  const TEST_COUNT_VALUE = 42
  console.log(`Simulating active user signups by updating founding_member_counter.count to ${TEST_COUNT_VALUE}...`)
  await db.update(foundingMemberCounter).set({ count: TEST_COUNT_VALUE }).where(eq(foundingMemberCounter.id, 1))

  const [simulatedCounter] = await db.select().from(foundingMemberCounter).where(eq(foundingMemberCounter.id, 1))
  console.log(`Verified counter updated in DB: count = ${simulatedCounter.count}`)
  if (simulatedCounter.count !== TEST_COUNT_VALUE) {
    throw new Error(`Failed to update counter to ${TEST_COUNT_VALUE}`)
  }

  console.log('Running `npm run db:seed` while counter is at simulated value...')
  execSync('npm run db:seed', { encoding: 'utf8' })
  console.log('db:seed execution finished.')

  const [counterAfterSeed] = await db.select().from(foundingMemberCounter).where(eq(foundingMemberCounter.id, 1))
  console.log(`Counter value after re-seed: ${counterAfterSeed.count}`)
  
  if (counterAfterSeed.count !== TEST_COUNT_VALUE) {
    throw new Error(`❌ REGRESSION: db:seed RESET the founding_member_counter from ${TEST_COUNT_VALUE} to ${counterAfterSeed.count}!`)
  }
  console.log(`✅ Test 2 Passed: founding_member_counter was NOT reset (retained count = ${TEST_COUNT_VALUE}).`)

  // Restore counter back to pristine 0
  console.log('Restoring founding_member_counter.count back to 0...')
  await db.update(foundingMemberCounter).set({ count: 0 }).where(eq(foundingMemberCounter.id, 1))
  const [restoredCounter] = await db.select().from(foundingMemberCounter).where(eq(foundingMemberCounter.id, 1))
  if (restoredCounter.count !== 0) throw new Error('Failed to restore counter to 0')
  console.log('✓ Counter successfully restored to 0.')

  // Test 3: Multiple Consecutive Seed Invocations (Row Count Invariant)
  console.log('\n--- Test 3: Consecutive Re-seed Stability ---')
  for (let i = 1; i <= 3; i++) {
    console.log(`Executing db:seed cycle ${i}/3...`)
    execSync('npm run db:seed', { encoding: 'utf8' })
  }

  const [tiersAfter] = await db.select({ total: count() }).from(tierConfig)
  const [countersAfter] = await db.select({ total: count() }).from(foundingMemberCounter)
  const [campaignsAfter] = await db.select({ total: count() }).from(syntheticCampaigns)

  console.log(`Post-stress tier_config count: ${tiersAfter.total}`)
  console.log(`Post-stress founding_member_counter count: ${countersAfter.total}`)
  console.log(`Post-stress synthetic_campaigns count: ${campaignsAfter.total}`)

  if (Number(tiersAfter.total) !== 3) throw new Error(`Duplicate tiers detected! Count: ${tiersAfter.total}`)
  if (Number(countersAfter.total) !== 1) throw new Error(`Duplicate counters detected! Count: ${countersAfter.total}`)
  if (Number(campaignsAfter.total) !== 300) throw new Error(`Duplicate synthetic campaigns detected! Count: ${campaignsAfter.total}`)
  console.log('✅ Test 3 Passed: Absolute zero row drift across multiple seed cycles.')

  // Test 4: Full System Verification Script Integrity
  console.log('\n--- Test 4: Full System Verification Script Execution ---')
  const verifyOutput = execSync('npm run db:verify', { encoding: 'utf8' })
  if (!verifyOutput.includes('ALL VERIFICATIONS PASSED')) {
    throw new Error('npm run db:verify failed after stress test!')
  }
  console.log('✅ Test 4 Passed: npm run db:verify executed and passed completely.')

  console.log('\n🎉 ALL EMPIRICAL STRESS TESTS PASSED SUCCESSFULLY!')
  await client.end()
}

runStressTests().catch(async (err) => {
  console.error('\n❌ STRESS TEST FAILURE:', err)
  try {
    // Ensure counter is restored to 0 on failure
    await db.update(foundingMemberCounter).set({ count: 0 }).where(eq(foundingMemberCounter.id, 1))
  } catch {}
  await client.end()
  process.exit(1)
})
