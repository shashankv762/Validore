import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { ideas, users, validationJobs } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { IdeaInputSchema } from '@/lib/idea-input'
import { isSameOriginMutation, PRIVATE_HEADERS } from '@/lib/api-security'
import { databaseErrorCode, isDatabaseSetupError } from '@/lib/database-errors'
import { REGISTRATION_REQUIRED, REGISTRATION_PATH } from '@/lib/registration-recovery'
import { rateLimitCheck } from '@/lib/rate-limit'
import { isActiveAccount, isOwnerAccount } from '@/lib/admin-access'
import { getPlan } from '@/lib/plan-catalog'

async function authenticatedUser() {
  const { data: { user }, error } = await (await createClient()).auth.getUser()
  if (error?.code === 'account_blocked' || error?.code === 'account_deactivated') {
    return NextResponse.json({ error: 'This account is not active.', code: error.code }, { status: 403, headers: PRIVATE_HEADERS })
  }
  if (error?.code === 'maintenance_enabled') {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 503, headers: PRIVATE_HEADERS })
  }
  if (error?.code === 'account_unavailable' || error?.status && error.status >= 500) {
    return NextResponse.json({ error: 'Account access is temporarily unavailable.', code: 'account_unavailable' }, { status: 503, headers: PRIVATE_HEADERS })
  }
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const profile = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!profile) return NextResponse.json({ error: 'Complete your registration to open the workspace.', code: REGISTRATION_REQUIRED, next: REGISTRATION_PATH }, { status: 403, headers: PRIVATE_HEADERS })
  if (!isActiveAccount(profile)) return NextResponse.json({ error: 'This account is not active.',
    code: profile.accountStatus === 'blocked' ? 'account_blocked' : 'account_deactivated' }, { status: 403, headers: PRIVATE_HEADERS })
  return profile
}

function unavailable(error: unknown, operation: 'Loading' | 'Saving') {
  console.error('[ideas] ' + operation + ' failed', { type: error instanceof Error ? error.name : 'UnknownError', code: databaseErrorCode(error) })
  if (isDatabaseSetupError(error)) return NextResponse.json({ code: 'workspace_setup_required',
    error: 'Your workspace needs a database update. Please contact support.' }, { status: 503, headers: PRIVATE_HEADERS })
  return NextResponse.json({ error: operation === 'Loading' ? 'Your workspace could not be loaded. Please try again.'
    : 'Unable to save your idea. Please try again.' }, { status: 503, headers: PRIVATE_HEADERS })
}

export async function GET() {
  try {
    const user = await authenticatedUser()
    if (user instanceof NextResponse) return user
    const userIdeas = await db.query.ideas.findMany({ where: and(eq(ideas.userId, user.id), eq(ideas.isActive, true)),
      orderBy: (table, { desc }) => [desc(table.createdAt)], limit: 100 })
    return NextResponse.json({ ideas: userIdeas }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return unavailable(error, 'Loading')
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const user = await authenticatedUser()
    if (user instanceof NextResponse) return user
    if (!(await rateLimitCheck(user.id, 'ideas')).success) return NextResponse.json({ error: 'Please wait before saving another idea.' }, { status: 429 })
    const body = await request.json().catch(() => null)
    if (body?.website) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const parsed = IdeaInputSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Please check your idea details.', details: parsed.error.flatten() }, { status: 400 })
    return await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(users).where(eq(users.id, user.id)).for('update')
      if (!locked) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      if (!isActiveAccount(locked)) return NextResponse.json({ error: 'This account is not active.' }, { status: 403 })
      if (!isOwnerAccount(locked)) {
        const config = await getPlan(locked.tier, tx)
        const active = await tx.select({ id: ideas.id }).from(ideas).where(and(eq(ideas.userId, user.id), eq(ideas.isActive, true), eq(ideas.isReadOnly, false))).limit(Math.max(1, config.maxActiveIdeas))
        if (active.length >= config.maxActiveIdeas) return NextResponse.json({ error: 'Your plan has reached its active idea limit. Upgrade or use an existing idea.' }, { status: 403 })
      }
      const [idea] = await tx.insert(ideas).values({ userId: user.id, ...parsed.data, publicResearchFocus: parsed.data.publicResearchFocus || null }).returning()
      return NextResponse.json({ idea }, { status: 201 })
    })
  } catch (error) {
    return unavailable(error, 'Saving')
  }
}

const EditSchema = IdeaInputSchema.extend({ ideaId: z.string().uuid() })
export async function PATCH(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const user = await authenticatedUser()
    if (user instanceof NextResponse) return user
    if (!(await rateLimitCheck(user.id, 'ideas')).success) return NextResponse.json({ error: 'Please wait before saving more changes.' }, { status: 429 })
    const parsed = EditSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Please check your idea details.', details: parsed.error.flatten() }, { status: 400 })
    const { ideaId, publicResearchFocus, ...draft } = parsed.data
    return await db.transaction(async (tx) => {
      const [idea] = await tx.select().from(ideas).where(and(eq(ideas.id, ideaId), eq(ideas.userId, user.id))).for('update')
      if (!idea || idea.isReadOnly || !idea.isActive) return NextResponse.json({ error: 'Idea not found or read-only' }, { status: 404 })
      const [running] = await tx.select({ id: validationJobs.id }).from(validationJobs).where(and(eq(validationJobs.ideaId, ideaId), inArray(validationJobs.status, ['pending', 'running']))).limit(1)
      if (running) return NextResponse.json({ error: 'This idea is being analysed. Wait until the analysis completes before editing.' }, { status: 409 })
      // Omitted legacy PATCH bodies preserve the public topic. Only an explicit
      // empty field clears it; private brief edits never imply public permission.
      const [updated] = await tx.update(ideas).set({ ...draft,
        ...(publicResearchFocus === undefined ? {} : { publicResearchFocus: publicResearchFocus || null }), updatedAt: new Date() }).where(eq(ideas.id, ideaId)).returning()
      return NextResponse.json({ idea: updated })
    })
  } catch (error) {
    return unavailable(error, 'Saving')
  }
}
