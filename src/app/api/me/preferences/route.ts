import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

const VALID_PROVIDERS = ['free_models', 'paid_models', 'custom_openrouter'] as const

// FIX-12: Persist AI provider preference to DB (PATCH method as specified)
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { preferredAiProvider?: unknown; customOpenRouterKey?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { preferredAiProvider, customOpenRouterKey } = body
  if (!preferredAiProvider || !VALID_PROVIDERS.includes(preferredAiProvider as typeof VALID_PROVIDERS[number])) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
      { status: 400 },
    )
  }

  const updateValues: Record<string, unknown> = { preferredAiProvider: preferredAiProvider as string }

  if (customOpenRouterKey !== undefined) {
    let keyToStore = (customOpenRouterKey as string) || null
    if (keyToStore && process.env.ENCRYPTION_KEY) {
      try {
        const crypto = await import('crypto')
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), iv)
        let encrypted = cipher.update(keyToStore, 'utf8', 'hex')
        encrypted += cipher.final('hex')
        keyToStore = iv.toString('hex') + ':' + encrypted
      } catch {
        console.warn('[BYOK] Failed to encrypt key, storing as-is')
      }
    } else if (keyToStore && !process.env.ENCRYPTION_KEY) {
      console.warn('[BYOK] ENCRYPTION_KEY not set, storing key unencrypted')
    }
    updateValues.encryptedOpenrouterKey = keyToStore
  }

  await db.update(users)
    .set(updateValues as any)
    .where(eq(users.supabaseId, user.id))

  return NextResponse.json({ preferredAiProvider })
}

// Also support POST for backward compat (settings page uses POST currently)
export async function POST(req: NextRequest) {
  return PATCH(req)
}
