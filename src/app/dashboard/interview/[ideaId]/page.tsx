import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { ideas, users } from '@/db/schema'
import { createClient } from '@/lib/supabase/server'
import { FounderInterview } from '@/components/FounderInterview'

export const metadata = { title: 'Founder notes' }
export default async function InterviewPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect('/auth/signin')
  const id = z.string().uuid().safeParse((await params).ideaId)
  if (!id.success) notFound()
  const owner = await db.query.users.findFirst({ where: eq(users.supabaseId, user.id) })
  if (!owner) notFound()
  const idea = await db.query.ideas.findFirst({ where: and(eq(ideas.id, id.data), eq(ideas.userId, owner.id), eq(ideas.isActive, true)) })
  if (!idea) notFound()
  return <div className="founder-notes-page"><div className="workspace-page-heading"><div><h1>Founder notes</h1><p>{idea.name} · Explore what you know and what to test next.</p></div><Link href="/dashboard/reports" className="workspace-text-link">Back to reports</Link></div><div className="brief-panel"><FounderInterview key={idea.id} ideaId={idea.id} /></div></div>
}
