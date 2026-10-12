import Link from 'next/link'
import Image from 'next/image'
import AuthNotice from '@/components/auth/AuthNotice'
export const metadata = { title: 'Reset your password' }
export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  return <main className="flex min-h-dvh items-center justify-center bg-[#F5F0E8] px-4 py-10">
    <div className="w-full max-w-md">
      <Link href="/" className="mb-8 inline-flex items-center gap-3"><Image src="/logo/validore-icon.svg" alt="" width={32} height={32} /><span className="text-xl font-light tracking-widest">validore</span></Link>
      <section className="card-angular p-6 sm:p-8"><h1 className="mb-3 text-2xl font-light text-[#0A1628]">Reset your password</h1>
        <p className="mb-6 text-sm text-[#1C1C1C]/75">Enter the email you use for Validore. We&apos;ll send a link to set a new password.</p>
        <AuthNotice error={params.error} message={params.message} />
        <form action="/api/auth/forgot-password" method="POST" className="space-y-5">
          <div><label htmlFor="email" className="mb-2 block text-sm font-medium">Email</label><input id="email" name="email" type="email" autoComplete="email" required maxLength={320} className="w-full rounded-lg border border-[#E8E0D0] bg-white px-4 py-3" /></div>
          <button type="submit" className="min-h-11 w-full rounded-lg px-4 py-3 text-sm font-medium text-[#0A1628]" style={{ background: 'var(--gold-gradient)' }}>Send reset link</button>
        </form>
        <Link href="/auth/signin" className="mt-6 inline-block text-sm underline underline-offset-4">Back to sign in</Link>
      </section>
    </div>
  </main>
}
