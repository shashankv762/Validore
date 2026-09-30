import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Privacy Policy | Aurexa',
  description: 'Privacy Policy for Aurexa - AI-powered startup validation.',
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
          
<h1 className="text-3xl font-light text-[#0A1628] mb-8">Privacy Policy</h1>
<div className="text-sm text-[#1C1C1C] opacity-70 mb-8">Last updated: September 30, 2026</div>

<div className="prose prose-sm max-w-none text-[#1C1C1C]">
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">1. Data Controller</h2>
  <p className="mb-4">Aurexa is operated as a sole proprietorship by [Your Name].<br/>Address: [Your Address], New Delhi, India<br/>Contact Email: legal@aurexa.app</p>
  
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">2. What data we collect</h2>
  <p className="mb-2">We collect only the minimum data necessary to provide our service:</p>
  <ul className="list-disc pl-5 mb-4 space-y-2">
    <li><strong>Account data:</strong> email address, authentication provider (Google/email).</li>
    <li><strong>Startup idea data:</strong> idea name, industry, product description, target customer, location, business model, core problem, proposed solution (all user-provided via forms).</li>
    <li><strong>Payment data:</strong> processed securely by Stripe/Razorpay (we do NOT store credit card numbers).</li>
    <li><strong>Usage data:</strong> tier, validation count, credit balance, subscription status.</li>
    <li><strong>Analytics:</strong> cookieless, privacy-first analytics via Vercel Analytics (no personal data collected).</li>
  </ul>
  
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">3. What we do NOT collect</h2>
  <p className="mb-4">We do NOT use cookies for tracking, session recording, or advertising. We do not use Google Analytics, Meta Pixel, or Hotjar.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">4. Legal basis for processing</h2>
  <p className="mb-4">Under GDPR Article 6, we process data based on:</p>
  <ul className="list-disc pl-5 mb-4 space-y-2">
    <li><strong>Contract performance:</strong> Account management and service delivery.</li>
    <li><strong>Legitimate interest:</strong> Fraud prevention and service improvement.</li>
    <li><strong>Consent:</strong> Marketing emails (if applicable).</li>
  </ul>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">5. Data sharing & Sub-processors</h2>
  <p className="mb-4">We share data only with essential sub-processors:</p>
  <ul className="list-disc pl-5 mb-4 space-y-2">
    <li><strong>Supabase (US):</strong> Authentication and database hosting.</li>
    <li><strong>Stripe (US) / Razorpay (India):</strong> Payment processing.</li>
    <li><strong>Vercel (US):</strong> Hosting and cookieless analytics.</li>
    <li><strong>OpenRouter / OpenAI / Google / Anthropic:</strong> AI processing. Startup idea data is sent to these providers for analysis.</li>
  </ul>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">6. AI Data Processing Disclosure</h2>
  <p className="mb-4">Your startup idea data is sent to AI providers to generate the validation reports. <strong>We do not train our own AI models on your data</strong>. The respective AI providers' data policies apply regarding their use of API data (which generally exclude API data from model training).</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">7. Data retention</h2>
  <ul className="list-disc pl-5 mb-4 space-y-2">
    <li><strong>Account data:</strong> Retained while the account is active, and for 90 days after a deletion request.</li>
    <li><strong>Financial records:</strong> 7 years (as required by law).</li>
    <li><strong>AI-generated reports:</strong> Deleted upon account deletion.</li>
  </ul>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">8. Your rights</h2>
  <p className="mb-2">Depending on your location, you have rights under the GDPR, CCPA, and India DPDPA (2023):</p>
  <ul className="list-disc pl-5 mb-4 space-y-2">
    <li><strong>GDPR (EU):</strong> Right to access, rectify, erase, port, restrict, or object to processing.</li>
    <li><strong>CCPA (California):</strong> Right to know, delete, and opt-out of the sale of personal information (we do not sell your data).</li>
    <li><strong>DPDPA (India):</strong> Right to access, correction, erasure, and grievance redressal.</li>
  </ul>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">9. Data Protection Officer / Grievance Officer</h2>
  <p className="mb-4">Name: [Your Name]<br/>Email: legal@aurexa.app</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">10. Children's Privacy</h2>
  <p className="mb-4">Our service is not intended for users under the age of 18.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">11. International transfers</h2>
  <p className="mb-4">Your data is transferred to US-based processors (Supabase, Stripe, Vercel, AI providers). These transfers rely on Standard Contractual Clauses where applicable.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">12. Changes to this policy</h2>
  <p className="mb-4">We will notify registered users by email of any material changes to this Privacy Policy.</p>
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
