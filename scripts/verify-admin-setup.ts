import { config } from 'dotenv'
import postgres from 'postgres'
import { createAuthAdminClient } from '../src/lib/supabase/admin'
import { isVerifiedOwnerIdentity, OWNER_EMAIL } from '../src/lib/admin-access'
import { syncUserToDatabase } from '../src/lib/auth-sync'
import { db } from '../src/db'

config({ path: '.env.local', quiet: true })
const command = process.argv[2] ?? 'inspect'
if (!['inspect', 'provision-owner'].includes(command)) throw new Error('Use inspect or provision-owner')

async function main() {
  const authUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  const databaseUrl = new URL(process.env.DATABASE_URL || '')
  if (authUrl.hostname !== 'zuxbogoxodcxvpwglyum.supabase.co' ||
    databaseUrl.hostname !== 'aws-0-ap-south-1.pooler.supabase.com' ||
    decodeURIComponent(databaseUrl.username) !== 'postgres.zuxbogoxodcxvpwglyum' || databaseUrl.pathname !== '/postgres') {
    throw new Error('The configured resources do not match the existing Validore project')
  }
  const auth = createAuthAdminClient()
  let identity: Awaited<ReturnType<typeof auth.auth.admin.listUsers>>['data']['users'][number] | undefined
  for (let page = 1; page <= 20; page++) {
    const result = await auth.auth.admin.listUsers({ page, perPage: 100 })
    if (result.error) throw new Error('The authentication administrator could not inspect the owner identity')
    const matches = result.data.users.filter(user => user.email?.trim().toLowerCase() === OWNER_EMAIL)
    if (matches.length > 1 || (identity && matches.length)) throw new Error('More than one owner identity was returned')
    if (matches[0]) identity = matches[0]
    if (result.data.users.length < 100) break
    if (page === 20) throw new Error('The owner lookup exceeded its bounded page limit')
  }
  const connection = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1, connect_timeout: 10, onnotice: () => {} })
  try {
    const columns = await connection`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'`
    const migrated = ['is_admin', 'account_status', 'status_reason', 'status_changed_at', 'credit_cycle_allowance'].every(name => columns.some(column => column.column_name === name))
    const tables = await connection`SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'`
    const privateAdminTables = ['admin_audit_log', 'platform_settings'].every(name => tables.some(table => table.relname === name && table.relrowsecurity))
    const profile = identity ? (await connection`SELECT id, email, supabase_id FROM public.users WHERE supabase_id = ${identity.id}`)[0] : undefined
    const pinned = migrated ? await connection`SELECT supabase_id FROM public.users WHERE is_admin = true` : []
    const ready = Boolean(identity && isVerifiedOwnerIdentity(identity) && profile && migrated && privateAdminTables && (!pinned.length || pinned[0].supabase_id === identity.id))
    if (command === 'provision-owner') {
      if (!ready || !identity) throw new Error('A verified registered owner and migrated private schema are required before provisioning')
      const [before] = await connection`SELECT md5((to_jsonb(t) - ARRAY['is_admin','updated_at'])::text) AS core FROM public.users t WHERE supabase_id = ${identity.id}`
      const owner = await syncUserToDatabase(identity)
      if (!owner?.isAdmin || owner.supabaseId !== identity.id || owner.accountStatus !== 'active') throw new Error('The owner grant could not be verified')
      const [after] = await connection`SELECT md5((to_jsonb(t) - ARRAY['is_admin','updated_at'])::text) AS core FROM public.users t WHERE supabase_id = ${identity.id}`
      if (!before || !after || before.core !== after.core) throw new Error('Owner provisioning changed unrelated account data')
      console.log(JSON.stringify({ owner: OWNER_EMAIL, provisioned: true, identityBound: true, accountActive: true, creditsUnchanged: true }))
    } else {
      console.log(JSON.stringify({ owner: OWNER_EMAIL, identityExists: Boolean(identity), emailConfirmed: Boolean(identity && isVerifiedOwnerIdentity(identity)),
        applicationProfileExists: Boolean(profile), migrationApplied: migrated, privateAdminTables, ownerGrantBound: Boolean(identity && pinned.some(row => row.supabase_id === identity.id)), readyForOwnerSignIn: ready }))
    }
  } finally { await connection.end({ timeout: 5 }); if (command === 'provision-owner') await db.$client.end({ timeout: 5 }) }
}
main().catch(() => { console.error('Admin setup verification failed; no credentials were printed. Check the configured project, connection and administrator key.'); process.exitCode = 1 })
