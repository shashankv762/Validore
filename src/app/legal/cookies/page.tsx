import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Cookie Policy | Aurexa',
  description: 'Cookie Policy for Aurexa - AI-powered startup validation.',
}

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 border-b border-[#E8E0D0] bg-[#FAFAF7]">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={36} height={36} />
          <span className="text-xl font-light tracking-widest text-[#1C1C1C]">aurexa</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/auth/signin" className="text-sm text-[#1C1C1C] hover:text-[#96792b] transition-colors focus:ring-2 focus:ring-[#C8A860] outline-none">
            Sign In
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl w-full mx-auto px-8 py-16">
        <div className="card-angular p-10 bg-[#FAFAF7]">
          
<h1 className="text-3xl font-light text-[#0A1628] mb-8">Cookie Policy</h1>
<div className="text-sm text-[#1C1C1C] opacity-70 mb-8">Last updated: September 30, 2026</div>

<div className="prose prose-sm max-w-none text-[#1C1C1C]">
  <p className="mb-6 text-lg">We value your privacy and aim to be completely transparent about our use of cookies.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">Strictly Necessary Cookies Only</h2>
  <p className="mb-4">We use <strong>strictly necessary cookies only</strong> for authentication and session management (powered by Supabase auth). Without these cookies, you would not be able to log in to your Aurexa workspace.</p>
  
  <p className="mb-4">We do <strong>NOT</strong> use tracking cookies, advertising cookies, or third-party analytics cookies that store data on your device.</p>

  <p className="mb-4">We use Vercel Analytics for monitoring our website traffic, which is a <strong>cookieless</strong> solution. It does not place any cookies on your device or track you across the internet.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">Cookie Consent</h2>
  <p className="mb-4 p-4 bg-[#F5F0E8] border-l-4 border-[#C8A860]">
    Since we only use strictly necessary cookies, <strong>no cookie consent banner is required</strong> under the GDPR or the ePrivacy Directive.
  </p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">Cookies We Use</h2>
  <div className="overflow-x-auto my-6">
    <table className="min-w-full text-left border-collapse border border-[#E8E0D0]">
      <thead>
        <tr className="bg-[#F5F0E8]">
          <th className="border border-[#E8E0D0] px-4 py-2 font-medium">Cookie Name</th>
          <th className="border border-[#E8E0D0] px-4 py-2 font-medium">Purpose</th>
          <th className="border border-[#E8E0D0] px-4 py-2 font-medium">Duration</th>
          <th className="border border-[#E8E0D0] px-4 py-2 font-medium">Type</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="border border-[#E8E0D0] px-4 py-2 text-sm font-mono">sb-*-auth-token</td>
          <td className="border border-[#E8E0D0] px-4 py-2 text-sm">Maintains your authenticated session across the platform.</td>
          <td className="border border-[#E8E0D0] px-4 py-2 text-sm">Session / Persistent (varies)</td>
          <td className="border border-[#E8E0D0] px-4 py-2 text-sm">Essential</td>
        </tr>
      </tbody>
    </table>
  </div>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">Future Changes</h2>
  <p className="mb-4">If we ever introduce non-essential cookies (e.g., marketing pixels or traditional analytics), we will update this policy and implement a strict consent mechanism before any such cookies are placed on your device.</p>
</div>

        </div>
      </main>

      <footer className="border-t border-[#E8E0D0] py-12 bg-[#FAFAF7]">
        <div className="max-w-5xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-2">
             <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={24} height={24} />
             <span className="text-sm font-light tracking-widest text-[#1C1C1C]">aurexa</span>
           </div>
           <div className="flex flex-wrap justify-center gap-6 text-sm text-[#1C1C1C] opacity-70">
              <Link href="/legal/privacy" className="hover:text-[#96792b]">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:text-[#96792b]">Terms of Service</Link>
              <Link href="/legal/cookies" className="hover:text-[#96792b]">Cookie Policy</Link>
              <Link href="/legal/refund" className="hover:text-[#96792b]">Refund Policy</Link>
           </div>
        </div>
        <div className="max-w-5xl mx-auto px-8 mt-8 text-center md:text-left text-xs text-[#1C1C1C] opacity-40 flex flex-col md:flex-row justify-between">
           <p>© 2026 Aurexa. All rights reserved.</p>
           <p>Aurexa is operated by [Your Name], New Delhi, India. Contact: support@aurexa.app</p>
        </div>
      </footer>
    </div>
  )
}
