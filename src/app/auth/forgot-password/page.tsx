import Link from 'next/link'
import AuthNotice from '@/components/auth/AuthNotice'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthForm } from '@/components/auth/AuthForm'
export const metadata = { title: 'Reset your password' }
export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  return <AuthShell returning>
    <h1>Reset your password.</h1>
    <p className="auth-description">Enter the email you use for Validore. We&apos;ll send a link to set a new password.</p>
    <AuthNotice error={params.error} message={params.message} />
    <AuthForm action="/api/auth/forgot-password" label="Send reset link" pendingLabel="Sending reset link…">
      <div><label htmlFor="email" className="auth-label">Email address</label><input id="email" name="email" type="email" autoComplete="email" autoCapitalize="none" required maxLength={320} className="auth-input" /></div>
    </AuthForm>
    <p className="auth-switch"><Link href="/auth/signin">Back to sign in</Link></p>
  </AuthShell>
}
