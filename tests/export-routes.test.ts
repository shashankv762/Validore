import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import JSZip from 'jszip'
import { parseCsvRows, isValidPdfBuffer, isValidZipBuffer, assertZeroValidoreBranding } from './e2e/helpers/test-fixtures'

// Mock dependencies
const mockUser = {
  id: 'user-1111-2222-3333-4444',
  email: 'founder@example.com',
  supabaseId: 'supa-1111-2222-3333-4444',
  tier: 'max_premium' as 'free' | 'premium' | 'max_premium',
  pitchDeckCredits: 0,
  crowdfundingCredits: 0,
  creditBalance: 4500,
  purchasedCredits: 0,
}

const mockIdea = {
  id: 'idea-1111-2222-3333-4444',
  userId: 'user-1111-2222-3333-4444',
  name: 'QuantumScale Cloud',
  industry: 'Enterprise Infrastructure',
  product: 'Autonomous Kubernetes Autoscaler',
  targetCustomer: 'Mid-market DevOps & Platform Engineering Teams',
  location: 'San Francisco, CA',
  businessModel: 'B2B Subscription SaaS',
  coreProblem: 'Engineering teams overprovision cloud compute by 45% due to unpredictable traffic spikes.',
  proposedSolution: 'Predictive multi-agent orchestration engine that dynamically scales clusters 5 minutes before traffic arrives.',
}

const mockReport = {
  id: 'rep-1111-2222-3333-4444',
  jobId: 'job-1111-2222-3333-4444',
  ideaId: 'idea-1111-2222-3333-4444',
  userId: 'user-1111-2222-3333-4444',
  overallScore: 86,
  problemScore: 90,
  customerScore: 85,
  marketScore: 88,
  competitiveScore: 82,
  wtpScore: 84,
  businessModelScore: 87,
  financialScore: 85,
  executionScore: 86,
  decision: 'GO' as const,
  decisionReasons: [
    'Clear customer willingness to pay identified in 15 discovery calls',
    'High-margin unit economics with 4.8x LTV/CAC ratio',
    'Significant TAM exceeding $12B with 24% annual growth',
  ],
  keyEvidence: [
    { text: 'Market CAGR 24.5% through 2030', strength: 'STRONGER' },
  ],
  keyRisks: [
    'Cloud provider native tooling could attempt to copy autoscaling heuristics',
  ],
  actionPlan: [
    { week: 'Week 1-2', action: 'Deploy synthetic benchmark simulator to open source', kpi: '500 GitHub stars' },
    { week: 'Week 3-4', action: 'Run closed beta pilot with 5 design partners', kpi: '3 letter of intents' },
  ],
  reportData: {
    tamSamSom: {
      tam: { value: '$12,000,000,000', method: 'Top-down', label: 'PROJECTION' },
      sam: { value: '$3,400,000,000', method: 'Bottom-up', label: 'PROJECTION' },
      som: { value: '$450,000,000', method: 'Target share', label: 'PROJECTION' },
    },
    financialSummary: {
      cac: 250,
      ltv: 1200,
      breakEvenMonths: 6,
      breakEvenUnits: 180,
    },
    competitors: [
      { name: 'Native Cloud Autoscaler', threat: 'High', weakness: 'Reactive rather than predictive' },
    ],
    selectedUvp: '10x faster cluster optimization with zero configuration',
  },
  createdAt: new Date('2026-02-01T12:00:00Z'),
}

