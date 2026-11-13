import type { Metadata } from 'next'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { notFound } from 'next/navigation'
import { db } from '@/db'
import { users, validationReports } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import ReportView from '@/app/dashboard/report/ReportView'

export const dynamic = 'force-dynamic'
// Metadata never reveals the founder's idea to link preview services.
export const metadata: Metadata = {
  title: 'Your validation report',
  description: 'Sign in to view your Validore validation report.',
  robots: { index: false, follow: false },
}

export default async function SharePage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = await params
  if (!z.uuid().safeParse(shareToken).success) notFound()
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) notFound()
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id), columns: { id: true } })
  if (!owner) notFound()
  const report = await db.query.validationReports.findFirst({
    where: and(eq(validationReports.shareToken, shareToken), eq(validationReports.userId, owner.id)),
  })
  if (!report) notFound()
  return <div className="min-h-screen bg-[#F5F0E8]"><ReportView report={report} isSharePage /></div>
}
