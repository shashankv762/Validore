import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Refund Policy | Validore',
  description: 'Refund Policy for Validore - AI-powered startup validation.',
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
          
<h1 className="text-3xl font-light text-[#0A1628] mb-8">Refund Policy</h1>
<div className="text-sm text-[#1C1C1C] opacity-70 mb-8">Last updated: September 30, 2026</div>

<div className="prose prose-sm max-w-none text-[#1C1C1C]">
  <p className="mb-6 text-lg">We stand by the quality of Validore, but we understand it might not be the perfect fit for everyone. We offer a fair 30-day money-back guarantee with usage conditions.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">1. First Subscription Guarantee</h2>
  <p className="mb-4">You are eligible for a full refund on your first subscription payment within <strong>30 days</strong> of purchase, provided that you have consumed <strong>3 or fewer validation runs</strong> (or ≤20% of your tier&apos;s monthly allowance).</p>
  
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">2. Credit Packs</h2>
  <p className="mb-4">Credit packs are <strong>refundable within 30 days if completely unused</strong>. Because delivering a validation report consumes expensive AI API credits, consumed credits are considered delivered digital goods and are non-refundable.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">3. Renewals</h2>
  <p className="mb-4">If your subscription auto-renews and you meant to cancel, we will issue a full refund if you request it within <strong>72 hours</strong> of the renewal charge, provided you have had zero usage since the renewal date.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">4. Cancellations</h2>
  <p className="mb-4">You may cancel your subscription at any time. Cancellation stops future charges, and your premium access will continue until the end of your current billing period. We do not provide prorated refunds for partial months.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">5. How to Request a Refund</h2>
  <p className="mb-4">To request a refund, please email <strong>support@validore.app</strong> from the email address associated with your account, or use the in-app support request form.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">6. Processing Time</h2>
  <p className="mb-4">Refunds are processed within 5-10 business days and will be returned to your original payment method (via Stripe or Razorpay).</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">7. Statutory Savings</h2>
  <p className="mb-4">Nothing in this policy limits your mandatory consumer rights under applicable law, including the EU Consumer Rights Directive, the India Consumer Protection Act 2019, or US state laws regarding digital goods and services.</p>
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