const mockPitchDeck = {
  id: 'deck-1111-2222-3333-4444',
  ideaId: 'idea-1111-2222-3333-4444',
  userId: 'user-1111-2222-3333-4444',
  qualityScore: 88,
  founderReadinessScore: 85,
  slides: [
    { title: 'Cover', slideNumber: 1, headline: 'QuantumScale Cloud', content: 'Autonomous Infrastructure Autoscaling', speakerNotes: 'Welcome investors.' },
    { title: 'The Problem', slideNumber: 2, headline: '45% of Cloud Spend is Wasted', content: 'Overprovisioning costs billions annually.', speakerNotes: 'Address market failure rates.' },
    { title: 'The Solution', slideNumber: 3, headline: 'Predictive Multi-Agent Orchestration', content: 'Scale before spikes hit.', speakerNotes: 'Demonstrate product magic.' },
    { title: 'Market Opportunity', slideNumber: 4, headline: '$12B Addressable Market', content: 'TAM: $12B, SAM: $3.4B, SOM: $450M.', speakerNotes: 'Explain market size.' },
    { title: 'Product Architecture', slideNumber: 5, headline: 'Zero-Agent Daemon Architecture', content: 'Connects in 60 seconds.', speakerNotes: 'Highlight technical moat.' },
    { title: 'Business Model', slideNumber: 6, headline: 'Usage + Tiered SaaS', content: '$49/mo Pro, $99/mo Max, Enterprise.', speakerNotes: 'Walk through monetization.' },
    { title: 'Competitive Advantage', slideNumber: 7, headline: '10x Faster Predictive Control', content: 'Defensible data network effects.', speakerNotes: 'Emphasize defensibility.' },
    { title: 'Go-To-Market Strategy', slideNumber: 8, headline: 'Developer Community & Open Source', content: 'Self-serve bottom-up adoption.', speakerNotes: 'Detail organic distribution.' },
    { title: 'Validation & Traction', slideNumber: 9, headline: '86/100 Validation Score', content: 'Validated with design partners.', speakerNotes: 'Present concrete evidence.' },
    { title: 'Financial Projections', slideNumber: 10, headline: '85% Gross Margin Economics', content: 'High capital efficiency.', speakerNotes: 'Review unit economics.' },
    { title: 'Team & Milestones', slideNumber: 11, headline: 'Experienced Cloud Engineers', content: 'Founders with prior exits.', speakerNotes: 'Introduce core leadership.' },
    { title: 'The Ask', slideNumber: 12, headline: '$1.5M Seed Financing', content: 'Scale engineering and sales.', speakerNotes: 'Close with fund allocation.' },
  ],
  roadmap: [
    {
      phase: 'Q1: Foundation',
      timeframe: 'Month 1-3',
      milestones: [
        { milestone: 'Launch open-source autoscaling telemetry', status: 'ACHIEVED' },
        { milestone: 'Sign 5 design partners', status: 'ACHIEVED' },
      ],
    },
    {
      phase: 'Q2: Commercial Expansion',
      timeframe: 'Month 4-6',
      milestones: [
        { milestone: 'Launch self-serve cloud dashboard', status: 'PLANNED' },
        { milestone: 'Reach $25k MRR', status: 'PLANNED' },
      ],
    },
  ],
  reportData: {},
  createdAt: new Date('2026-02-01T12:00:00Z'),
}

// Current test state variables
let authUser: { id: string; email: string } | null = {
  id: 'supa-1111-2222-3333-4444',
  email: 'founder@example.com',
}
let currentDbUser: typeof mockUser | null = { ...mockUser }
let currentTierConfig = {
  canExportCsv: true,
  canWhitelabelPdf: true,
  canPortfolioExport: true,
  canExportPptx: true,
  canExportPdf: true,
  monthlyValidationLimit: 50,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: authUser },
        error: authUser ? null : new Error('Unauthorized'),
      })),
    },
  })),
}))

