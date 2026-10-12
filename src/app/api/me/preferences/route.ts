import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { encryptApiKey } from '@/lib/byok-crypto'
import { validAuthOrigin } from '@/lib/auth-form'

const PreferenceSchema = z.object({
  preferredAiProvider: z.enum(['free_models', 'paid_models', 'custom_openrouter']),
  customOpenRouterKey: z.string().trim().max(512).nullable().optional(),
})

export async function PATCH(req: NextRequest) {
  if (!validAuthOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = PreferenceSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid AI preferences', details: parsed.error.issues }, { status: 400 })
  const { preferredAiProvider, customOpenRouterKey } = parsed.data
  const values: Partial<typeof users.$inferInsert> = { preferredAiProvider }
  if (customOpenRouterKey !== undefined) {
    try { values.encryptedOpenrouterKey = customOpenRouterKey ? encryptApiKey(customOpenRouterKey) : null }
    catch { return NextResponse.json({ error: 'API key storage is unavailable. Contact support.' }, { status: 503 }) }
  }
  try {
    const [updated] = await db.update(users).set(values).where(eq(users.supabaseId, user.id)).returning({ id: users.id })
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ preferredAiProvider })
  } catch (error) {
    console.error('[preferences] Saving failed:', error)
    return NextResponse.json({ error: 'Unable to save preferences. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return PATCH(req) }
