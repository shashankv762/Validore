import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Terms of Service | Validore',
  description: 'Terms of Service for Validore - AI-powered startup validation.',
}

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 border-b border-[#E8E0D0] bg-[#FAFAF7]">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo/validore-icon.svg" alt="Validore Logo" width={36} height={36} />
          <span className="text-xl font-light tracking-widest text-[#1C1C1C]">validore</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/auth/signin" className="text-sm text-[#1C1C1C] hover:text-[#96792b] transition-colors focus:ring-2 focus:ring-[#C8A860] outline-none">
            Sign In
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl w-full mx-auto px-8 py-16">
        <div className="card-angular p-10 bg-[#FAFAF7]">
          
<h1 className="text-3xl font-light text-[#0A1628] mb-8">Terms of Service</h1>
<div className="text-sm text-[#1C1C1C] opacity-70 mb-8">Last updated: September 30, 2026</div>

<div className="prose prose-sm max-w-none text-[#1C1C1C]">
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">1. Acceptance of Terms</h2>
  <p className="mb-4">By accessing or using Validore, you agree to these Terms of Service. You must be at least 18 years old to use the Service.</p>
  
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">2. Account Responsibilities</h2>
  <p className="mb-4">You must provide accurate information when creating an account and are responsible for maintaining the security of your password and account.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">3. Service Description</h2>
  <p className="mb-4">Validore is an AI-powered startup validation tool. It provides educational decision-support tools. <strong>It does not provide financial advice, legal advice, or investment advice.</strong></p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">4. Important Disclaimer</h2>
  <p className="mb-4 font-medium p-4 bg-[#F5F0E8] border-l-4 border-[#C8A860]">
    Validore provides educational decision-support tools. Validation scores, financial projections, and recommendations are AI-generated estimates, not guarantees of business success. Do not make investment decisions solely based on Validore&apos;s output.
  </p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">5. Subscription Terms</h2>
  <p className="mb-4">Subscriptions automatically renew unless canceled. You may cancel at any time, and you will retain access to premium features until the end of your billing cycle. Downgrading may result in the loss of features or capacity.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">6. Payment Terms</h2>
  <p className="mb-4">Payments are processed securely via Stripe or Razorpay. Fees are stated in the applicable currency at checkout.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">7. Refund Policy</h2>
  <p className="mb-4">Our refund policy is outlined separately. Please review our <Link href="/legal/refund" className="text-[#96792b] hover:underline">Refund Policy</Link> for full details.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">8. Credit Packs</h2>
  <p className="mb-4">Credit packs are non-refundable if consumed. Unused credit packs may be refunded within 30 days of purchase.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">9. Intellectual Property</h2>
  <p className="mb-4">You own all rights to your original startup idea data. Validore retains all rights to the platform, report formats, templates, and scoring methodology.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">10. User Content License</h2>
  <p className="mb-4">By submitting data, you grant Validore a necessary license to process your data through our AI providers solely for the purpose of delivering the Service to you.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">11. Prohibited Use</h2>
  <p className="mb-4">You agree not to use the Service for illegal content, reverse engineering, scraping, or attempting to extract the underlying AI prompts or models.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">12. Limitation of Liability</h2>
  <p className="mb-4">To the maximum extent permitted by law, Validore&apos;s liability is capped at the total fees you paid to us in the 12 months preceding the claim.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">13. Indemnification</h2>
  <p className="mb-4">You agree to indemnify and hold harmless Validore and its operator from any claims arising from your use of the Service.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">14. Termination</h2>
  <p className="mb-4">We reserve the right to terminate your access for breach of these terms. You may delete your account at any time.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">15. Governing Law</h2>
  <p className="mb-4">These Terms are governed by the laws of the Republic of India. Any disputes will be resolved in the courts of New Delhi.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">16. Severability &amp; Entire Agreement</h2>
  <p className="mb-4">If any provision is found unenforceable, the rest remains in effect. These Terms constitute the entire agreement between you and Validore.</p>
</div>

        </div>
      </main>

      <footer className="border-t border-[#E8E0D0] py-12 bg-[#FAFAF7]">
        <div className="max-w-5xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-2">
             <Image src="/logo/validore-icon.svg" alt="Validore Logo" width={24} height={24} />
             <span className="text-sm font-light tracking-widest text-[#1C1C1C]">validore</span>
           </div>
           <div className="flex flex-wrap justify-center gap-6 text-sm text-[#1C1C1C] opacity-70">
              <Link href="/legal/privacy" className="hover:text-[#96792b]">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:text-[#96792b]">Terms of Service</Link>
              <Link href="/legal/cookies" className="hover:text-[#96792b]">Cookie Policy</Link>
              <Link href="/legal/refund" className="hover:text-[#96792b]">Refund Policy</Link>
           </div>
        </div>
        <div className="max-w-5xl mx-auto px-8 mt-8 text-center md:text-left text-xs text-[#1C1C1C] opacity-40 flex flex-col md:flex-row justify-between">
           <p>© 2026 Validore. All rights reserved.</p>
           <p>Validore is operated by [Your Name], New Delhi, India. Contact: support@validore.app</p>
        </div>
      </footer>
    </div>
  )
}
