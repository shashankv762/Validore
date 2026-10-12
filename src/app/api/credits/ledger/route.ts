import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { creditLedger, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const rawLimit = request.nextUrl.searchParams.get('limit') ?? '50'
    const limit = Number(rawLimit)
    if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      return NextResponse.json({ error: 'limit must be an integer from 1 to 200' }, { status: 400 })
    }
    const entries = await db.select().from(creditLedger).where(eq(creditLedger.userId, dbUser.id))
      .orderBy(desc(creditLedger.createdAt), desc(creditLedger.id)).limit(limit)
    return NextResponse.json({ entries }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Credit history is temporarily unavailable' }, { status: 503 })
  }
}
