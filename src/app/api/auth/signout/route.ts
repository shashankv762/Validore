import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authOrigin, validAuthOrigin } from '@/lib/auth-form'

export async function POST(req: NextRequest) {
  try {
    if (!validAuthOrigin(req)) return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) return NextResponse.json({ error: 'Unable to sign out. Please try again.' }, { status: 503 })

    const acceptHeader = req.headers.get('accept') || ''
    const isHtml =
      acceptHeader.includes('text/html') ||
      !acceptHeader.includes('application/json')

    if (isHtml) {
      return NextResponse.redirect(new URL('/auth/signin', authOrigin(req)), 303)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Unable to sign out. Please try again.' }, { status: 503 })
  }
}