vi.mock('@/lib/tier-gate', () => ({
  getUserWithTierConfig: vi.fn(async (supabaseId: string) => {
    if (!currentDbUser || currentDbUser.supabaseId !== supabaseId) return null
    return { user: currentDbUser, config: currentTierConfig }
  }),
  canUserAccess: vi.fn(async (supabaseId: string, feature: string) => {
    if (!currentDbUser || currentDbUser.supabaseId !== supabaseId) return false
    return Boolean((currentTierConfig as Record<string, unknown>)[feature])
  }),
  canUserAccessWithCredits: vi.fn(async (supabaseId: string, feature: string) => {
    if (!currentDbUser || currentDbUser.supabaseId !== supabaseId) return { allowed: false, reason: 'denied' }
    if (feature === 'pitch_deck') {
      if (currentTierConfig.canExportPptx) return { allowed: true, reason: 'tier' }
      if (currentDbUser.pitchDeckCredits > 0) return { allowed: true, reason: 'credit' }
    }
    return { allowed: false, reason: 'denied' }
  }),
}))

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: vi.fn(async () => currentDbUser),
      },
      ideas: {
        findFirst: vi.fn(async () => mockIdea),
        findMany: vi.fn(async () => [mockIdea]),
      },
      validationReports: {
        findFirst: vi.fn(async () => mockReport),
        findMany: vi.fn(async () => [mockReport]),
      },
      pitchDecks: {
        findFirst: vi.fn(async () => mockPitchDeck),
        findMany: vi.fn(async () => [mockPitchDeck]),
      },
      tierConfig: {
        findFirst: vi.fn(async () => currentTierConfig),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(async () => [mockUser]),
        })),
        returning: vi.fn(async () => [mockUser]),
      })),
    })),
  },
}))

