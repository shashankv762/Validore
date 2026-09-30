import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Validore — Know it\'s gold before you dig.',
  description: 'AI-powered startup idea validation. Validate your startup with market research, competitor analysis, financial modelling, and a GO/NO-GO score — before you invest a single rupee.',
  openGraph: {
    title: 'Validore — Know it\'s gold before you dig.',
    description: 'AI-powered startup idea validation platform. Get your Validation Score /100 in minutes.',
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: 'Validore',
    type: 'website',
    images: [{ url: `${process.env.NEXT_PUBLIC_APP_URL}/og-image.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Validore — Know it\'s gold before you dig.',
    description: 'AI-powered startup idea validation. Get your GO/NO-GO score in minutes.',
  },
}

export default function LandingPage() {
  return (
    <main className="min-h-screen" style={{ background: 'var(--cream)' }}>
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-8 py-5 border-b border-[#E8E0D0] bg-[#FAFAF7]">
        <div className="flex items-center gap-3">
          <Image src="/logo/validore-icon.svg" alt="Validore Logo" width={36} height={36} />
          <span className="text-xl font-light tracking-widest text-[#1C1C1C]">validore</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/auth/signin" className="text-sm text-[#1C1C1C] hover:text-[#C8A860] transition-colors focus:ring-2 focus:ring-[#C8A860] outline-none">
            Sign In
          </Link>
          <Link
            href="/auth/signup"
            className="px-5 py-2 text-sm font-medium text-[#0A1628] transition-all hover:opacity-90 focus:ring-2 focus:ring-[#0A1628] outline-none"
            style={{ background: 'var(--gold-gradient)', borderRadius: '2px 10px 2px 10px' }}
          >
            Start Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 py-24 text-center bg-[#0A1628] rounded-xl my-8 card-angular" style={{ background: 'var(--navy)' }}>
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-xs font-medium text-[#C8A860] border border-[#C8A860] rounded-full bg-[#C8A86010]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C8A860] animate-pulse" />
          AI-Powered Startup Validation
        </div>
        <h1 className="text-5xl md:text-6xl font-light text-[#F5F0E8] leading-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
          Know it&apos;s gold<br />
          <span style={{ background: 'var(--gold-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            before you dig.
          </span>
        </h1>
        <p className="text-xl text-[#F5F0E8] opacity-80 max-w-2xl mx-auto mb-10 leading-relaxed">
          Validate your startup idea with AI-driven market research, competitor analysis, financial modelling, and a scored GO / NO-GO recommendation — before you invest time or money.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/auth/signup"
            className="px-8 py-4 text-base font-medium text-[#0A1628] transition-all hover:opacity-90 focus:ring-2 focus:ring-white outline-none"
            style={{ background: 'var(--gold-gradient)', borderRadius: '2px 14px 2px 14px' }}
          >
            Validate Your Idea Free →
          </Link>
          <Link
            href="#pricing"
            className="px-8 py-4 text-base font-medium text-[#F5F0E8] border border-[#E8E0D0] hover:border-[#C8A860] transition-colors card-angular focus:ring-2 focus:ring-white outline-none"
            style={{ background: 'transparent' }}
          >
            See Pricing
          </Link>
        </div>
        
        {/* Visual Representation */}
        <div className="mt-16 mx-auto max-w-3xl bg-[#FAFAF7] p-8 rounded-xl card-angular shadow-xl relative overflow-hidden">
          <div className="absolute top-4 right-4 text-xs font-bold text-[#C8A860] border border-[#C8A860] px-2 py-1 rounded">DEMO DATA</div>
          <div className="flex items-center justify-between mb-8 border-b border-[#E8E0D0] pb-4">
             <div className="text-left">
                <div className="text-sm text-[#1C1C1C] opacity-60">Validation Report</div>
                <div className="text-xl font-medium text-[#0A1628]">Project Alpha</div>
             </div>
             <div className="w-16 h-16 rounded-full border-4 border-[#C8A860] flex items-center justify-center relative">
                <span className="text-xl font-bold text-[#1C1C1C]">78</span>
             </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-left">
             <div className="p-4 bg-[#F5F0E8] rounded card-angular">
                <div className="text-xs text-[#1C1C1C] opacity-70">Market Size</div>
                <div className="text-lg font-medium text-[#0A1628]">$2.4B</div>
             </div>
             <div className="p-4 bg-[#F5F0E8] rounded card-angular">
                <div className="text-xs text-[#1C1C1C] opacity-70">Competitors</div>
                <div className="text-lg font-medium text-[#0A1628]">12 Found</div>
             </div>
             <div className="p-4 bg-[#F5F0E8] rounded card-angular">
                <div className="text-xs text-[#1C1C1C] opacity-70">Recommendation</div>
                <div className="text-lg font-medium text-[#C8A860]">GO</div>
             </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 py-20">
         <h2 className="text-3xl font-light text-center text-[#0A1628] mb-12">Five Modules to De-Risk Your Startup</h2>
         <div className="grid md:grid-cols-2 gap-8">
            <div className="card-angular p-6 hover:shadow-md transition-shadow">
               <h3 className="text-xl font-medium text-[#0A1628] mb-2">1. Validation Report</h3>
               <p className="text-[#1C1C1C] opacity-80 text-sm">A 40-section deep analysis including market research, competitor benchmarking, and a GO/NO-GO score.</p>
            </div>
            <div className="card-angular p-6 hover:shadow-md transition-shadow">
               <h3 className="text-xl font-medium text-[#0A1628] mb-2">2. Lean Canvas Automation</h3>
               <p className="text-[#1C1C1C] opacity-80 text-sm">Automatically generate and iterate on your 1-page business plan using AI insights.</p>
            </div>
            <div className="card-angular p-6 hover:shadow-md transition-shadow">
               <h3 className="text-xl font-medium text-[#0A1628] mb-2">3. Pricing Simulator</h3>
               <p className="text-[#1C1C1C] opacity-80 text-sm">Run dynamic financial models and scenarios to find the perfect price point for your product.</p>
            </div>
            <div className="card-angular p-6 hover:shadow-md transition-shadow">
               <h3 className="text-xl font-medium text-[#0A1628] mb-2">4. Crowdfunding Predictor</h3>
               <p className="text-[#1C1C1C] opacity-80 text-sm">Estimate campaign success probability based on a 300-campaign benchmark dataset.</p>
            </div>
            <div className="card-angular p-6 hover:shadow-md transition-shadow md:col-span-2 text-center max-w-2xl mx-auto">
               <h3 className="text-xl font-medium text-[#0A1628] mb-2">5. Pitch Deck Builder</h3>
               <p className="text-[#1C1C1C] opacity-80 text-sm">Export a ready-to-present pitch deck in PDF format, complete with white-label styling.</p>
            </div>
         </div>
      </section>

      {/* Social Proof */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
         <div className="bg-[#0A1628] rounded-xl p-10 card-angular text-center text-[#F5F0E8]">
            <h2 className="text-2xl font-light mb-8 text-[#C8A860]">Powered by verifiable data & models</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
               <div>
                  <div className="text-3xl font-light mb-1">5</div>
                  <div className="text-xs opacity-70">AI Models</div>
               </div>
               <div>
                  <div className="text-3xl font-light mb-1">18</div>
                  <div className="text-xs opacity-70">Financial Formulas</div>
               </div>
               <div>
                  <div className="text-3xl font-light mb-1">300+</div>
                  <div className="text-xs opacity-70">Campaign Benchmarks</div>
               </div>
               <div>
                  <div className="text-3xl font-light mb-1">40</div>
                  <div className="text-xs opacity-70">Analysis Sections</div>
               </div>
            </div>
         </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-3xl font-light text-center text-[#0A1628] mb-4">Simple, honest pricing</h2>
        <p className="text-center text-[#1C1C1C] opacity-60 mb-12">No lock-in. Cancel anytime.</p>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              name: 'Free',
              price: '$0',
              description: 'The Validator',
              features: ['1 active idea', '2 AI validations/mo', 'Lite score + GO/NO-GO', 'Public shareable report', 'Manual Lean Canvas'],
              cta: 'Start Free',
              href: '/auth/signup',
              highlight: false,
            },
            {
              name: 'Premium',
              price: '$29',
              per: '/mo',
              description: 'The Business Model Suite',
              features: ['10 ideas · 15 validations/mo', '40-section deep report', 'Lean Canvas Automation', 'Smart Pricing Simulator', 'PDF + CSV exports'],
              cta: 'Start Premium',
              href: '/auth/signup?plan=premium',
              highlight: true,
            },
            {
              name: 'Max Premium',
              price: '$79',
              per: '/mo',
              description: 'The Fundraising Suite',
              features: ['50 validations/mo', 'Crowdfunding Predictor', 'Pitch Deck Builder', 'PPTX + White-label PDF', 'Portfolio site export'],
              cta: 'Go Max Premium',
              href: '/auth/signup?plan=max',
              highlight: false,
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`card-angular p-8 relative ${plan.highlight ? 'border-[#C8A860] ring-1 ring-[#C8A860]' : ''}`}
            >
              {plan.highlight && (
                <div className="absolute top-0 right-8 transform -translate-y-1/2 bg-[#C8A860] text-[#0A1628] text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Most Popular
                </div>
              )}
              <div className="text-sm font-medium text-[#C8A860] mb-1">{plan.description}</div>
              <div className="text-3xl font-light text-[#0A1628] mb-1">
                {plan.price}<span className="text-base opacity-60">{plan.per}</span>
              </div>
              <div className="text-xl font-light text-[#1C1C1C] mb-6">{plan.name}</div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#1C1C1C]">
                    <span className="text-[#C8A860] mt-0.5">✦</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`block w-full text-center py-3 text-sm font-medium transition-all focus:ring-2 focus:ring-[#C8A860] outline-none ${
                  plan.highlight
                    ? 'text-[#0A1628]'
                    : 'text-[#1C1C1C] border border-[#E8E0D0] hover:border-[#C8A860]'
                }`}
                style={plan.highlight ? { background: 'var(--gold-gradient)', borderRadius: '2px 10px 2px 10px' } : { borderRadius: '2px 10px 2px 10px' }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E0D0] py-12 bg-[#FAFAF7]">
        <div className="max-w-5xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-2">
             <Image src="/logo/validore-icon.svg" alt="Validore Logo" width={24} height={24} />
             <span className="text-sm font-light tracking-widest text-[#1C1C1C]">validore</span>
           </div>
           <div className="flex flex-wrap justify-center gap-6 text-sm text-[#1C1C1C] opacity-70">
              <Link href="/legal/privacy" className="hover:text-[#C8A860]">Privacy Policy</Link>
              <Link href="/legal/terms" className="hover:text-[#C8A860]">Terms of Service</Link>
              <Link href="/legal/cookies" className="hover:text-[#C8A860]">Cookie Policy</Link>
              <Link href="/legal/refund" className="hover:text-[#C8A860]">Refund Policy</Link>
           </div>
        </div>
        <div className="max-w-5xl mx-auto px-8 mt-8 text-center md:text-left text-xs text-[#1C1C1C] opacity-40 flex flex-col md:flex-row justify-between">
           <p>© 2026 Validore. All rights reserved.</p>
           <p>Validore is operated by [Your Name], New Delhi, India. Contact: support@validore.app</p>
        </div>
      </footer>
    </main>
  )
}
