import Link from 'next/link'
import Image from 'next/image'

export const metadata = {
  title: 'Sign Up | Aurexa',
  description: 'Create your free Aurexa account.',
}

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding */}
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12" style={{ background: 'var(--navy)' }}>
        <div>
          <Link href="/" className="inline-flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={32} height={32} />
            <span className="text-xl font-light tracking-widest text-[#F5F0E8]">aurexa</span>
          </Link>
        </div>
        <div>
          <h1 className="text-4xl font-light text-[#F5F0E8] leading-tight mb-6" style={{ letterSpacing: '-0.02em' }}>
            Know it&apos;s gold<br />
            <span style={{ background: 'var(--gold-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              before you dig.
            </span>
          </h1>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-[#F5F0E8]">
               <span className="text-[#C8A860]">✦</span>
               <span className="text-sm">Validate ideas with 5 AI models</span>
            </div>
            <div className="flex items-center gap-3 text-[#F5F0E8]">
               <span className="text-[#C8A860]">✦</span>
               <span className="text-sm">Benchmark against actual competitors</span>
            </div>
            <div className="flex items-center gap-3 text-[#F5F0E8]">
               <span className="text-[#C8A860]">✦</span>
               <span className="text-sm">Project financials without spreadsheets</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right side - Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-[#F5F0E8]">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image src="/logo/aurexa-icon.svg" alt="Aurexa Logo" width={32} height={32} />
              <span className="text-xl font-light tracking-widest text-[#1C1C1C]">aurexa</span>
            </Link>
          </div>
          
          <div className="card-angular p-8 shadow-sm">
            <h2 className="text-2xl font-light text-[#0A1628] mb-6">Create your free account</h2>
            
            <form action="/api/auth/signup" method="POST" className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#1C1C1C] mb-1">Email</label>
                <input 
                  type="email" 
                  id="email" 
                  name="email" 
                  required 
                  className="w-full px-3 py-2 border border-[#E8E0D0] rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]"
                />
              </div>
              
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-[#1C1C1C] mb-1">Password</label>
                <input 
                  type="password" 
                  id="password" 
                  name="password" 
                  required 
                  className="w-full px-3 py-2 border border-[#E8E0D0] rounded focus:outline-none focus:ring-2 focus:ring-[#C8A860] bg-white text-[#1C1C1C]"
                />
              </div>
              
              <div className="flex items-start gap-2 pt-2">
                <input 
                  type="checkbox" 
                  id="consent" 
                  name="consent" 
                  required 
                  className="mt-1 border-[#E8E0D0] rounded text-[#C8A860] focus:ring-[#C8A860]"
                />
                <label htmlFor="consent" className="text-xs text-[#1C1C1C] opacity-80 leading-relaxed">
                  I agree to the <Link href="/legal/terms" className="text-[#C8A860] hover:underline">Terms of Service</Link> and <Link href="/legal/privacy" className="text-[#C8A860] hover:underline">Privacy Policy</Link>.
                </label>
              </div>
              
              <button 
                type="submit" 
                className="w-full py-2.5 mt-2 text-sm font-medium text-[#0A1628] transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#0A1628]"
                style={{ background: 'var(--gold-gradient)', borderRadius: '2px 8px 2px 8px' }}
              >
                Sign Up
              </button>
            </form>
            
            <div className="my-6 flex items-center">
              <div className="flex-1 border-t border-[#E8E0D0]"></div>
              <span className="px-3 text-xs text-[#1C1C1C] opacity-50 uppercase tracking-wider">Or</span>
              <div className="flex-1 border-t border-[#E8E0D0]"></div>
            </div>
            
            <form action="/api/auth/google" method="POST">
              <button 
                type="submit" 
                className="w-full py-2.5 px-4 border border-[#E8E0D0] rounded text-sm font-medium text-[#1C1C1C] flex items-center justify-center gap-2 hover:bg-[#F5F0E8] transition-colors focus:outline-none focus:ring-2 focus:ring-[#1C1C1C] bg-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </form>
            
            <p className="mt-6 text-center text-sm text-[#1C1C1C]">
              Already have an account? <Link href="/auth/signin" className="text-[#C8A860] hover:underline font-medium">Sign In</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
