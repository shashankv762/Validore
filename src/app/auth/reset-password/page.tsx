import Link from 'next/link'
import AuthNotice from '@/components/auth/AuthNotice'
import { createClient } from '@/lib/supabase/server'
export const metadata = { title: 'Set a new password' }
export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  const { data: { user } } = await (await createClient()).auth.getUser()
  return <main className="flex min-h-dvh items-center justify-center bg-[#F5F0E8] px-4 py-10">
    <section className="card-angular w-full max-w-md p-6 sm:p-8"><h1 className="mb-3 text-2xl font-light text-[#0A1628]">Set a new password</h1>
      <AuthNotice error={params.error} message={params.message} />
      {params.message ? <Link href="/dashboard" className="mt-4 inline-block text-sm underline underline-offset-4">Return to your workspace</Link> : user ? <form action="/api/auth/reset-password" method="POST" className="mt-6 space-y-5">
        <div><label htmlFor="password" className="mb-2 block text-sm font-medium">New password</label><input id="password" name="password" type="password" minLength={8} maxLength={128} autoComplete="new-password" required className="w-full rounded-lg border border-[#E8E0D0] bg-white px-4 py-3" /><p className="mt-2 text-xs text-[#1C1C1C]/75">Use at least 8 characters.</p></div>
        <button type="submit" className="min-h-11 w-full rounded-lg px-4 py-3 text-sm font-medium text-[#0A1628]" style={{ background: 'var(--gold-gradient)' }}>Save new password</button>
      </form> : <><p className="mt-4 text-sm text-[#1C1C1C]/75">Open the latest reset link from your email to continue. The link may have expired.</p><Link href="/auth/forgot-password" className="mt-6 inline-block text-sm underline underline-offset-4">Request a new reset link</Link></>}
    </section>
  </main>
}
