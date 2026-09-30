import os

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')

BASE_DIR = r"c:\Users\2025\IIT DELHI\entrepreneur\aurexa"

def get_legal_layout(title, content):
    return f"""
import Link from 'next/link'
import Image from 'next/image'

export const metadata = {{
  title: '{title} | Aurexa',
  description: '{title} for Aurexa - AI-powered startup validation.',
}}

export default function LegalPage() {{
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col">
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 border-b border-[#E8E0D0] bg-[#FAFAF7]">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={36} height={36} />
          <span className="text-xl font-light tracking-widest text-[#1C1C1C]">aurexa</span>
        </Link>
        <div className="flex items-center gap-6">
          <Link href="/auth/signin" className="text-sm text-[#1C1C1C] hover:text-[#C8A860] transition-colors focus:ring-2 focus:ring-[#C8A860] outline-none">
            Sign In
          </Link>
        </div>
      </nav>

      <main className="flex-1 max-w-3xl w-full mx-auto px-8 py-16">
        <div className="card-angular p-10 bg-[#FAFAF7]">
          {content}
        </div>
      </main>

      <footer className="border-t border-[#E8E0D0] py-12 bg-[#FAFAF7]">
        <div className="max-w-5xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-2">
             <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={24} height={24} />
             <span className="text-sm font-light tracking-widest text-[#1C1C1C]">aurexa</span>
           </div>
           <div className="flex flex-wrap justify-center gap-6 text-sm text-[#1C1C1C] opacity-70">
              <Link href="/legal/privacy" className="hover:text-[#C8A860]">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:text-[#C8A860]">Terms of Service</Link>
              <Link href="/legal/cookies" className="hover:text-[#C8A860]">Cookie Policy</Link>
              <Link href="/legal/refund" className="hover:text-[#C8A860]">Refund Policy</Link>
           </div>
        </div>
        <div className="max-w-5xl mx-auto px-8 mt-8 text-center md:text-left text-xs text-[#1C1C1C] opacity-40 flex flex-col md:flex-row justify-between">
           <p>© 2026 Aurexa. All rights reserved.</p>
           <p>Aurexa is operated by John Doe, New Delhi, India. Contact: support@aurexa.app</p>
        </div>
      </footer>
    </div>
  )
}}
"""

privacy_content = """
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
"""

terms_content = """
<h1 className="text-3xl font-light text-[#0A1628] mb-8">Terms of Service</h1>
<div className="text-sm text-[#1C1C1C] opacity-70 mb-8">Last updated: September 30, 2026</div>

<div className="prose prose-sm max-w-none text-[#1C1C1C]">
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">1. Acceptance of Terms</h2>
  <p className="mb-4">By accessing or using Aurexa, you agree to these Terms of Service. You must be at least 18 years old to use the Service.</p>
  
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">2. Account Responsibilities</h2>
  <p className="mb-4">You must provide accurate information when creating an account and are responsible for maintaining the security of your password and account.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">3. Service Description</h2>
  <p className="mb-4">Aurexa is an AI-powered startup validation tool. It provides educational decision-support tools. <strong>It does not provide financial advice, legal advice, or investment advice.</strong></p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">4. Important Disclaimer</h2>
  <p className="mb-4 font-medium p-4 bg-[#F5F0E8] border-l-4 border-[#C8A860]">
    Aurexa provides educational decision-support tools. Validation scores, financial projections, and recommendations are AI-generated estimates, not guarantees of business success. Do not make investment decisions solely based on Aurexa's output.
  </p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">5. Subscription Terms</h2>
  <p className="mb-4">Subscriptions automatically renew unless canceled. You may cancel at any time, and you will retain access to premium features until the end of your billing cycle. Downgrading may result in the loss of features or capacity.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">6. Payment Terms</h2>
  <p className="mb-4">Payments are processed securely via Stripe or Razorpay. Fees are stated in the applicable currency at checkout.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">7. Refund Policy</h2>
  <p className="mb-4">Our refund policy is outlined separately. Please review our <Link href="/legal/refund" className="text-[#C8A860] hover:underline">Refund Policy</Link> for full details.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">8. Credit Packs</h2>
  <p className="mb-4">Credit packs are non-refundable if consumed. Unused credit packs may be refunded within 30 days of purchase.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">9. Intellectual Property</h2>
  <p className="mb-4">You own all rights to your original startup idea data. Aurexa retains all rights to the platform, report formats, templates, and scoring methodology.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">10. User Content License</h2>
  <p className="mb-4">By submitting data, you grant Aurexa a necessary license to process your data through our AI providers solely for the purpose of delivering the Service to you.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">11. Prohibited Use</h2>
  <p className="mb-4">You agree not to use the Service for illegal content, reverse engineering, scraping, or attempting to extract the underlying AI prompts or models.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">12. Limitation of Liability</h2>
  <p className="mb-4">To the maximum extent permitted by law, Aurexa's liability is capped at the total fees you paid to us in the 12 months preceding the claim.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">13. Indemnification</h2>
  <p className="mb-4">You agree to indemnify and hold harmless Aurexa and its operator from any claims arising from your use of the Service.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">14. Termination</h2>
  <p className="mb-4">We reserve the right to terminate your access for breach of these terms. You may delete your account at any time.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">15. Governing Law</h2>
  <p className="mb-4">These Terms are governed by the laws of the Republic of India. Any disputes will be resolved in the courts of New Delhi.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">16. Severability & Entire Agreement</h2>
  <p className="mb-4">If any provision is found unenforceable, the rest remains in effect. These Terms constitute the entire agreement between you and Aurexa.</p>
</div>
"""

