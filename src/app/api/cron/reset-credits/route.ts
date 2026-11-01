import { NextResponse } from 'next/server'
import { maintainCredits } from '@/lib/credit-maintenance'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    const secret = process.env.CRON_SECRET
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(await maintainCredits())
  } catch (error) {
    console.error('[credits/reset] Failed to reset credits:', error)
    return NextResponse.json({ error: 'Unable to reset credits' }, { status: 500 })
  }
}
