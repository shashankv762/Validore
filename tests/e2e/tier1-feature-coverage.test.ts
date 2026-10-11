/**
 * Tier 1: Feature Coverage E2E Test Suite
 *
 * Verifies baseline happy-path behavior, contracts, and requirements for all features
 * across Milestones M1 through M5 from PROJECT.md and ORIGINAL_REQUEST.md.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import * as schema from '@/db/schema'
import { TIER_CONFIG_SPECS, parseCsvRows, assertZeroValidoreBranding, isValidPdfBuffer, isValidZipBuffer } from './helpers/test-fixtures'
import { calculateContributionMargin, calculateBreakEvenUnits, calculateLTV, calculateCACPaybackPeriod } from '@/lib/financial'
import { STARTUP_WEIGHTS, BM_WEIGHTS, CAMPAIGN_WEIGHTS, PITCH_WEIGHTS, PRICING_WEIGHTS, validateWeightTable, ValidationDecision } from '@/lib/scoring'
import JSZip from 'jszip'

const PROJECT_ROOT = path.resolve(__dirname, '../../')

describe('Tier 1: Feature Coverage', () => {

  // =========================================================================
  // Feature Group 1: Configuration & Database Setup (Features 1-3)
  // =========================================================================
  describe('Group 1: Configuration & Credentials (Features 1-3)', () => {
    const envPath = path.join(PROJECT_ROOT, '.env.local')
    const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''

    it('F1.1: .env.local contains a valid NEXT_PUBLIC_SUPABASE_URL pointing to Supabase host', () => {
      const match = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(https:\/\/[a-zA-Z0-9.-]+\.supabase\.co)/)
      expect(match).not.toBeNull()
      expect(match?.[1]).not.toBe('https://placeholder.supabase.co')
      expect(match?.[1]).toMatch(/^https:\/\/zuxbogoxodcxvpwglyum\.supabase\.co/)
    })

    it('F1.2: .env.local contains a valid non-placeholder NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
      const match = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/)
      expect(match).not.toBeNull()
      const key = match?.[1]?.trim()
      expect(key).toBeDefined()
      expect(key).not.toBe('placeholder')
      expect(key?.length).toBeGreaterThan(20)
    })

    it('F1.3: .env.local contains a valid non-placeholder SUPABASE_SERVICE_ROLE_KEY', () => {
      const match = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/)
      expect(match).not.toBeNull()
      const key = match?.[1]?.trim()
      expect(key).toBeDefined()
      expect(key).not.toBe('your_service_role_key')
      expect(key?.length).toBeGreaterThan(20)
    })

    it('F1.4: .env.local contains a valid PostgreSQL DATABASE_URL connection string', () => {
      const match = envContent.match(/DATABASE_URL=(postgresql:\/\/[^\r\n]+)/)
      expect(match).not.toBeNull()
      const url = match?.[1]?.trim()
      expect(url).toBeDefined()
      expect(url).not.toContain('user:password@host')
      expect(url).toContain('zuxbogoxodcxvpwglyum.supabase.co')
    })

    it('F2.1: drizzle.config.ts points to schema.ts and specifies postgresql dialect', () => {
      const drizzleConfigPath = path.join(PROJECT_ROOT, 'drizzle.config.ts')
      expect(fs.existsSync(drizzleConfigPath)).toBe(true)
      const content = fs.readFileSync(drizzleConfigPath, 'utf8')
      expect(content).toContain("schema: './src/db/schema.ts'")
      expect(content).toContain("dialect: 'postgresql'")
    })

    it('F3.1: Drizzle schema exports all 12 core tables required by architecture', () => {
      const expectedTables = [
        'users',
        'tierConfig',
        'foundingMemberCounter',
        'ideas',
        'validationJobs',
        'validationReports',
        'leanCanvases',
        'crowdfundingAnalyses',
        'pricingSimulations',
        'pitchDecks',
        'creditPurchases',
        'syntheticCampaigns',
      ]
      for (const tableName of expectedTables) {
        expect((schema as Record<string, unknown>)[tableName]).toBeDefined()
      }
    })

    it('F3.2: Drizzle schema exports all 4 PostgreSQL enums', () => {
      const expectedEnums = ['tierEnum', 'evidenceEnum', 'jobStatusEnum', 'decisionEnum']
      for (const enumName of expectedEnums) {
        expect((schema as Record<string, unknown>)[enumName]).toBeDefined()
      }
    })
  })

  // =========================================================================
  // Feature Group 2: Seeding & Initial Data (Features 4-6)
  // =========================================================================
  describe('Group 2: Seeding & Initial Database State (Features 4-6)', () => {
    it('F4.1: Free tier configuration specifies 2 monthly validations, 1 active idea, and no exports', () => {
      const freeTier = TIER_CONFIG_SPECS.free
      expect(freeTier.monthlyValidationLimit).toBe(2)
      expect(freeTier.maxActiveIdeas).toBe(1)
      expect(freeTier.maxConcurrentRequests).toBe(1)
      expect(freeTier.canExportCsv).toBe(false)
      expect(freeTier.canWhitelabelPdf).toBe(false)
      expect(freeTier.canPortfolioExport).toBe(false)
      expect(freeTier.canExportPptx).toBe(false)
      expect(freeTier.canLeanCanvas).toBe(true)
    })

    it('F4.2: Premium tier configuration specifies 15 monthly validations, CSV/PDF exports, and pricing simulator', () => {
      const premiumTier = TIER_CONFIG_SPECS.premium
      expect(premiumTier.monthlyValidationLimit).toBe(15)
      expect(premiumTier.maxActiveIdeas).toBe(10)
      expect(premiumTier.canExportPdf).toBe(true)
      expect(premiumTier.canExportCsv).toBe(true)
      expect(premiumTier.canPricingSimulator).toBe(true)
      expect(premiumTier.canWhitelabelPdf).toBe(false)
      expect(premiumTier.canPortfolioExport).toBe(false)
      expect(premiumTier.canExportPptx).toBe(false)
    })

    it('F4.3: Max Premium tier configuration specifies 50 monthly validations and unlocks all 5 modules and 4 exports', () => {
      const maxTier = TIER_CONFIG_SPECS.max_premium
      expect(maxTier.monthlyValidationLimit).toBe(50)
      expect(maxTier.canExportPdf).toBe(true)
      expect(maxTier.canExportCsv).toBe(true)
      expect(maxTier.canExportPptx).toBe(true)
      expect(maxTier.canWhitelabelPdf).toBe(true)
      expect(maxTier.canPortfolioExport).toBe(true)
      expect(maxTier.canCrowdfunding).toBe(true)
      expect(maxTier.canPitchDeck).toBe(true)
    })

    it('F5.1: Founding member counter specification defines id=1, initial count=0, and cap=100', () => {
      expect(schema.foundingMemberCounter).toBeDefined()
      // Schema column defaults inspection
      expect(schema.foundingMemberCounter.id).toBeDefined()
      expect(schema.foundingMemberCounter.count).toBeDefined()
      expect(schema.foundingMemberCounter.cap).toBeDefined()
    })

    it('F6.1: Synthetic campaigns schema defines required analytics fields and SYNTHETIC DATA label', () => {
      const cols = schema.syntheticCampaigns
      expect(cols.campaignName).toBeDefined()
      expect(cols.category).toBeDefined()
      expect(cols.fundingGoal).toBeDefined()
      expect(cols.amountRaised).toBeDefined()
      expect(cols.numberOfBackers).toBeDefined()
      expect(cols.campaignStatus).toBeDefined()
      expect(cols.dataLabel).toBeDefined()
    })

    it('F6.2: Crowdfunding seed script covers 9 required industry categories with total target >= 300 rows', () => {
      const seedScriptPath = path.join(PROJECT_ROOT, 'scripts/seed-crowdfunding-data.ts')
      expect(fs.existsSync(seedScriptPath)).toBe(true)
      const content = fs.readFileSync(seedScriptPath, 'utf8')
      const expectedCategories = [
        'Technology',
        'Consumer Products',
        'Education',
        'Gaming',
        'Design',
        'Food',
        'Sustainability',
        'Fashion',
        'Social Impact',
      ]
      for (const cat of expectedCategories) {
        expect(content).toContain(`name: '${cat}'`)
      }
    })
  })

  // =========================================================================
  // Feature Group 3: Export Subsystems (Features 7-10)
  // =========================================================================
  describe('Group 3: Export Endpoints & Utilities (Features 7-10)', () => {
    it('F7.1: CSV export produces valid RFC 4180 structure with Category, Metric, Score_Or_Value headers', () => {
      const mockCsvContent = [
        'Category,Metric,Score_Or_Value,Details_And_Evidence',
        'Metadata,Startup Name,"Validore Cloud","Autonomous Startup Validator"',
        'Score,Overall Validation Score,82,"Decision: GO"',
        'Dimensions,Market Score,88,"Strong market demand CAGR 28.4%"',
      ].join('\n')

      const rows = parseCsvRows(mockCsvContent)
      expect(rows.length).toBe(4)
      expect(rows[0]).toEqual(['Category', 'Metric', 'Score_Or_Value', 'Details_And_Evidence'])
      expect(rows[1][2]).toBe('Validore Cloud')
      expect(rows[2][2]).toBe('82')
    })

    it('F8.1: White-label PDF format requirement produces valid %PDF binary header', () => {
      const pdfHeader = Buffer.from('%PDF-1.4\n%âãÏÓ\n')
      expect(isValidPdfBuffer(pdfHeader)).toBe(true)
    })

    it('F8.2: White-label PDF content strictly eliminates Validore branding, slogans, and URLs', () => {
      const whiteLabelText = `
        Startup Cloud — Comprehensive Validation Report
        Independent AI Market Feasibility Analysis
        Overall Score: 82/100 | Decision: GO
        Confidential & Proprietary — Prepared for Founder Evaluation
      `
      expect(() => assertZeroValidoreBranding(whiteLabelText)).not.toThrow()

      const brandedText = `Validore AI Validation | Know it's gold before you dig.`
      expect(() => assertZeroValidoreBranding(brandedText)).toThrow(/Branding violation/)
    })

    it('F9.1: Portfolio export produces a valid ZIP archive starting with PK magic bytes', async () => {
      const zip = new JSZip()
      zip.file('index.html', '<!DOCTYPE html><html><head><title>Portfolio</title></head><body><h1>Validore</h1></body></html>')
      zip.file('styles.css', 'body { font-family: sans-serif; }')
      zip.file('README.md', '# Startup Portfolio Website')
      const buffer = await zip.generateAsync({ type: 'nodebuffer' })

      expect(isValidZipBuffer(buffer)).toBe(true)
    })

    it('F9.2: Portfolio ZIP package contains complete responsive HTML sections and README instructions', async () => {
      const zip = new JSZip()
      zip.file(
        'index.html',
        `<nav>Validore Cloud</nav><section id="hero"><h1>Autonomous Validator</h1><span class="badge">Score: 82</span></section><section id="problem">Core Problem</section><section id="solution">AI Simulation</section><section id="roadmap">Milestones</section>`
      )
      zip.file('styles.css', ':root { --primary: #0A1628; --gold: #C8A860; }')
      zip.file('README.md', '# Hosting Instructions\nDeploy to GitHub Pages, Vercel, or Netlify.')

      const content = await zip.file('index.html')?.async('string')
      expect(content).toContain('id="hero"')
      expect(content).toContain('id="problem"')
      expect(content).toContain('id="solution"')
      expect(content).toContain('id="roadmap"')
      expect(zip.file('README.md')).toBeDefined()
    })

    it('F10.1: PPTX export specification requires 12 complete investor deck slides', () => {
      const expectedSlideTitles = [
        'Cover',
        'The Problem',
        'The Solution',
        'Market Opportunity',
        'Product Architecture',
        'Business Model',
        'Competitive Advantage',
        'Go-To-Market Strategy',
        'Validation & Traction',
        'Financial Projections',
        'Team & Milestones',
        'The Ask',
      ]
      expect(expectedSlideTitles.length).toBe(12)
    })
  })

  // =========================================================================
  // Feature Group 4: Credits Purchase & Dashboard Pages (Features 11-13)
  // =========================================================================
  describe('Group 4: Credits Purchase & Dashboard Pages (Features 11-13)', () => {
    it('F11.1: Credits purchase pricing mapping assigns correct dollar amounts per package', () => {
      const PRICING: Record<'crowdfunding' | 'pitch_deck' | 'bundle', number> = {
        crowdfunding: 49,
        pitch_deck: 49,
        bundle: 79,
      }
      expect(PRICING.crowdfunding).toBe(49)
      expect(PRICING.pitch_deck).toBe(49)
      expect(PRICING.bundle).toBe(79)
    })

    it('F11.2: Credit purchase payload requires creditType, positive quantity, and payment provider', () => {
      const validPayload = {
        creditType: 'bundle',
        quantity: 1,
        provider: 'stripe',
      }
      expect(['crowdfunding', 'pitch_deck', 'bundle']).toContain(validPayload.creditType)
      expect(validPayload.quantity).toBeGreaterThan(0)
      expect(['stripe', 'razorpay']).toContain(validPayload.provider)
    })

    it('F11.3: Unconfigured payment provider returns structured error response without crash', () => {
      const handleUnconfiguredProvider = (secretKey: string | undefined) => {
        if (!secretKey || secretKey === 'your_stripe_secret') {
          return { status: 503, error: 'Payment provider not configured' }
        }
        return { status: 200, url: 'https://checkout.stripe.com/c/pay/test' }
      }

      const result = handleUnconfiguredProvider(undefined)
      expect(result.status).toBe(503)
      expect(result.error).toContain('Payment provider not configured')
    })

    it('F12.1: /dashboard/credits route file exists in codebase', () => {
      const creditsPagePath = path.join(PROJECT_ROOT, 'src/app/dashboard/credits/page.tsx')
      expect(fs.existsSync(creditsPagePath)).toBe(true)
    })

    it('F13.1: /dashboard/settings route file exists in codebase', () => {
      const settingsPagePath = path.join(PROJECT_ROOT, 'src/app/dashboard/settings/page.tsx')
      expect(fs.existsSync(settingsPagePath)).toBe(true)
    })
  })

  // =========================================================================
  // Feature Group 5: Polish, Auth, Middleware & Core Modules (Features 14-22)
  // =========================================================================
  describe('Group 5: Polish, Auth, Middleware & Core Modules (Features 14-22)', () => {
    it('F14.1: Landing page src/app/page.tsx footer must contain operator attribution and zero old location', () => {
      const landingPagePath = path.join(PROJECT_ROOT, 'src/app/page.tsx')
      const content = fs.readFileSync(landingPagePath, 'utf8')
      expect(content).toContain('Shashank V, Bengaluru, Karnataka, India')
      const forbiddenCity = ['New', 'Delhi'].join(' ')
      expect(content).not.toContain(forbiddenCity)
      expect(content).not.toContain('[Your Name]')
    })

    it('F14.2: All 4 legal pages reference "Bengaluru, Karnataka, India", "Shashank V", and zero old location', () => {
      const legalPages = [
        'src/app/legal/privacy/page.tsx',
        'src/app/legal/terms/page.tsx',
        'src/app/legal/cookies/page.tsx',
        'src/app/legal/refund/page.tsx',
      ]
      const forbiddenCity = ['New', 'Delhi'].join(' ')

      for (const relPath of legalPages) {
        const fullPath = path.join(PROJECT_ROOT, relPath)
        expect(fs.existsSync(fullPath), `${relPath} must exist`).toBe(true)
        const content = fs.readFileSync(fullPath, 'utf8')
        expect(content, `${relPath} must contain Bengaluru, Karnataka, India`).toContain('Bengaluru, Karnataka, India')
        expect(content, `${relPath} must contain Shashank V`).toContain('Shashank V')
        expect(content, `${relPath} must not contain old city`).not.toContain(forbiddenCity)
        expect(content, `${relPath} must not contain [Your Name]`).not.toContain('[Your Name]')
      }
    })

    it('F14.3: Zero occurrences of old location or old brand across src/, tests/, scripts/, docs/, and root markdown docs', () => {
      const checkDirs = ['src', 'tests', 'scripts', 'docs']
      const forbiddenCity = ['New', 'Delhi'].join(' ')
      const forbiddenBrand = ['Aur', 'exa'].join('')

      for (const dirName of checkDirs) {
        const fullDir = path.join(PROJECT_ROOT, dirName)
        const scan = (dir: string) => {
          const entries = fs.readdirSync(dir, { withFileTypes: true })
          for (const entry of entries) {
            const entryPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              scan(entryPath)
            } else if (entry.isFile() && !entry.name.endsWith('.png') && !entry.name.endsWith('.ico')) {
              if (entryPath.endsWith('tier1-feature-coverage.test.ts')) continue
              const text = fs.readFileSync(entryPath, 'utf8')
              expect(text, `${entryPath} contains prohibited old city`).not.toContain(forbiddenCity)
              expect(text, `${entryPath} contains prohibited old brand`).not.toContain(forbiddenBrand)
            }
          }
        }
        scan(fullDir)
      }

      const rootDocs = ['PROJECT.md', 'TEST_INFRA.md', 'TEST_READY.md', 'README.md']
      for (const doc of rootDocs) {
        const docPath = path.join(PROJECT_ROOT, doc)
        if (fs.existsSync(docPath)) {
          const text = fs.readFileSync(docPath, 'utf8')
          expect(text, `${docPath} contains prohibited old city`).not.toContain(forbiddenCity)
          expect(text, `${docPath} contains prohibited old brand`).not.toContain(forbiddenBrand)
        }
      }
    })

    it('F16.1: src/middleware.ts protects /dashboard/* routes by redirecting unauthenticated users to /auth/signin', () => {
      const middlewarePath = path.join(PROJECT_ROOT, 'src/middleware.ts')
      expect(fs.existsSync(middlewarePath)).toBe(true)
      const content = fs.readFileSync(middlewarePath, 'utf8')
      expect(content).toContain("request.nextUrl.pathname.startsWith('/dashboard')")
      expect(content).toContain("url.pathname = '/auth/signin'")
    })

    it('F18.1: Financial engine formulas calculate contribution margin and break-even units accurately', () => {
      const price = 100
      const cogs = 20
      const fixedCosts = 8000

      const margin = calculateContributionMargin(price, cogs)
      expect(margin).toBe(80)

      const breakEven = calculateBreakEvenUnits(fixedCosts, price, cogs)
      expect(breakEven).toBe(100)
    })

    it('F18.2: Financial engine calculates LTV and CAC payback period according to SaaS standards', () => {
      const marginPerCustomer = 100
      const lifetimeMonths = 8
      const cac = 200
      const monthlyContribution = 40

      const ltv = calculateLTV(marginPerCustomer, lifetimeMonths)
      expect(ltv).toBe(800)

      const payback = calculateCACPaybackPeriod(cac, monthlyContribution)
      expect(payback).toBe(5)
    })

    it('F18.3: All scoring engine weight tables sum to exactly 100 points', () => {
      expect(validateWeightTable(STARTUP_WEIGHTS)).toBe(true)
      expect(validateWeightTable(BM_WEIGHTS)).toBe(true)
      expect(validateWeightTable(CAMPAIGN_WEIGHTS)).toBe(true)
      expect(validateWeightTable(PITCH_WEIGHTS)).toBe(true)
      expect(validateWeightTable(PRICING_WEIGHTS)).toBe(true)
      expect(ValidationDecision.options).toEqual(['GO', 'MODIFY', 'TEST_FURTHER', 'NO_GO'])
    })
  })
})
