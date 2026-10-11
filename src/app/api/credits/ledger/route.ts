import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { creditLedger, users } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({
    where: eq(users.supabaseId, user.id),
  })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10)

  const entries = await db.select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, dbUser.id))
    .orderBy(desc(creditLedger.createdAt))
    .limit(Math.min(limit, 200))

  return NextResponse.json({ entries })
}
