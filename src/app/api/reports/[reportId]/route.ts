import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { db } from '@/db'
import { users, ideas, validationReports } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

export async function GET(_: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params
  if (!z.uuid().safeParse(reportId).success) return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dbUser = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const report = await db.query.validationReports.findFirst({ where: and(eq(validationReports.id, reportId), eq(validationReports.userId, dbUser.id)) })
  if (!report || report.userId !== dbUser.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, report.ideaId), eq(ideas.userId, dbUser.id)), columns: { name: true } })
  return NextResponse.json({ report, ideaName: idea?.name ?? 'Startup validation' }, { headers: { 'Cache-Control': 'private, no-store' } })
}
