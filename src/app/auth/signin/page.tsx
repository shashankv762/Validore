import Link from 'next/link'
import AuthNotice from '@/components/auth/AuthNotice'
import { AuthShell } from '@/components/auth/AuthShell'
import { AuthForm } from '@/components/auth/AuthForm'
import { PasswordField } from '@/components/auth/PasswordField'

export const metadata = { title: 'Sign in', description: 'Sign in to your Validore workspace.' }

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string; next?: string }> }) {
  const params = await searchParams
  const next = typeof params.next === 'string' ? params.next : '/dashboard'
  return <AuthShell returning><h1>Welcome back.</h1><p className="auth-description">Your ideas and next steps are right where you left them.</p><AuthNotice error={params.error} message={params.message} />
    <AuthForm action="/api/auth/signin" label="Sign in" pendingLabel="Signing in…">
      <input type="hidden" name="next" value={next} />
      <div><label htmlFor="email" className="auth-label">Email address</label><input type="email" id="email" name="email" autoComplete="email" autoCapitalize="none" maxLength={320} required className="auth-input" placeholder="you@company.com" /></div>
      <div><div className="auth-password-label"><label htmlFor="password" className="auth-label">Password</label><Link href="/auth/forgot-password" className="auth-inline-link">Forgot password?</Link></div><PasswordField id="password" name="password" autoComplete="current-password" maxLength={128} required /></div>
    </AuthForm>
    <div className="auth-divider">or</div><AuthForm action="/api/auth/google" label="Continue with Google" pendingLabel="Connecting to Google…" secondary><input type="hidden" name="next" value={next} /></AuthForm>
    <p className="auth-switch">New to Validore? <Link href={'/auth/signup?next=' + encodeURIComponent(next)}>Create an account</Link></p>
  </AuthShell>
}