describe('Export Endpoints Comprehensive Test Suite', () => {
  beforeEach(() => {
    authUser = { id: 'supa-1111-2222-3333-4444', email: 'founder@example.com' }
    currentDbUser = { ...mockUser }
    currentTierConfig = {
      canExportCsv: true,
      canWhitelabelPdf: true,
      canPortfolioExport: true,
      canExportPptx: true,
      canExportPdf: true,
      monthlyValidationLimit: 50,
    }
  })

  // =========================================================================
  // 1. GET /api/export/csv
  // =========================================================================
  describe('GET /api/export/csv', () => {
    it('returns 401 when unauthenticated', async () => {
      authUser = null
      const { GET } = await import('@/app/api/export/csv/route')
      const req = new NextRequest('http://localhost:3000/api/export/csv?reportId=rep-1111-2222-3333-4444')
      const res = await GET(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 400 when reportId is missing or invalid UUID', async () => {
      const { GET } = await import('@/app/api/export/csv/route')
      const reqMissing = new NextRequest('http://localhost:3000/api/export/csv')
      const resMissing = await GET(reqMissing)
      expect(resMissing.status).toBe(400)

      const reqInvalid = new NextRequest('http://localhost:3000/api/export/csv?reportId=not-a-uuid')
      const resInvalid = await GET(reqInvalid)
      expect(resInvalid.status).toBe(400)
    })

    it('returns 403 when user is on Free tier (canExportCsv = false)', async () => {
      currentTierConfig.canExportCsv = false
      currentDbUser!.tier = 'free'

      const { GET } = await import('@/app/api/export/csv/route')
      const req = new NextRequest('http://localhost:3000/api/export/csv?reportId=c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d')
      const res = await GET(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('CSV export requires Pro or Max tier')
    })

    it('returns 200 with valid RFC 4180 CSV containing all required sections and metrics', async () => {
      const reportUuid = 'c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d'
      const { GET } = await import('@/app/api/export/csv/route')
      const req = new NextRequest(`http://localhost:3000/api/export/csv?reportId=${reportUuid}`)
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('text/csv')
      expect(res.headers.get('content-disposition')).toContain(`attachment; filename="validation-report-${reportUuid}.csv"`)

      const text = await res.text()
      const rows = parseCsvRows(text)

      expect(rows.length).toBeGreaterThan(15)
      // Header row
      expect(rows[0]).toEqual(['Category', 'Metric', 'Score_Or_Value', 'Details_And_Evidence'])

      // Metadata rows
      const reportIdRow = rows.find(r => r[0] === 'Metadata' && r[1] === 'Report ID')
      expect(reportIdRow).toBeDefined()
      expect(reportIdRow![3]).toBe('Validore Autonomous Validation Engine Report')

      const startupNameRow = rows.find(r => r[0] === 'Metadata' && r[1] === 'Startup Name')
      expect(startupNameRow).toBeDefined()
      expect(startupNameRow![2]).toBe('QuantumScale Cloud')

      // Score rows
      const overallScoreRow = rows.find(r => r[0] === 'Scores' && r[1] === 'Market Score')
      expect(overallScoreRow).toBeDefined()
      expect(overallScoreRow![2]).toBe('88')

      // Financial rows
      const tamRow = rows.find(r => r[0] === 'Financial' && r[1] === 'TAM')
      expect(tamRow).toBeDefined()
      expect(tamRow![2]).toBe('$12,000,000,000')

      const ltvCacRow = rows.find(r => r[0] === 'Financial' && r[1] === 'LTV/CAC')
      expect(ltvCacRow).toBeDefined()

      // Strategic rows
      const problemRow = rows.find(r => r[0] === 'Strategic' && r[1] === 'Problem')
      expect(problemRow).toBeDefined()
    })
  })

  // =========================================================================
  // 2. GET /api/export/pdf/white-label
  // =========================================================================
  describe('GET /api/export/pdf/white-label', () => {
    it('returns 401 when unauthenticated', async () => {
      authUser = null
      const { GET } = await import('@/app/api/export/pdf/white-label/route')
      const req = new NextRequest('http://localhost:3000/api/export/pdf/white-label?reportId=c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d')
      const res = await GET(req)
      expect(res.status).toBe(401)
    })

    it('returns 400 when reportId is invalid UUID', async () => {
      const { GET } = await import('@/app/api/export/pdf/white-label/route')
      const req = new NextRequest('http://localhost:3000/api/export/pdf/white-label?reportId=invalid-id')
      const res = await GET(req)
      expect(res.status).toBe(400)
    })

    it('returns 403 when user is not on Max tier (canWhitelabelPdf = false)', async () => {
      currentTierConfig.canWhitelabelPdf = false
      currentDbUser!.tier = 'premium'

      const { GET } = await import('@/app/api/export/pdf/white-label/route')
      const req = new NextRequest('http://localhost:3000/api/export/pdf/white-label?reportId=c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d')
      const res = await GET(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('White-label PDF export requires Max tier')
    })

    it('returns 200 with valid white-label PDF buffer with correct headers and zero branding', async () => {
      const reportUuid = 'c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d'
      const { GET } = await import('@/app/api/export/pdf/white-label/route')
      const req = new NextRequest(`http://localhost:3000/api/export/pdf/white-label?reportId=${reportUuid}`)
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/pdf')
      expect(res.headers.get('content-disposition')).toBe(`attachment; filename="report-${reportUuid}.pdf"`)

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      expect(isValidPdfBuffer(buffer)).toBe(true)

      // Strict Zero Branding check
      const bufferString = buffer.toString('utf8')
      expect(() => assertZeroValidoreBranding(bufferString)).not.toThrow()
    })
  })

  // =========================================================================
  // 3. GET /api/export/portfolio
  // =========================================================================
  describe('GET /api/export/portfolio', () => {
    it('returns 401 when unauthenticated', async () => {
      authUser = null
      const { GET } = await import('@/app/api/export/portfolio/route')
      const req = new NextRequest('http://localhost:3000/api/export/portfolio')
      const res = await GET(req)
      expect(res.status).toBe(401)
    })

    it('returns 403 when user is not on Max tier (canPortfolioExport = false)', async () => {
      currentTierConfig.canPortfolioExport = false
      currentDbUser!.tier = 'premium'

      const { GET } = await import('@/app/api/export/portfolio/route')
      const req = new NextRequest('http://localhost:3000/api/export/portfolio')
      const res = await GET(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('Portfolio export requires Max tier')
    })

    it('returns 200 with multi-file ZIP archive containing index.html, styles.css, README.md', async () => {
      const { GET } = await import('@/app/api/export/portfolio/route')
      const req = new NextRequest('http://localhost:3000/api/export/portfolio')
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/zip')
      expect(res.headers.get('content-disposition')).toBe('attachment; filename="startup-portfolio.zip"')

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      expect(isValidZipBuffer(buffer)).toBe(true)

      // Inspect ZIP contents
      const zip = await JSZip.loadAsync(buffer)
      expect(zip.file('index.html')).toBeDefined()
      expect(zip.file('styles.css')).toBeDefined()
      expect(zip.file('README.md')).toBeDefined()

      const html = await zip.file('index.html')!.async('string')
      expect(html).toContain('id="hero"')
      expect(html).toContain('id="problem"')
      expect(html).toContain('id="solution"')
      expect(html).toContain('id="roadmap"')
      expect(html).toContain('QuantumScale Cloud')

      const css = await zip.file('styles.css')!.async('string')
      expect(css).toContain('--primary:')
      expect(css).toContain('--gold:')

      const readme = await zip.file('README.md')!.async('string')
      expect(readme).toContain('GitHub Pages')
      expect(readme).toContain('Vercel')
    })
  })

  // =========================================================================
  // 4. GET /api/export/pptx
  // =========================================================================
  describe('GET /api/export/pptx', () => {
    it('returns 401 when unauthenticated', async () => {
      authUser = null
      const { GET } = await import('@/app/api/export/pptx/route')
      const req = new NextRequest('http://localhost:3000/api/export/pptx?ideaId=c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d')
      const res = await GET(req)
      expect(res.status).toBe(401)
    })

    it('returns 400 when neither ideaId nor deckId is provided', async () => {
      const { GET } = await import('@/app/api/export/pptx/route')
      const req = new NextRequest('http://localhost:3000/api/export/pptx')
      const res = await GET(req)
      expect(res.status).toBe(400)
    })

    it('returns 403 when user is free tier and has 0 pitch deck credits', async () => {
      currentTierConfig.canExportPptx = false
      currentDbUser!.tier = 'free'
      currentDbUser!.pitchDeckCredits = 0

      const { GET } = await import('@/app/api/export/pptx/route')
      const req = new NextRequest('http://localhost:3000/api/export/pptx?ideaId=c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d')
      const res = await GET(req)
      expect(res.status).toBe(403)
      const data = await res.json()
      expect(data.error).toBe('PPTX export requires Max tier or pitch deck credits')
    })

    it('returns 200 when user is free tier BUT possesses purchased pitchDeckCredits', async () => {
      currentTierConfig.canExportPptx = false
      currentDbUser!.tier = 'free'
      currentDbUser!.pitchDeckCredits = 1 // credit access allowed

      const deckUuid = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
      const { GET } = await import('@/app/api/export/pptx/route')
      const req = new NextRequest(`http://localhost:3000/api/export/pptx?deckId=${deckUuid}`)
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      expect(res.headers.get('content-disposition')).toBe(`attachment; filename="pitch-deck-${deckUuid}.pptx"`)

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      expect(isValidZipBuffer(buffer)).toBe(true) // PPTX is a zip-based OpenXML container

      // Inspect PPTX core properties for author Validore
      const pptxZip = await JSZip.loadAsync(buffer)
      const coreXml = await pptxZip.file('docProps/core.xml')?.async('string')
      expect(coreXml).toBeDefined()
      expect(coreXml).toContain('<dc:creator>Validore</dc:creator>')
    })

    it('returns 200 with valid PPTX when user is Max tier querying by ideaId', async () => {
      const ideaUuid = 'c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d'
      const { GET } = await import('@/app/api/export/pptx/route')
      const req = new NextRequest(`http://localhost:3000/api/export/pptx?ideaId=${ideaUuid}`)
      const res = await GET(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
      expect(res.headers.get('content-disposition')).toBe(`attachment; filename="pitch-deck-${ideaUuid}.pptx"`)

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      expect(isValidZipBuffer(buffer)).toBe(true)

      // Inspect PPTX core properties for author Validore
      const pptxZip = await JSZip.loadAsync(buffer)
      const coreXml = await pptxZip.file('docProps/core.xml')?.async('string')
      expect(coreXml).toBeDefined()
      expect(coreXml).toContain('<dc:creator>Validore</dc:creator>')
    })
  })
})
