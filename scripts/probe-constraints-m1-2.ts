import { config } from 'dotenv'
config({ path: '.env.local' })

import postgres from 'postgres'

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is missing')
  process.exit(1)
}

const client = postgres(process.env.DATABASE_URL, { prepare: false })

interface PostgresErrorLike {
  code?: string
  message?: string
}

interface TestResult {
  category: string
  testName: string
  status: 'PASS' | 'FAIL'
  details: string
}

const results: TestResult[] = []

function record(category: string, testName: string, passed: boolean, details: string) {
  results.push({
    category,
    testName,
    status: passed ? 'PASS' : 'FAIL',
    details,
  })
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} [${category}] ${testName}: ${details}`)
}

async function runProbes() {
  console.log('🧪 Starting Milestone 1-2 Database Constraints & Invariants Probe...\n')

  const testUserEmail = `probe-test-${Date.now()}@example.com`
  const testSupabaseId = `probe-sub-${Date.now()}`
  let testUserId: string | null = null
  let testIdeaId: string | null = null
  let defaultUserTestId: string | null = null

  try {
    // ==========================================
    // 1. ENUM CONSTRAINT VIOLATION TESTS
    // ==========================================
    console.log('--- 1. Testing PostgreSQL Enum Constraints ---')

    // 1.1 Invalid tier enum on users table
    try {
      await client`INSERT INTO users (email, supabase_id, tier) VALUES ('invalid-enum@test.com', 'invalid-sub-1', 'invalid_tier'::tier)`
      record('Enum Constraints', 'users.tier invalid enum rejected', false, 'Allowed insertion of invalid tier enum!')
      await client`DELETE FROM users WHERE email = 'invalid-enum@test.com'`
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const msg = err.message || ''
      const expected = code === '22P02' || msg.includes('invalid input value for enum tier')
      record('Enum Constraints', 'users.tier invalid enum rejected', expected, `Postgres rejected with code=${code} msg="${msg}"`)
    }

    // 1.2 Invalid tier enum on tier_config table
    try {
      await client`INSERT INTO tier_config (tier, monthly_validation_limit, max_active_ideas, max_concurrent_requests, max_tokens_per_call)
        VALUES ('god_mode'::tier, 999, 999, 999, 999)`
      record('Enum Constraints', 'tier_config.tier invalid enum rejected', false, 'Allowed insertion of invalid tier enum into tier_config!')
      await client`DELETE FROM tier_config WHERE monthly_validation_limit = 999`
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const msg = err.message || ''
      const expected = code === '22P02' || msg.includes('invalid input value for enum tier')
      record('Enum Constraints', 'tier_config.tier invalid enum rejected', expected, `Postgres rejected with code=${code} msg="${msg}"`)
    }

    // 1.3 Invalid job_status enum
    try {
      await client`SELECT 'invalid_status'::job_status`
      record('Enum Constraints', 'job_status invalid enum rejected', false, 'Allowed casting invalid job_status!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const expected = code === '22P02'
      record('Enum Constraints', 'job_status invalid enum rejected', expected, `Postgres rejected with code=${code}`)
    }

    // 1.4 Invalid decision enum
    try {
      await client`SELECT 'UNDECIDED'::decision`
      record('Enum Constraints', 'decision invalid enum rejected', false, 'Allowed casting invalid decision!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const expected = code === '22P02'
      record('Enum Constraints', 'decision invalid enum rejected', expected, `Postgres rejected with code=${code}`)
    }

    // 1.5 Invalid evidence_strength enum
    try {
      await client`SELECT 'EXTREME'::evidence_strength`
      record('Enum Constraints', 'evidence_strength invalid enum rejected', false, 'Allowed casting invalid evidence_strength!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const expected = code === '22P02'
      record('Enum Constraints', 'evidence_strength invalid enum rejected', expected, `Postgres rejected with code=${code}`)
    }

    // ==========================================
    // 2. UNIQUE CONSTRAINT TESTS
    // ==========================================
    console.log('\n--- 2. Testing PostgreSQL Unique Constraints ---')

    // 2.1 Duplicate tier_config.tier
    try {
      await client`INSERT INTO tier_config (tier, monthly_validation_limit, max_active_ideas, max_concurrent_requests, max_tokens_per_call)
        VALUES ('free'::tier, 10, 10, 10, 10)`
      record('Unique Constraints', 'tier_config.tier duplicate rejected', false, 'Allowed duplicate tier in tier_config!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isUniqueViolation = code === '23505'
      record('Unique Constraints', 'tier_config.tier duplicate rejected', isUniqueViolation, `Postgres threw unique_violation code=${code}`)
    }

    // 2.2 Create valid user for testing
    const [insertedUser] = await client`
      INSERT INTO users (email, supabase_id, tier)
      VALUES (${testUserEmail}, ${testSupabaseId}, 'free'::tier)
      RETURNING id
    `
    testUserId = insertedUser.id
    console.log(`  (Created temporary probe user id: ${testUserId})`)

    // 2.3 Duplicate users.email
    try {
      await client`
        INSERT INTO users (email, supabase_id, tier)
        VALUES (${testUserEmail}, 'different-supabase-id', 'free'::tier)
      `
      record('Unique Constraints', 'users.email duplicate rejected', false, 'Allowed duplicate user email!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isUniqueViolation = code === '23505'
      record('Unique Constraints', 'users.email duplicate rejected', isUniqueViolation, `Postgres threw unique_violation code=${code}`)
    }

    // 2.4 Duplicate users.supabase_id
    try {
      await client`
        INSERT INTO users (email, supabase_id, tier)
        VALUES ('different-email@test.com', ${testSupabaseId}, 'free'::tier)
      `
      record('Unique Constraints', 'users.supabase_id duplicate rejected', false, 'Allowed duplicate supabase_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isUniqueViolation = code === '23505'
      record('Unique Constraints', 'users.supabase_id duplicate rejected', isUniqueViolation, `Postgres threw unique_violation code=${code}`)
    }

    // 2.5 Duplicate founding_member_counter.id
    try {
      await client`
        INSERT INTO founding_member_counter (id, count, cap)
        VALUES (1, 50, 100)
      `
      record('Unique Constraints', 'founding_member_counter.id duplicate rejected', false, 'Allowed duplicate founding_member_counter id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isUniqueViolation = code === '23505'
      record('Unique Constraints', 'founding_member_counter.id duplicate rejected', isUniqueViolation, `Postgres threw unique_violation code=${code}`)
    }

    // ==========================================
    // 3. COLUMN DEFAULT VALUES & NOT-NULL CONSTRAINTS
    // ==========================================
    console.log('\n--- 3. Testing Defaults & Nullability Constraints ---')

    // 3.1 users.tier defaults to 'free' when omitted
    const defaultTestEmail = `probe-default-${Date.now()}@example.com`
    const defaultTestSubId = `probe-default-sub-${Date.now()}`
    const [userWithDefaults] = await client`
      INSERT INTO users (email, supabase_id)
      VALUES (${defaultTestEmail}, ${defaultTestSubId})
      RETURNING id, tier, crowdfunding_credits, pitch_deck_credits, validations_this_month, is_founding_member
    `
    defaultUserTestId = userWithDefaults.id
    const defaultTierIsFree = userWithDefaults.tier === 'free'
    const defaultCreditsZero = userWithDefaults.crowdfunding_credits === 0 && userWithDefaults.pitch_deck_credits === 0
    record(
      'Defaults & Nullability',
      'users default tier and credit values applied correctly',
      defaultTierIsFree && defaultCreditsZero,
      `tier=${userWithDefaults.tier}, cf_credits=${userWithDefaults.crowdfunding_credits}, pd_credits=${userWithDefaults.pitch_deck_credits}`
    )

    // 3.2 users.email NOT NULL constraint
    try {
      await client`INSERT INTO users (email, supabase_id) VALUES (NULL, 'null-email-sub')`
      record('Defaults & Nullability', 'users.email NULL rejected', false, 'Allowed NULL email in users!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isNullViolation = code === '23502'
      record('Defaults & Nullability', 'users.email NULL rejected', isNullViolation, `Postgres threw not_null_violation code=${code}`)
    }

    // ==========================================
    // 4. FOREIGN KEY RELATION TESTS
    // ==========================================
    console.log('\n--- 4. Testing Foreign Key Referential Integrity ---')

    // 4.1 Catalog verification of FK constraints
    const fkQuery = await client`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        tc.constraint_name
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
      ORDER BY tc.table_name, kcu.column_name;
    `
    console.log(`  Found ${fkQuery.length} foreign key constraints in database catalog:`)
    fkQuery.forEach(fk => {
      console.log(`    - ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name} (${fk.constraint_name})`)
    })

    const expectedFks = [
      { table: 'credit_purchases', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'crowdfunding_analyses', col: 'idea_id', refTable: 'ideas', refCol: 'id' },
      { table: 'crowdfunding_analyses', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'ideas', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'lean_canvases', col: 'idea_id', refTable: 'ideas', refCol: 'id' },
      { table: 'lean_canvases', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'pitch_decks', col: 'idea_id', refTable: 'ideas', refCol: 'id' },
      { table: 'pitch_decks', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'pricing_simulations', col: 'idea_id', refTable: 'ideas', refCol: 'id' },
      { table: 'pricing_simulations', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'validation_jobs', col: 'idea_id', refTable: 'ideas', refCol: 'id' },
      { table: 'validation_jobs', col: 'user_id', refTable: 'users', refCol: 'id' },
      { table: 'validation_reports', col: 'idea_id', refTable: 'ideas', refCol: 'id' },
      { table: 'validation_reports', col: 'job_id', refTable: 'validation_jobs', refCol: 'id' },
      { table: 'validation_reports', col: 'user_id', refTable: 'users', refCol: 'id' },
    ]

    let allFksExist = true
    for (const efk of expectedFks) {
      const match = fkQuery.find(f => 
        f.table_name === efk.table && 
        f.column_name === efk.col && 
        f.foreign_table_name === efk.refTable && 
        f.foreign_column_name === efk.refCol
      )
      if (!match) {
        allFksExist = false
        console.error(`  ❌ Missing expected FK: ${efk.table}.${efk.col} -> ${efk.refTable}.${efk.refCol}`)
      }
    }
    record('Foreign Key Constraints', 'Catalog FK definition completeness', allFksExist, `Catalog contains ${fkQuery.length} foreign keys matching schema definitions`)

    const nonExistentUuid = '00000000-0000-0000-0000-000000000000'

    // 4.2 ideas.userId -> users.id violation
    try {
      await client`
        INSERT INTO ideas (user_id, name, industry, product, target_customer, location, business_model, core_problem, proposed_solution)
        VALUES (${nonExistentUuid}, 'Probe Idea', 'Tech', 'Prod', 'Cust', 'Loc', 'B2B', 'Prob', 'Sol')
      `
      record('Foreign Key Constraints', 'ideas.user_id FK violation rejected', false, 'Allowed inserting idea with invalid user_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'ideas.user_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.3 credit_purchases.userId -> users.id violation
    try {
      await client`
        INSERT INTO credit_purchases (user_id, credit_type, quantity, amount_usd)
        VALUES (${nonExistentUuid}, 'bundle', 1, 49)
      `
      record('Foreign Key Constraints', 'credit_purchases.user_id FK violation rejected', false, 'Allowed inserting credit purchase with invalid user_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'credit_purchases.user_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.4 validation_jobs.idea_id FK violation
    try {
      await client`
        INSERT INTO validation_jobs (idea_id, user_id)
        VALUES (${nonExistentUuid}, ${testUserId})
      `
      record('Foreign Key Constraints', 'validation_jobs.idea_id FK violation rejected', false, 'Allowed inserting validation_job with invalid idea_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'validation_jobs.idea_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.5 lean_canvases.idea_id FK violation
    try {
      await client`
        INSERT INTO lean_canvases (idea_id, user_id)
        VALUES (${nonExistentUuid}, ${testUserId})
      `
      record('Foreign Key Constraints', 'lean_canvases.idea_id FK violation rejected', false, 'Allowed inserting lean_canvas with invalid idea_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'lean_canvases.idea_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.6 pricing_simulations.idea_id FK violation
    try {
      await client`
        INSERT INTO pricing_simulations (idea_id, user_id)
        VALUES (${nonExistentUuid}, ${testUserId})
      `
      record('Foreign Key Constraints', 'pricing_simulations.idea_id FK violation rejected', false, 'Allowed inserting pricing_simulation with invalid idea_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'pricing_simulations.idea_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.7 pitch_decks.idea_id FK violation
    try {
      await client`
        INSERT INTO pitch_decks (idea_id, user_id)
        VALUES (${nonExistentUuid}, ${testUserId})
      `
      record('Foreign Key Constraints', 'pitch_decks.idea_id FK violation rejected', false, 'Allowed inserting pitch_deck with invalid idea_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'pitch_decks.idea_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.8 crowdfunding_analyses.idea_id FK violation
    try {
      await client`
        INSERT INTO crowdfunding_analyses (idea_id, user_id)
        VALUES (${nonExistentUuid}, ${testUserId})
      `
      record('Foreign Key Constraints', 'crowdfunding_analyses.idea_id FK violation rejected', false, 'Allowed inserting crowdfunding_analysis with invalid idea_id!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'crowdfunding_analyses.idea_id FK violation rejected', isFkViolation, `Postgres threw foreign_key_violation code=${code}`)
    }

    // 4.9 Create valid idea referencing test user
    const [insertedIdea] = await client`
      INSERT INTO ideas (user_id, name, industry, product, target_customer, location, business_model, core_problem, proposed_solution)
      VALUES (${testUserId}, 'Probe Idea', 'SaaS', 'Probe Platform', 'Devs', 'Remote', 'Subscription', 'Slow testing', 'Automated probes')
      RETURNING id
    `
    testIdeaId = insertedIdea.id
    console.log(`  (Created temporary probe idea id: ${testIdeaId} referencing user ${testUserId})`)

    // 4.10 Test RESTRICT / NO ACTION behavior: deleting user while idea exists
    try {
      await client`DELETE FROM users WHERE id = ${testUserId}`
      record('Foreign Key Constraints', 'Parent delete restricted by child reference', false, 'Allowed deleting parent user while child idea exists!')
    } catch (error: unknown) {
      const err = error as PostgresErrorLike
      const code = err.code || ''
      const isFkViolation = code === '23503'
      record('Foreign Key Constraints', 'Parent delete restricted by child reference', isFkViolation, `Postgres prevented deleting parent user, code=${code}`)
    }

    // ==========================================
    // 5. SYNTHETIC CAMPAIGNS DATA DISTRIBUTION & LABELS
    // ==========================================
    console.log('\n--- 5. Testing Synthetic Campaigns Data Distribution & Label Consistency ---')

    // 5.1 Total count
    const [totalRes] = await client`SELECT count(*) as total FROM synthetic_campaigns`
    const totalCount = Number(totalRes.total)
    record('Synthetic Campaigns', 'Total count >= 300', totalCount >= 300, `Found ${totalCount} records`)

    // 5.2 Data label consistency (all rows must have 'SYNTHETIC DATA')
    const [invalidLabelRes] = await client`
      SELECT count(*) as invalid_count 
      FROM synthetic_campaigns 
      WHERE data_label != 'SYNTHETIC DATA' OR data_label IS NULL
    `
    const invalidLabelCount = Number(invalidLabelRes.invalid_count)
    record('Synthetic Campaigns', 'All records have data_label = "SYNTHETIC DATA"', invalidLabelCount === 0, `Found ${invalidLabelCount} rows with non-"SYNTHETIC DATA" label`)

    // 5.3 Null check on required columns
    const [nullCheckRes] = await client`
      SELECT count(*) as null_count
      FROM synthetic_campaigns
      WHERE campaign_name IS NULL
         OR category IS NULL
         OR country IS NULL
         OR funding_goal IS NULL
         OR amount_raised IS NULL
         OR funding_percentage IS NULL
         OR number_of_backers IS NULL
         OR average_contribution IS NULL
         OR campaign_duration IS NULL
         OR launch_month IS NULL
         OR reward_tiers IS NULL
         OR lowest_reward IS NULL
         OR average_reward IS NULL
         OR highest_reward IS NULL
         OR video_available IS NULL
         OR number_of_images IS NULL
         OR story_length IS NULL
         OR social_media_followers IS NULL
         OR email_list_size IS NULL
         OR pre_launch_community_size IS NULL
         OR marketing_spend IS NULL
         OR website_traffic IS NULL
         OR campaign_page_visits IS NULL
         OR conversion_rate IS NULL
         OR updates_posted IS NULL
         OR comments_engagement IS NULL
         OR first_24_hour_funding IS NULL
         OR first_7_day_funding IS NULL
         OR repeat_backer_indicator IS NULL
         OR campaign_status IS NULL
    `
    const nullCount = Number(nullCheckRes.null_count)
    record('Synthetic Campaigns', 'Non-nullable columns contain no NULLs', nullCount === 0, `Found ${nullCount} rows with unexpected NULLs`)

    // 5.4 Campaign status values
    const statuses = await client`
      SELECT campaign_status, count(*) as cnt 
      FROM synthetic_campaigns 
      GROUP BY campaign_status
      ORDER BY campaign_status
    `
    const statusMap = Object.fromEntries(statuses.map(s => [s.campaign_status, Number(s.cnt)]))
    const statusKeys = Object.keys(statusMap).sort()
    const validStatuses = statusKeys.every(k => k === 'Successful' || k === 'Unsuccessful') && statusKeys.length === 2
    record('Synthetic Campaigns', 'Status values binary (Successful / Unsuccessful)', validStatuses, `Distribution: ${JSON.stringify(statusMap)}`)

    // 5.5 Category distribution
    const categories = await client`
      SELECT category, count(*) as cnt 
      FROM synthetic_campaigns 
      GROUP BY category 
      ORDER BY cnt DESC
    `
    const categoryCount = categories.length
    record('Synthetic Campaigns', 'Multiple diverse categories present (>= 5)', categoryCount >= 5, `Found ${categoryCount} distinct categories: ${categories.map(c => `${c.category} (${c.cnt})`).join(', ')}`)

    // 5.6 Numeric ranges & invariants
    const [numInvariants] = await client`
      SELECT 
        min(funding_goal) as min_goal,
        max(funding_goal) as max_goal,
        min(amount_raised) as min_raised,
        max(amount_raised) as max_raised,
        min(launch_month) as min_month,
        max(launch_month) as max_month,
        min(campaign_duration) as min_duration,
        max(campaign_duration) as max_duration,
        count(*) filter (WHERE funding_goal <= 0) as invalid_goals,
        count(*) filter (WHERE launch_month < 1 OR launch_month > 12) as invalid_months,
        count(*) filter (WHERE campaign_duration <= 0) as invalid_durations
      FROM synthetic_campaigns
    `
    const invalidGoals = Number(numInvariants.invalid_goals)
    const invalidMonths = Number(numInvariants.invalid_months)
    const invalidDurations = Number(numInvariants.invalid_durations)
    const numCheckPassed = invalidGoals === 0 && invalidMonths === 0 && invalidDurations === 0
    record(
      'Synthetic Campaigns',
      'Numeric bounds and invariant checks valid',
      numCheckPassed,
      `Goals: $${numInvariants.min_goal}..$${numInvariants.max_goal} (invalids=${invalidGoals}); Months: ${numInvariants.min_month}..${numInvariants.max_month} (invalids=${invalidMonths}); Durations: ${numInvariants.min_duration}..${numInvariants.max_duration}d (invalids=${invalidDurations})`
    )

    // ==========================================
    // 6. FOUNDING MEMBER COUNTER INVARIANTS
    // ==========================================
    console.log('\n--- 6. Testing Founding Member Counter Invariants ---')
    const [counter] = await client`SELECT * FROM founding_member_counter WHERE id = 1`
    const counterValid = counter && counter.id === 1 && counter.count >= 0 && counter.cap === 100
    record('Founding Member Counter', 'Counter row initialized and bounds valid', Boolean(counterValid), `id=${counter?.id}, count=${counter?.count}, cap=${counter?.cap}`)

  } catch (err) {
    console.error('Fatal probe execution error:', err)
  } finally {
    // ==========================================
    // 7. TEARDOWN & CLEANUP
    // ==========================================
    console.log('\n--- 7. Cleaning Up Temporary Probe Records ---')
    try {
      if (testIdeaId) {
        await client`DELETE FROM ideas WHERE id = ${testIdeaId}`
        console.log(`  Deleted temporary idea id: ${testIdeaId}`)
      }
      if (testUserId) {
        await client`DELETE FROM users WHERE id = ${testUserId}`
        console.log(`  Deleted temporary user id: ${testUserId}`)
      }
      if (defaultUserTestId) {
        await client`DELETE FROM users WHERE id = ${defaultUserTestId}`
        console.log(`  Deleted temporary user with defaults id: ${defaultUserTestId}`)
      }
      // Cleanup any test user email probe remnants
      await client`DELETE FROM users WHERE email LIKE 'probe-%' OR email = 'invalid-enum@test.com'`
      console.log('  Cleaned up all temporary probe artifacts.')
    } catch (cleanupErr) {
      console.error('  ⚠️ Error during cleanup:', cleanupErr)
    }

    // Verify cleanup
    const [remainingProbes] = await client`SELECT count(*) as cnt FROM users WHERE email LIKE 'probe-%'`
    const clean = Number(remainingProbes.cnt) === 0
    record('Teardown & Cleanup', 'Zero temporary probe records remaining', clean, `Remaining probe records: ${remainingProbes.cnt}`)

    await client.end()
  }

  // ==========================================
  // SUMMARY & VERDICT
  // ==========================================
  console.log('\n==========================================')
  console.log('📊 PROBE RESULTS SUMMARY')
  console.log('==========================================')
  const totalTests = results.length
  const passedTests = results.filter(r => r.status === 'PASS').length
  const failedTests = results.filter(r => r.status === 'FAIL').length

  console.log(`Total Probes: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`)
  
  if (failedTests > 0) {
    console.log('\n❌ VERDICT: REJECT (Found constraint or invariant violations)')
    process.exit(1)
  } else {
    console.log('\n✅ VERDICT: APPROVE (All constraints, enums, FKs, and invariants hold)')
    process.exit(0)
  }
}

runProbes()
