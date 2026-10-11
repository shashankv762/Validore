import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()

    const acceptHeader = req.headers.get('accept') || ''
    const isHtml =
      acceptHeader.includes('text/html') ||
      !acceptHeader.includes('application/json')

    if (isHtml) {
      return NextResponse.redirect(new URL('/auth/signin', req.url), 303)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sign out error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
