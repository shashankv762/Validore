import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { userDevices, users } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
import { checkSuspiciousActivity } from '@/lib/suspicious-activity'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const body = await request.json()
  // Accept either fingerprintHash (sent by device-fingerprint.ts) or deviceFingerprint (legacy)
  const deviceFingerprint = body.fingerprintHash || body.deviceFingerprint
  const userAgent = body.userAgent
  if (!deviceFingerprint) return NextResponse.json({ error: 'deviceFingerprint required' }, { status: 400 })

  const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1'

  // Update or insert device
  const existing = await db.query.userDevices.findFirst({
    where: and(eq(userDevices.userId, dbUser.id), eq(userDevices.deviceFingerprint, deviceFingerprint))
  })

  if (existing) {
    await db.update(userDevices)
      .set({ lastActive: new Date(), userAgent, ipAddress })
      .where(eq(userDevices.id, existing.id))
  } else {
    // Check limit
    const allDevices = await db.query.userDevices.findMany({
      where: eq(userDevices.userId, dbUser.id),
      orderBy: (ud, { asc }) => [asc(ud.lastActive)]
    })

    const limit = dbUser.tier === 'max_premium' ? 5 : dbUser.tier === 'premium' ? 3 : 1

    if (allDevices.length >= limit) {
      // Remove oldest
      const toRemove = allDevices.length - limit + 1
      for (let i = 0; i < toRemove; i++) {
        await db.delete(userDevices).where(eq(userDevices.id, allDevices[i].id))
      }
    }

    await db.insert(userDevices).values({
      userId: dbUser.id,
      deviceFingerprint,
      userAgent,
      ipAddress,
      lastActive: new Date(),
    })

    // Check for suspicious activity after inserting a new device
    const activityCheck = await checkSuspiciousActivity(dbUser.id)
    if (activityCheck.suspicious) {
      return NextResponse.json({ success: true, warning: activityCheck.warning })
    }
  }

  return NextResponse.json({ success: true })
}
