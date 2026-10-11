import { config } from 'dotenv'
config({ path: '.env.local' })

import { NextRequest } from 'next/server'

export interface MockUserRecord {
  id: string
  email: string
  supabaseId: string
  tier: 'free' | 'premium' | 'max_premium'
  crowdfundingCredits: number
  pitchDeckCredits: number
  validationsThisMonth: number
  validationResetAt: Date | null
  creditBalance: number
  purchasedCredits: number
  isFoundingMember: boolean
  createdAt: Date
  updatedAt: Date
}

export interface MockTierConfig {
  id: string
  tier: 'free' | 'premium' | 'max_premium'
  monthlyValidationLimit: number
  maxActiveIdeas: number
  maxConcurrentRequests: number
  maxTokensPerCall: number
  canExportPdf: boolean
  canExportCsv: boolean
  canExportPptx: boolean
  canWhitelabelPdf: boolean
  canPortfolioExport: boolean
  canLeanCanvas: boolean
  canPricingSimulator: boolean
  canCrowdfunding: boolean
  canPitchDeck: boolean
  canAiLeanCanvas: boolean
}

export const TIER_CONFIG_SPECS: Record<'free' | 'premium' | 'max_premium', MockTierConfig> = {
  free: {
    id: '11111111-1111-1111-1111-111111111111',
    tier: 'free',
    monthlyValidationLimit: 2,
    maxActiveIdeas: 1,
    maxConcurrentRequests: 1,
    maxTokensPerCall: 4000,
    canExportPdf: false,
    canExportCsv: false,
    canExportPptx: false,
    canWhitelabelPdf: false,
    canPortfolioExport: false,
    canLeanCanvas: true,
    canPricingSimulator: false,
    canCrowdfunding: false,
    canPitchDeck: false,
    canAiLeanCanvas: false,
  },
  premium: {
    id: '22222222-2222-2222-2222-222222222222',
    tier: 'premium',
    monthlyValidationLimit: 15,
    maxActiveIdeas: 10,
    maxConcurrentRequests: 3,
    maxTokensPerCall: 8000,
    canExportPdf: true,
    canExportCsv: true,
    canExportPptx: false,
    canWhitelabelPdf: false,
    canPortfolioExport: false,
    canLeanCanvas: true,
    canPricingSimulator: true,
    canCrowdfunding: false,
    canPitchDeck: false,
    canAiLeanCanvas: true,
  },
  max_premium: {
    id: '33333333-3333-3333-3333-333333333333',
    tier: 'max_premium',
    monthlyValidationLimit: 50,
    maxActiveIdeas: 100,
    maxConcurrentRequests: 10,
    maxTokensPerCall: 16000,
    canExportPdf: true,
    canExportCsv: true,
    canExportPptx: true,
    canWhitelabelPdf: true,
    canPortfolioExport: true,
    canLeanCanvas: true,
    canPricingSimulator: true,
    canCrowdfunding: true,
    canPitchDeck: true,
    canAiLeanCanvas: true,
  },
}

