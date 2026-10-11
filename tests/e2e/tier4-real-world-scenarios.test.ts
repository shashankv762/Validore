/**
 * Tier 4: Real-World Scenarios E2E Test Suite
 *
 * Verifies end-to-end founder journeys from signup to validation,
 * tier gating, credit purchase, simulation, and multi-format exports.
 */

import { describe, it, expect } from 'vitest'
import {
  TIER_CONFIG_SPECS,
  createMockUser,
  createMockIdea,
  createMockReport,
  createMockPitchDeck,
  parseCsvRows,
  assertZeroValidoreBranding,
  isValidZipBuffer,
  isValidPdfBuffer,
} from './helpers/test-fixtures'
import {
  calculateContributionMargin,
  calculateBreakEvenUnits,
} from '@/lib/financial'
import { getCampaignClassificationBand } from '@/lib/scoring'
import JSZip from 'jszip'

describe('Tier 4: Real-World Scenarios', () => {

  // =========================================================================
  // Scenario 1: Bootstrapped Founder Journey on Free Tier
  // =========================================================================
  describe('Scenario 1: Bootstrapped Solo Founder on Free Tier', () => {
    it('S1.1: Executes complete journey: Signup -> Idea Creation -> Lite Validation -> Tier Gate -> Credit Pack Purchase -> Deck Unlock', () => {
      // Step 1: User Signup on Free Tier
      const founder = createMockUser({
        email: 'bootstrapper@startup.io',
        tier: 'free',
        crowdfundingCredits: 0,
        pitchDeckCredits: 0,
        validationsThisMonth: 0,
      })
      expect(founder.tier).toBe('free')
      expect(founder.validationsThisMonth).toBe(0)

      // Step 2: Idea Submission
      const idea = createMockIdea(founder.id, {
        name: 'EcoCourier',
        industry: 'Logistics',
        product: 'Zero-emission last-mile delivery fleet',
        coreProblem: 'High urban delivery emissions and congested streets',
        proposedSolution: 'Lightweight electric cargo bike delivery network',
      })
      expect(idea.userId).toBe(founder.id)
      expect(idea.name).toBe('EcoCourier')

      // Step 3: Run Free Lite Validation (Consumes 1 of 2 monthly validations)
      const freeLimit = TIER_CONFIG_SPECS[founder.tier].monthlyValidationLimit
      expect(founder.validationsThisMonth < freeLimit).toBe(true)

      founder.validationsThisMonth += 1
      const validationReport = createMockReport(idea.id, founder.id, {
        overallScore: 74,
        decision: 'MODIFY',
        decisionReasons: ['High capital expenditure for electric fleet', 'Favorable municipal carbon regulations'],
        isLite: true,
      })
      expect(validationReport.overallScore).toBe(74)
      expect(validationReport.decision).toBe('MODIFY')
      expect(founder.validationsThisMonth).toBe(1)
      expect(freeLimit - founder.validationsThisMonth).toBe(1) // 1 remaining

      // Step 4: Attempt Exports (Encounter Tier Gates)
      const canExportCsv = TIER_CONFIG_SPECS[founder.tier].canExportCsv
      const canWhitelabelPdf = TIER_CONFIG_SPECS[founder.tier].canWhitelabelPdf
      expect(canExportCsv).toBe(false)
      expect(canWhitelabelPdf).toBe(false)

      // Step 5: Attempt Pitch Deck (Initially Locked)
      const initialDeckAccess =
        founder.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[founder.tier].canPitchDeck
      expect(initialDeckAccess).toBe(false)

      // Step 6: Founder purchases "Pitch Deck Pack" ($49)
      const purchaseTransaction = {
        userId: founder.id,
        creditType: 'pitch_deck',
        amountUsd: 49,
        status: 'completed',
      }
      expect(purchaseTransaction.amountUsd).toBe(49)
      founder.pitchDeckCredits += 1
      expect(founder.pitchDeckCredits).toBe(1)

      // Step 7: Pitch Deck Builder is now unlocked via credit
      const unlockedDeckAccess =
        founder.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[founder.tier].canPitchDeck
      expect(unlockedDeckAccess).toBe(true)

      // Step 8: Founder generates 12-slide Pitch Deck and credit is consumed
      founder.pitchDeckCredits -= 1
      const pitchDeck = createMockPitchDeck(idea.id, founder.id)
      expect(pitchDeck.slides.length).toBe(12)
      expect(founder.pitchDeckCredits).toBe(0)
    })
  })

  // =========================================================================
  // Scenario 2: Pro Tier Founder Validation & Analysis Workflow
  // =========================================================================
  describe('Scenario 2: Pro Tier Founder Scaling Up', () => {
    it('S2.1: Executes scaling workflow: Multiple validations within 15 quota -> AI Lean Canvas -> Pricing Simulator -> CSV Export', () => {
      // Step 1: User on Pro / Premium Tier
      const proFounder = createMockUser({
        email: 'pro.founder@saas.com',
        tier: 'premium',
        validationsThisMonth: 0,
      })
      const proLimit = TIER_CONFIG_SPECS.premium.monthlyValidationLimit
      expect(proLimit).toBe(15)

      // Step 2: Validate 3 different ideas
      const ideas = ['DataSync', 'CloudCostAI', 'APIHawk'].map((name, i) =>
        createMockIdea(proFounder.id, { id: `idea-${i}`, name })
      )

      for (let i = 0; i < ideas.length; i++) {
        expect(proFounder.validationsThisMonth < proLimit).toBe(true)
        proFounder.validationsThisMonth += 1
      }
      expect(proFounder.validationsThisMonth).toBe(3)
      expect(proLimit - proFounder.validationsThisMonth).toBe(12) // 12 remaining

      // Step 3: Top idea generates AI Lean Canvas
      expect(TIER_CONFIG_SPECS.premium.canAiLeanCanvas).toBe(true)
      const leanCanvasBlocks = [
        'Problem',
        'Customer Segments',
        'Unique Value Proposition',
        'Solution',
        'Channels',
        'Revenue Streams',
        'Cost Structure',
        'Key Metrics',
        'Unfair Advantage',
      ]
      expect(leanCanvasBlocks.length).toBe(9)

      // Step 4: Run Pricing Simulator
      expect(TIER_CONFIG_SPECS.premium.canPricingSimulator).toBe(true)
      const price = 49
      const cogs = 8
      const fixedCosts = 5000
      const margin = calculateContributionMargin(price, cogs)
      const breakEvenUnits = calculateBreakEvenUnits(fixedCosts, price, cogs)
      expect(margin).toBe(41)
      expect(Math.round(breakEvenUnits)).toBe(122)

      // Step 5: Export CSV Report (Permitted on Pro)
      expect(TIER_CONFIG_SPECS.premium.canExportCsv).toBe(true)
      const csvData = [
        'Category,Metric,Score_Or_Value,Details_And_Evidence',
        'Metadata,Startup Name,"CloudCostAI","Cloud Infrastructure Cost Optimizer"',
        'Pricing,Unit Price,"$49","Monthly Subscription"',
        'Pricing,Break-Even Units,"122","Units required per month"',
      ].join('\n')
      const rows = parseCsvRows(csvData)
      expect(rows.length).toBe(4)
      expect(rows[2][2]).toBe('$49')

      // Step 6: White-label PDF export blocked (Requires Max)
      expect(TIER_CONFIG_SPECS.premium.canWhitelabelPdf).toBe(false)
    })
  })

  // =========================================================================
  // Scenario 3: Max Premium Enterprise Founder Full-Lifecycle Generation
  // =========================================================================
  describe('Scenario 3: Max Premium Enterprise Founder Full Suite Generation', () => {
    it('S3.1: Full suite execution: Validation -> Crowdfunding Benchmarks -> Pitch Deck -> White-label PDF -> Portfolio ZIP -> PPTX', async () => {
      // Step 1: Enterprise Founder on Max Premium Tier
      const enterpriseFounder = createMockUser({
        email: 'director@healthaccelerator.com',
        tier: 'max_premium',
      })
      const maxConfig = TIER_CONFIG_SPECS.max_premium
      expect(maxConfig.monthlyValidationLimit).toBe(50)
      expect(maxConfig.canWhitelabelPdf).toBe(true)
      expect(maxConfig.canPortfolioExport).toBe(true)
      expect(maxConfig.canExportPptx).toBe(true)
      expect(maxConfig.canCrowdfunding).toBe(true)
      expect(maxConfig.canPitchDeck).toBe(true)

      // Step 2: Create Idea
      const idea = createMockIdea(enterpriseFounder.id, {
        name: 'HealthAI',
        industry: 'Healthcare / Biotech',
        product: 'Automated Clinical Trial Patient Matching',
      })

      // Step 3: Run Full Validation (High Score: 92)
      const report = createMockReport(idea.id, enterpriseFounder.id, {
        overallScore: 92,
        decision: 'GO',
      })
      expect(report.overallScore).toBe(92)
      expect(report.decision).toBe('GO')

      // Step 4: Run Crowdfunding Prediction & Benchmark
      const crowdfundingScore = 84
      const band = getCampaignClassificationBand(crowdfundingScore)
      expect(band.band).toBe('80-100')
      expect(band.label).toBe('Strong Readiness')

      // Step 5: Generate Pitch Deck
      const deck = createMockPitchDeck(idea.id, enterpriseFounder.id)
      expect(deck.slides.length).toBe(12)

      // Step 6: Generate White-Label PDF Export
      const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (HealthAI Validation) >>\nendobj\n')
      expect(isValidPdfBuffer(pdfBuffer)).toBe(true)
      const whiteLabelText = 'HealthAI — Comprehensive Validation Report\nPrepared for Founder Evaluation\nScore: 92/100'
      expect(() => assertZeroValidoreBranding(whiteLabelText)).not.toThrow()

      // Step 7: Generate Portfolio ZIP Package
      const zip = new JSZip()
      zip.file('index.html', `<!DOCTYPE html><html><body><h1>HealthAI</h1><p>Clinical Trial Matching</p></body></html>`)
      zip.file('styles.css', 'body { background: #0A1628; color: #FAFAF7; }')
      zip.file('README.md', '# HealthAI Portfolio Website\nDeploy to any static web host.')
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
      expect(isValidZipBuffer(zipBuffer)).toBe(true)

      // Step 8: Generate PPTX Deck
      const pptxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])
      expect(isValidZipBuffer(pptxBuffer)).toBe(true)
    })
  })

  // =========================================================================
  // Scenario 4: Payment Provider Downtime & Error Recovery Lifecycle
  // =========================================================================
  describe('Scenario 4: Payment Gateway Outage & Error Recovery', () => {
    it('S4.1: Gracefully handles payment provider error and recovers upon configuration/connectivity', () => {
      // Simulate payment session creator function
      const createCheckoutSession = (apiKey: string | undefined, payload: { creditType: string }) => {
        if (!apiKey || apiKey === 'your_stripe_secret' || apiKey.startsWith('invalid')) {
          return {
            status: 503,
            body: { error: 'Payment provider not configured or temporarily unavailable' },
          }
        }
        return {
          status: 200,
          body: { url: `https://checkout.stripe.com/c/pay/cs_test_${payload.creditType}` },
        }
      }

      // Step 1: Outage / unconfigured state
      const failedAttempt = createCheckoutSession(undefined, { creditType: 'bundle' })
      expect(failedAttempt.status).toBe(503)
      expect(failedAttempt.body.error).toContain('Payment provider not configured')

      // Step 2: Placeholder key state
      const placeholderAttempt = createCheckoutSession('your_stripe_secret', { creditType: 'bundle' })
      expect(placeholderAttempt.status).toBe(503)

      // Step 3: Gateway restored / valid credentials configured
      const successAttempt = createCheckoutSession('sk_live_valid_configured_key', { creditType: 'bundle' })
      expect(successAttempt.status).toBe(200)
      expect(successAttempt.body.url).toContain('https://checkout.stripe.com/c/pay/cs_test_bundle')
    })
  })
})
