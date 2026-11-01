import { NextRequest, NextResponse } from 'next/server'
import { and, asc, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { ideas, founderInterviews, validationReports, leanCanvases, pricingSimulations, crowdfundingAnalyses, pitchDecks, validationJobs, creditLedger, creditPurchases, userDevices, users, rewardedAdSessions } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { PRIVATE_HEADERS } from '@/lib/api-security'
import { rateLimitCheck } from '@/lib/rate-limit'
import { EXPORT_SECTIONS, exportableProfile } from '@/lib/privacy-export'

const tables = { ideas, interviews: founderInterviews, reports: validationReports, canvases: leanCanvases,
  pricing: pricingSimulations, crowdfunding: crowdfundingAnalyses, pitchDecks, jobs: validationJobs, creditLedger, purchases: creditPurchases, devices: userDevices, adRewards: rewardedAdSessions }
const QuerySchema = z.object({ section: z.enum(EXPORT_SECTIONS).optional(), after: z.string().uuid().optional() })
export async function GET(request: NextRequest) {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
    const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
    if (!owner) return NextResponse.json({ error: 'Account not found' }, { status: 404, headers: PRIVATE_HEADERS })
    const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid export page' }, { status: 400, headers: PRIVATE_HEADERS })
    if (!parsed.data.section) {
      if (!(await rateLimitCheck(owner.id, 'privacy-export')).success) return NextResponse.json({ error: 'Please wait a minute before starting another export.' }, { status: 429, headers: PRIVATE_HEADERS })
      return NextResponse.json({ profile: exportableProfile(owner), sections: EXPORT_SECTIONS, exportedAt: new Date().toISOString(),
        note: 'Your account data is exported in pages. Keep this file private. Authentication secrets and provider operational logs are excluded.' }, { headers: PRIVATE_HEADERS })
    }
    const table = tables[parsed.data.section]
    if (!(await rateLimitCheck(owner.id, 'privacy-page')).success) return NextResponse.json({ error: 'Please wait before requesting more export pages.' }, { status: 429, headers: PRIVATE_HEADERS })
    const rows = await db.select().from(table).where(and(eq(table.userId, owner.id), parsed.data.after ? gt(table.id, parsed.data.after) : undefined)).orderBy(asc(table.id)).limit(6)
    const records = rows.slice(0, 5)
    const payload = JSON.stringify({ section: parsed.data.section, records, nextCursor: rows.length > 5 ? records[records.length - 1].id : null })
    if (Buffer.byteLength(payload) > 3_500_000) return NextResponse.json({ error: 'This section is too large for a browser export. Contact the privacy address for an assisted export.' }, { status: 413, headers: PRIVATE_HEADERS })
    return new NextResponse(payload, { headers: { ...PRIVATE_HEADERS, 'Content-Type': 'application/json' } })
  } catch {
    console.error('[privacy-export] Account export unavailable')
    return NextResponse.json({ error: 'Your export could not be completed. Try again or contact the privacy address.' }, { status: 503, headers: PRIVATE_HEADERS })
  }
}
