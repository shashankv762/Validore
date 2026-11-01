import Link from 'next/link'
import AuthNotice from '@/components/auth/AuthNotice'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthForm } from '@/components/auth/AuthForm'
import { PasswordField } from '@/components/auth/PasswordField'
import { createClient } from '@/lib/supabase/server'
export const metadata = { title: 'Set a new password' }
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  const { data: { user } } = await (await createClient()).auth.getUser()
  return <AuthShell returning>
      <h1>Set a new password.</h1>
      <p className="auth-description">Choose a unique password to keep your ideas and reports secure.</p>
      <AuthNotice error={params.error} message={params.message} />
      {params.message === 'Your password has been updated.' ? <Link href="/dashboard" className="button button-navy">Return to your workspace</Link> : user ? <AuthForm action="/api/auth/reset-password" label="Save new password" pendingLabel="Saving password…">
        <details className="text-sm"><summary className="cursor-pointer">Changing your password without a reset email?</summary><label htmlFor="currentPassword" className="auth-label mt-4">Current password</label><PasswordField id="currentPassword" name="currentPassword" maxLength={128} autoComplete="current-password" /></details>
        <div><label htmlFor="password" className="auth-label">New password</label><PasswordField id="password" name="password" minLength={8} maxLength={128} autoComplete="new-password" required aria-describedby="password-hint" /><p id="password-hint" className="auth-help">We recommend 12+ characters with mixed case, a number, and a symbol.</p></div>
      </AuthForm> : <><p className="text-sm text-[#59646d]">Open the latest reset link from your email to continue. The link may have expired.</p><Link href="/auth/forgot-password" className="button button-navy mt-6">Request a new reset link</Link></>}
  </AuthShell>
}
