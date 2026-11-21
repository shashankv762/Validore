import { config } from 'dotenv'
config({ path: '.env.local', quiet: true })

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { count, getTableColumns, getTableName, is, Table } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { databaseErrorCode } from '../src/lib/database-errors'
const { tierConfig, foundingMemberCounter, syntheticCampaigns } = schema
const schemaOnly = process.argv.includes('--schema-only')

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required')
}

const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10,
  connection: { default_transaction_read_only: true, statement_timeout: 15_000 } })
const db = drizzle(client)

const applicationTables = Object.values(schema).filter(table => is(table, Table))
const EXPECTED_TABLES = applicationTables.map(getTableName).sort()

const EXPECTED_ENUMS: Record<string, string[]> = {
  tier: ['free', 'premium', 'max_premium'],
  evidence_strength: ['WEAK', 'MODERATE', 'STRONGER'],
  job_status: ['pending', 'running', 'partial', 'complete', 'failed'],
  decision: ['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO'],
}

async function verify() {
  console.log(schemaOnly ? 'Checking database schema and access...' : '🔍 Running Database Setup & Seeding Verification...')
  let hasErrors = false

  // 1. Verify connection
  try {
    const [nowResult] = await client`SELECT NOW() as current_time, current_database() as db_name, version() as pg_version`
    console.log(`\n✓ Database connection successful`)
    console.log(`  Database: ${nowResult.db_name}`)
    console.log(`  Time: ${nowResult.current_time}`)
    console.log(`  Version: ${nowResult.pg_version}`)
  } catch (cause) {
    throw new Error('Database connection failed.', { cause })
  }

  // 2. Verify application tables and browser-role isolation.
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

  const tableColumns = await client`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`
  for (const table of applicationTables) {
    const name = getTableName(table)
    if (!existingTables.includes(name)) continue
    const missing = Object.values(getTableColumns(table)).map(column => column.name)
      .filter(column => !tableColumns.some(row => row.table_name === name && row.column_name === column))
    if (missing.length) { console.error(`Schema mismatch in ${name}: missing ${missing.join(', ')}. Review the database rollout before serving this release.`); hasErrors = true }
  }

  const access = await client`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls,
      has_table_privilege(current_user, c.oid, 'SELECT') AS can_read
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(${EXPECTED_TABLES})
  `
  for (const table of access) {
    if (!table.rls) { console.error('RLS disabled on application table:', table.table_name); hasErrors = true }
    if (!table.can_read) { console.error('The server database role cannot read application table:', table.table_name); hasErrors = true }
  }
  const browserRoles = await client`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`
  for (const role of browserRoles) {
    const exposed = await client`
      SELECT c.relname AS table_name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${EXPECTED_TABLES}) AND
      (has_table_privilege(${role.rolname}, c.oid, 'SELECT') OR has_table_privilege(${role.rolname}, c.oid, 'INSERT') OR
       has_table_privilege(${role.rolname}, c.oid, 'UPDATE') OR has_table_privilege(${role.rolname}, c.oid, 'DELETE'))
    `
    if (exposed.length) { console.error('Unexpected Data API grants:', role.rolname, exposed.map(row => row.table_name)); hasErrors = true }
  }
  const indexes = await client`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    AND indexname IN ('founder_interviews_idea_uidx', 'research_sources_search_idx', 'validation_reports_job_uidx', 'rewarded_ads_transaction_uidx')`
  if (indexes.length !== 4) { console.error('Required interview/research/report/reward indexes are missing.'); hasErrors = true }
  const rewardColumn = await client`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reward_credits' AND is_nullable = 'NO'`
  if (rewardColumn.length !== 1) { console.error('Reward credit column is missing. Apply migration 0004 before deploying.'); hasErrors = true }
  const cycleColumn = await client`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'credit_cycle_started_at'`
  if (cycleColumn.length !== 1) { console.error('Credit cycle start column is missing. Apply migration 0005 before deploying.'); hasErrors = true }
  const monthlyUsageColumn = await client`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'monthly_credits_used_this_cycle' AND is_nullable = 'NO'`
  if (monthlyUsageColumn.length !== 1) { console.error('Monthly credit consumption column is missing. Apply migration 0005 before deploying.'); hasErrors = true }

  const adminColumns = await client`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('users', 'tier_config', 'platform_settings', 'admin_audit_log')`
  const requiredAdminColumns: Record<string, string[]> = {
    users: ['is_admin', 'account_status', 'status_reason', 'status_changed_at', 'credit_cycle_allowance'],
    tier_config: ['name', 'monthly_price_cents', 'monthly_credits', 'stripe_price_id', 'stripe_price_history', 'benefits', 'advertised'],
    platform_settings: ['id', 'announcement', 'announcement_enabled', 'maintenance_enabled', 'maintenance_message', 'signup_enabled', 'updated_at', 'updated_by'],
    admin_audit_log: ['id', 'request_id', 'actor_id', 'actor_email', 'action', 'target_user_id', 'target_email', 'reason', 'details', 'created_at'],
  }
  for (const [table, columns] of Object.entries(requiredAdminColumns)) {
    const missing = columns.filter(column => !adminColumns.some(row => row.table_name === table && row.column_name === column))
    if (missing.length) { console.error(`Missing owner-control columns in ${table}: ${missing.join(', ')}. Apply migration 0006 before deploying.`); hasErrors = true }
  }
  const adminIndexes = await client`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
    AND indexname IN ('users_single_owner_idx', 'users_status_created_idx', 'admin_audit_request_target_idx', 'admin_audit_created_idx', 'admin_audit_target_created_idx')`
  if (adminIndexes.length !== 5) { console.error('Required owner/status/audit indexes are missing. Apply migration 0006 before deploying.'); hasErrors = true }
  const adminConstraints = await client`SELECT conname FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND conname IN ('users_account_status_valid', 'users_owner_active', 'users_credit_cycle_allowance_nonnegative')`
  if (adminConstraints.length !== 3) { console.error('Required account status and owner constraints are missing. Apply migration 0006 before deploying.'); hasErrors = true }

  // The reviewed SQL deltas also install constraints and indexes outside the
  // Drizzle table definitions. A db:push alone is not a complete rollout.
  const requiredWorkflowIndexes = [
    'credit_ledger_signup_once_idx', 'credit_ledger_daily_claim_once_idx',
    'customer_feedback_content_uidx', 'customer_feedback_request_uidx', 'customer_feedback_owner_idx',
    'customer_feedback_analysis_snapshot_uidx', 'customer_feedback_analysis_owner_idx',
    'planning_module_requests_key_uidx', 'planning_module_requests_pending_idx',
    'ai_execution_leases_expiry_idx',
  ]
  const workflowIndexes = await client`SELECT c.relname AS indexname, i.indisvalid AS valid, i.indisunique AS is_unique
    FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(${requiredWorkflowIndexes})`
  for (const name of requiredWorkflowIndexes) {
    const found = workflowIndexes.find(index => index.indexname === name)
    const needsUnique = name.includes('_once_') || name.endsWith('_uidx')
    if (!found?.valid || needsUnique && !found.is_unique) { console.error(`Missing or invalid workflow index: ${name}. Apply migrations 0007–0015 before deploying.`); hasErrors = true }
  }
  const requiredWorkflowConstraints = ['ai_execution_leases_kind_check', 'customer_feedback_kind_check', 'customer_feedback_sentiment_check',
    'customer_feedback_provenance_check', 'customer_feedback_content_size', 'customer_feedback_analysis_count_check',
    'customer_feedback_analysis_size', 'planning_module_requests_module_check', 'planning_module_requests_status_check', 'planning_module_requests_result_check',
    'planning_module_requests_stage_size', 'planning_module_requests_context_size', 'ideas_public_research_focus_length']
  const workflowConstraints = await client`SELECT conname, convalidated FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND conname = ANY(${requiredWorkflowConstraints})`
  const missingWorkflowConstraints = requiredWorkflowConstraints.filter(name => !workflowConstraints.some(row => row.conname === name && row.convalidated))
  if (missingWorkflowConstraints.length) { console.error('Missing or unvalidated feedback, saved-context, or retry constraints:', missingWorkflowConstraints.join(', ')); hasErrors = true }

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

  if (schemaOnly) return !hasErrors

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
  } else if (counters[0].id !== 1 || counters[0].count < 0 || counters[0].count > counters[0].cap || counters[0].cap !== 100) {
    console.error(`❌ founding_member_counter unexpected values: ${JSON.stringify(counters[0])}`)
    hasErrors = true
  } else {
    console.log('✅ founding_member_counter is within its configured limits.')
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

  return !hasErrors
}

verify().then(passed => {
  if (!passed) {
    console.error('❌ VERIFICATION FAILED: Issues found in database setup.')
    console.error('For an owner-console database missing workspace deltas 0007–0015, review npm run db:migrate:workspace (dry run). Back up and test in staging before applying.')
    process.exitCode = 1
    return
  }
  console.log(schemaOnly ? '✅ Database schema and access checks passed.'
    : '✅ Schema, seed, RLS, and table-grant checks passed. Verify hosted auth, owner isolation, queues, backups, views and RPC access separately before launch.')
}).catch(error => {
  console.error('❌ Database verification could not complete.', { code: databaseErrorCode(error) })
  process.exitCode = 1
}).finally(() => client.end({ timeout: 5 }))