export function createMockUser(overrides: Partial<MockUserRecord> = {}): MockUserRecord {
  const id = overrides.id ?? 'usr-1111-2222-3333'
  const tier = overrides.tier ?? 'free'
  const defaultCreditBalance = tier === 'max_premium' ? 4500 : (tier === 'premium' ? 1500 : 100)
  
  return {
    id,
    email: 'founder@example.com',
    supabaseId: `sb-${id}`,
    tier,
    crowdfundingCredits: 0,
    pitchDeckCredits: 0,
    validationsThisMonth: 0,
    validationResetAt: null,
    creditBalance: defaultCreditBalance,
    purchasedCredits: 0,
    isFoundingMember: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export function createMockIdea(userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'idea-4444-5555-6666',
    userId,
    name: 'Validore Cloud',
    industry: 'Software / SaaS',
    product: 'Autonomous Startup Validator',
    targetCustomer: 'Solo Founders and Early Stage Accelerators',
    location: 'United States',
    businessModel: 'B2B SaaS Subscription',
    coreProblem: 'Founders waste 6+ months building products without customer validation',
    proposedSolution: 'AI-driven multi-agent simulation that stresstests business assumptions in 60 seconds',
    isReadOnly: false,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export function createMockReport(ideaId: string, userId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'rep-7777-8888-9999',
    ideaId,
    userId,
    jobId: 'job-0000-1111-2222',
    shareToken: 'tok-3333-4444-5555',
    overallScore: 82,
    problemScore: 85,
    customerScore: 80,
    marketScore: 88,
    competitiveScore: 75,
    wtpScore: 78,
    businessModelScore: 84,
    financialScore: 80,
    executionScore: 86,
    decision: 'GO' as const,
    decisionReasons: [
      'Strong willingness to pay detected in SMB customer interviews',
      'Defensible proprietary data flywheel creates moat against incumbents',
      'Unit economics demonstrate 4.2x LTV/CAC with 7-month payback',
    ],
    keyEvidence: [
      { text: 'Market CAGR of 28.4% over 2024-2030', strength: 'STRONGER' },
      { text: 'Customer interview validation: 14 out of 18 willing to prepay', strength: 'STRONGER' },
      { text: 'Competitor pricing benchmark: $49/mo vs market average $89/mo', strength: 'MODERATE' },
    ],
    keyRisks: [
      'Customer acquisition cost could spike if organic referral rate drops below 15%',
      'API rate limit dependencies on external LLM providers',
    ],
    actionPlan: [
      { step: 1, action: 'Deploy landing page with prepayment waitlist', timeframe: 'Week 1-2' },
      { step: 2, action: 'Run paid search experiment on 3 core search intents', timeframe: 'Week 3-4' },
      { step: 3, action: 'Conduct 20 customer discovery interviews with accelerator directors', timeframe: 'Month 2' },
    ],
    reportData: {
      idea: {
        name: 'Validore Cloud',
        industry: 'Software / SaaS',
        product: 'Autonomous Startup Validator',
        location: 'United States',
        businessModel: 'B2B SaaS Subscription',
      },
      competitors: [
        { name: 'Manual Consulting', threat: 'Moderate', weakness: 'Slow & expensive ($10k+)' },
        { name: 'Generic Survey Tools', threat: 'Low', weakness: 'Zero automated synthesis' },
      ],
      financialSummary: {
        cac: 120,
        ltv: 510,
        breakEvenMonths: 7,
        grossMargin: '84%',
      },
    },
    isLite: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

export function createMockPitchDeck(ideaId: string, userId: string, overrides: Record<string, unknown> = {}) {
  const slides = [
    { title: 'Cover', slideNumber: 1, headline: 'Validore Cloud', content: 'Autonomous Startup Idea Validation', speakerNotes: 'Welcome investors.' },
    { title: 'The Problem', slideNumber: 2, headline: '90% of Startups Fail', content: 'Founders build what nobody wants.', speakerNotes: 'Address market failure rates.' },
    { title: 'The Solution', slideNumber: 3, headline: '60-Second Validation Engine', content: 'Autonomous multi-agent market simulations.', speakerNotes: 'Demonstrate product magic.' },
    { title: 'Market Opportunity', slideNumber: 4, headline: '$14B Global Market', content: 'TAM: $14B, SAM: $3.2B, SOM: $480M.', speakerNotes: 'Explain sizing and CAGR.' },
    { title: 'Product Architecture', slideNumber: 5, headline: 'Proprietary Evidence Engine', content: 'Synthetic customer panels + financial simulator.', speakerNotes: 'Highlight technical moat.' },
    { title: 'Business Model', slideNumber: 6, headline: 'Predictable SaaS Revenue', content: '$49/mo Pro, $99/mo Max, Enterprise custom.', speakerNotes: 'Walk through monetization.' },
    { title: 'Competitive Advantage', slideNumber: 7, headline: '10x Faster & Cheaper', content: 'Continuous validation vs one-off consultancy.', speakerNotes: 'Emphasize defensibility.' },
    { title: 'Go-To-Market Strategy', slideNumber: 8, headline: 'Product-Led Growth', content: 'Free validation tear-downs, viral reports.', speakerNotes: 'Detail organic distribution.' },
    { title: 'Validation & Traction', slideNumber: 9, headline: 'Strong Early Signals', content: '82/100 validation score, 1,200 waitlist signups.', speakerNotes: 'Present concrete evidence.' },
    { title: 'Financial Projections', slideNumber: 10, headline: 'High-Margin Economics', content: '84% Gross Margin, $3.2M ARR in Year 2.', speakerNotes: 'Review unit economics.' },
    { title: 'Team & Milestones', slideNumber: 11, headline: 'Experienced Builders', content: 'Technical founders with prior exits.', speakerNotes: 'Introduce core leadership.' },
    { title: 'The Ask', slideNumber: 12, headline: '$1.5M Seed Financing', content: '18 months runway to scale to $1M ARR.', speakerNotes: 'Close with fund allocation.' },
  ]

  return {
    id: 'deck-1111-2222-3333',
    ideaId,
    userId,
    qualityScore: 88,
    founderReadinessScore: 84,
    slides,
    pitchScript3min: 'Hello, I am pitching Validore Cloud...',
    pitchScript60sec: 'Validore Cloud validates startup ideas in 60 seconds...',
    investorQa: [
      { question: 'How do you defend against ChatGPT?', answer: 'We synthesize structured market telemetry, financial simulations, and benchmark datasets.' },
    ],
    roadmap: [
      { phase: 'Q1', milestone: 'Beta Launch', status: 'ACHIEVED' },
      { phase: 'Q2', milestone: 'Enterprise Export Engine', status: 'IN_PROGRESS' },
    ],
    reportData: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * Creates a NextRequest object for test invocation
 */
export function createTestRequest(
  urlPath: string,
  options: {
    method?: string
    body?: Record<string, unknown> | string
    headers?: Record<string, string>
    searchParams?: Record<string, string>
  } = {}
): NextRequest {
  const baseUrl = 'http://localhost:3000'
  const url = new URL(urlPath, baseUrl)
  if (options.searchParams) {
    for (const [key, value] of Object.entries(options.searchParams)) {
      url.searchParams.set(key, value)
    }
  }

  const reqInit: RequestInit = {
    method: options.method || 'GET',
    headers: {
      'host': 'localhost:3000',
      ...(options.headers || {}),
    },
  }

  if (options.body) {
    if (typeof options.body === 'string') {
      reqInit.body = options.body
    } else {
      reqInit.body = JSON.stringify(options.body)
      ;(reqInit.headers as Record<string, string>)['content-type'] = 'application/json'
    }
  }

  return new NextRequest(url, reqInit as unknown as ConstructorParameters<typeof NextRequest>[1])
}

/**
 * Validates whether a buffer starts with standard PDF magic number '%PDF-'
 */
export function isValidPdfBuffer(buffer: Uint8Array | ArrayBuffer | Buffer): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.length < 5) return false
  const header = String.fromCharCode(...bytes.slice(0, 5))
  return header === '%PDF-'
}

/**
 * Validates whether a buffer starts with standard ZIP/OpenXML magic number 'PK\x03\x04'
 */
export function isValidZipBuffer(buffer: Uint8Array | ArrayBuffer | Buffer): boolean {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  if (bytes.length < 4) return false
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * Parse RFC 4180 CSV rows including multiline quoted fields
 */
export function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i]
    if (char === '"') {
      if (inQuotes && csvContent[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(cur)
      cur = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && csvContent[i + 1] === '\n') {
        i++
      }
      currentRow.push(cur)
      cur = ''
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow)
      }
      currentRow = []
    } else {
      cur += char
    }
  }

  if (cur.length > 0 || currentRow.length > 0) {
    currentRow.push(cur)
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}

/**
 * Asserts strict absence of Validore branding in text/markdown/HTML
 */
export function assertZeroValidoreBranding(content: string): void {
  const forbiddenPatterns = [
    /validore/i,
    /validore\.app/i,
    /know it's gold before you dig/i,
  ]
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(content)) {
      throw new Error(`Branding violation: Found prohibited branding matching ${pattern}`)
    }
  }
}
