import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { userDevices, users } from '@/db/schema'
import { eq, and, asc } from 'drizzle-orm'
import { clientIp } from '@/lib/client-ip'
import { rateLimitCheck } from '@/lib/rate-limit'
import { isSameOriginMutation, PRIVATE_HEADERS, readJsonBody, RequestBodyError } from '@/lib/api-security'

const InputSchema = z.object({ fingerprintHash: z.union([z.string().uuid(), z.string().regex(/^[a-f0-9]{64}$/i)]) })
export async function POST(request: NextRequest) {
  try {
    if (!isSameOriginMutation(request)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers: PRIVATE_HEADERS })
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!owner) return NextResponse.json({ error: 'Account not found' }, { status: 404, headers: PRIVATE_HEADERS })
    const parsed = InputSchema.safeParse(await readJsonBody(request, 2048))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid browser identifier' }, { status: 400, headers: PRIVATE_HEADERS })
    if (!(await rateLimitCheck(owner.id, 'device')).success) return NextResponse.json({ error: 'Please wait before registering again.' }, { status: 429, headers: PRIVATE_HEADERS })
    const fingerprint = createHash('sha256').update(parsed.data.fingerprintHash).digest('hex')
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 512)
    const ipAddress = clientIp(request)
    await db.transaction(async tx => {
      // Serialize registration so concurrent requests cannot exceed the cap.
      const [account] = await tx.select({ tier: users.tier }).from(users).where(eq(users.id, owner.id)).for('update')
      if (!account) throw new Error('Account unavailable')
      const rows = await tx.select().from(userDevices).where(eq(userDevices.userId, owner.id)).orderBy(asc(userDevices.lastActive)).limit(100)
      const existing = rows.find(row => row.deviceFingerprint === fingerprint)
      if (existing) {
        await tx.update(userDevices).set({ lastActive: new Date(), userAgent, ipAddress }).where(and(eq(userDevices.id, existing.id), eq(userDevices.userId, owner.id)))
        return
      }
      const limit = account.tier === 'max_premium' ? 5 : account.tier === 'premium' ? 3 : 1
      for (const row of rows.slice(0, Math.max(0, rows.length - limit + 1))) {
        await tx.delete(userDevices).where(and(eq(userDevices.id, row.id), eq(userDevices.userId, owner.id)))
      }
      await tx.insert(userDevices).values({ userId: owner.id, deviceFingerprint: fingerprint, userAgent, ipAddress, lastActive: new Date() })
    })
    return NextResponse.json({ success: true }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return NextResponse.json({ error: error instanceof RequestBodyError ? error.message : 'Browser activity could not be recorded.' }, { status: error instanceof RequestBodyError ? error.status : 503, headers: PRIVATE_HEADERS })
  }
}
