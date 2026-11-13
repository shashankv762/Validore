import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthForm } from '@/components/auth/AuthForm'
import AuthNotice from '@/components/auth/AuthNotice'
import { LEGAL } from '@/lib/legal'

export const metadata = { title: 'Complete your registration', robots: { index: false, follow: false } }
export default async function CompleteSignup({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const params = await searchParams
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) redirect('/auth/signin')
  return <AuthShell><h1>Open your free workspace.</h1><p className="auth-description">You are signed in as {user.email}. Confirm the terms to finish creating your account.</p><AuthNotice error={params.error} />
    <AuthForm action="/api/auth/complete-signup" label="Create your workspace" pendingLabel="Creating your workspace…">
      <input type="hidden" name="next" value={params.next || '/dashboard'} /><input type="hidden" name="policyVersion" value={LEGAL.version} />
      <label className="auth-consent"><input type="checkbox" name="consent" required /><span>I am 18 or over, agree to the <Link href="/legal/terms">Terms of Service</Link>, and acknowledge the <Link href="/legal/privacy">Privacy Policy</Link>.</span></label>
    </AuthForm>
    <form action="/api/auth/signout" method="post"><button type="submit" className="auth-inline-link">Use a different account</button></form>
  </AuthShell>
}