cookies_content = """
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
"""

refund_content = """
<h1 className="text-3xl font-light text-[#0A1628] mb-8">Refund Policy</h1>
<div className="text-sm text-[#1C1C1C] opacity-70 mb-8">Last updated: September 30, 2026</div>

<div className="prose prose-sm max-w-none text-[#1C1C1C]">
  <p className="mb-6 text-lg">We stand by the quality of Aurexa, but we understand it might not be the perfect fit for everyone. We offer a fair 30-day money-back guarantee with usage conditions.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">1. First Subscription Guarantee</h2>
  <p className="mb-4">You are eligible for a full refund on your first subscription payment within <strong>30 days</strong> of purchase, provided that you have consumed <strong>3 or fewer validation runs</strong> (or ≤20% of your tier's monthly allowance).</p>
  
  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">2. Credit Packs</h2>
  <p className="mb-4">Credit packs are <strong>refundable within 30 days if completely unused</strong>. Because delivering a validation report consumes expensive AI API credits, consumed credits are considered delivered digital goods and are non-refundable.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">3. Renewals</h2>
  <p className="mb-4">If your subscription auto-renews and you meant to cancel, we will issue a full refund if you request it within <strong>72 hours</strong> of the renewal charge, provided you have had zero usage since the renewal date.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">4. Cancellations</h2>
  <p className="mb-4">You may cancel your subscription at any time. Cancellation stops future charges, and your premium access will continue until the end of your current billing period. We do not provide prorated refunds for partial months.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">5. How to Request a Refund</h2>
  <p className="mb-4">To request a refund, please email <strong>support@aurexa.app</strong> from the email address associated with your account, or use the in-app support request form.</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">6. Processing Time</h2>
  <p className="mb-4">Refunds are processed within 5-10 business days and will be returned to your original payment method (via Stripe or Razorpay).</p>

  <h2 className="text-xl font-medium text-[#0A1628] mt-8 mb-4">7. Statutory Savings</h2>
  <p className="mb-4">Nothing in this policy limits your mandatory consumer rights under applicable law, including the EU Consumer Rights Directive, the India Consumer Protection Act 2019, or US state laws regarding digital goods and services.</p>
</div>
"""

write_file(os.path.join(BASE_DIR, 'src/app/legal/privacy/page.tsx'), get_legal_layout('Privacy Policy', privacy_content))
write_file(os.path.join(BASE_DIR, 'src/app/legal/terms/page.tsx'), get_legal_layout('Terms of Service', terms_content))
write_file(os.path.join(BASE_DIR, 'src/app/legal/cookies/page.tsx'), get_legal_layout('Cookie Policy', cookies_content))
write_file(os.path.join(BASE_DIR, 'src/app/legal/refund/page.tsx'), get_legal_layout('Refund Policy', refund_content))
