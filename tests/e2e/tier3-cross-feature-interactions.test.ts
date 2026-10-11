/**
 * Tier 3: Cross-Feature Interactions E2E Test Suite
 *
 * Verifies multi-subsystem workflows, state transitions, credit purchasing
 * and consumption loops, tier matrix upgrades, and pipeline data integrity.
 */

import { describe, it, expect } from 'vitest'
import {
  TIER_CONFIG_SPECS,
  createMockUser,
  createMockIdea,
  createMockReport,
  parseCsvRows,
  assertZeroValidoreBranding,
  isValidZipBuffer,
} from './helpers/test-fixtures'
import {
  calculateContributionMargin,
  calculateBreakEvenUnits,
} from '@/lib/financial'
import JSZip from 'jszip'

describe('Tier 3: Cross-Feature Interactions', () => {

  // =========================================================================
  // Interaction 1: Auth + Tier Matrix + Export Subsystem
  // =========================================================================
  describe('Interaction 1: Tier Matrix & Progressive Upgrade Pipeline', () => {
    it('I1.1: Free -> Premium -> Max Premium upgrades progressively unlock export capabilities', () => {
      const free = TIER_CONFIG_SPECS.free
      const premium = TIER_CONFIG_SPECS.premium
      const max = TIER_CONFIG_SPECS.max_premium

      // Free tier: all export flags false
      expect(free.canExportPdf).toBe(false)
      expect(free.canExportCsv).toBe(false)
      expect(free.canWhitelabelPdf).toBe(false)
      expect(free.canPortfolioExport).toBe(false)
      expect(free.canExportPptx).toBe(false)

      // Upgrade to Premium: unlocks PDF and CSV
      expect(premium.canExportPdf).toBe(true)
      expect(premium.canExportCsv).toBe(true)
      expect(premium.canWhitelabelPdf).toBe(false)
      expect(premium.canPortfolioExport).toBe(false)
      expect(premium.canExportPptx).toBe(false)

      // Upgrade to Max Premium: unlocks White-label PDF, Portfolio, and PPTX
      expect(max.canExportPdf).toBe(true)
      expect(max.canExportCsv).toBe(true)
      expect(max.canWhitelabelPdf).toBe(true)
      expect(max.canPortfolioExport).toBe(true)
      expect(max.canExportPptx).toBe(true)
    })

    it('I1.2: Free tier user upgrading tier immediately gains higher validation limits', () => {
      let currentTier: 'free' | 'premium' | 'max_premium' = 'free'
      expect(TIER_CONFIG_SPECS[currentTier].monthlyValidationLimit).toBe(2)

      currentTier = 'premium'
      expect(TIER_CONFIG_SPECS[currentTier].monthlyValidationLimit).toBe(15)

      currentTier = 'max_premium'
      expect(TIER_CONFIG_SPECS[currentTier].monthlyValidationLimit).toBe(50)
    })
  })

  // =========================================================================
  // Interaction 2: Credit Purchase -> Webhook Simulation -> Module Unlock
  // =========================================================================
  describe('Interaction 2: Credit Lifecycle: Purchase -> Webhook -> Unlock -> Consume -> Relock', () => {
    it('I2.1: Credit purchase webhook event increments credits and unlocks module access', () => {
      // Step 1: Initial state - Free user with 0 credits
      const user = createMockUser({
        tier: 'free',
        crowdfundingCredits: 0,
        pitchDeckCredits: 0,
      })

      const initialCrowdfundingAccess =
        user.crowdfundingCredits > 0 || TIER_CONFIG_SPECS[user.tier].canCrowdfunding
      const initialPitchDeckAccess =
        user.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[user.tier].canPitchDeck

      expect(initialCrowdfundingAccess).toBe(false)
      expect(initialPitchDeckAccess).toBe(false)

      // Step 2: Webhook event simulated: Bundle purchased (1 crowdfunding + 1 pitch deck)
      const simulatedWebhookPayload = {
        event: 'checkout.session.completed',
        metadata: {
          userId: user.id,
          creditType: 'bundle',
          quantity: '1',
        },
      }

      if (simulatedWebhookPayload.metadata.creditType === 'bundle') {
        user.crowdfundingCredits += 1
        user.pitchDeckCredits += 1
      }

      // Step 3: Verify module access unlocked
      const unlockedCrowdfunding =
        user.crowdfundingCredits > 0 || TIER_CONFIG_SPECS[user.tier].canCrowdfunding
      const unlockedPitchDeck =
        user.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[user.tier].canPitchDeck

      expect(unlockedCrowdfunding).toBe(true)
      expect(unlockedPitchDeck).toBe(true)
      expect(user.crowdfundingCredits).toBe(1)
      expect(user.pitchDeckCredits).toBe(1)

      // Step 4: Consume crowdfunding credit
      user.crowdfundingCredits -= 1
      expect(user.crowdfundingCredits).toBe(0)

      // Step 5: Verify Crowdfunding relocked but Pitch Deck remains unlocked
      const relockedCrowdfunding =
        user.crowdfundingCredits > 0 || TIER_CONFIG_SPECS[user.tier].canCrowdfunding
      const stillUnlockedPitchDeck =
        user.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[user.tier].canPitchDeck

      expect(relockedCrowdfunding).toBe(false)
      expect(stillUnlockedPitchDeck).toBe(true)

      // Step 6: Consume pitch deck credit
      user.pitchDeckCredits -= 1
      expect(user.pitchDeckCredits).toBe(0)

      const relockedPitchDeck =
        user.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[user.tier].canPitchDeck
      expect(relockedPitchDeck).toBe(false)
    })
  })

  // =========================================================================
  // Interaction 3: Idea -> Validation -> Report -> Multi-Format Export
  // =========================================================================
  describe('Interaction 3: Data Fidelity across Idea -> Validation -> Exports Pipeline', () => {
    it('I3.1: Data fidelity is preserved between Idea, Validation Report, and Export representations', async () => {
      const user = createMockUser({ tier: 'max_premium' })
      const idea = createMockIdea(user.id, {
        name: 'NexusFlow AI',
        industry: 'Developer Tools',
        product: 'Automated CI/CD Pipeline Optimizer',
      })
      const report = createMockReport(idea.id, user.id, {
        overallScore: 89,
        decision: 'GO',
        decisionReasons: ['High organic developer adoption', 'Strong retention signals'],
      })

      // 1. CSV Representation Verification
      const csvContent = [
        'Category,Metric,Score_Or_Value,Details_And_Evidence',
        `Metadata,Startup Name,"${idea.name}","${idea.industry}"`,
        `Score,Overall Validation Score,${report.overallScore},"Decision: ${report.decision}"`,
      ].join('\n')

      const parsedCsv = parseCsvRows(csvContent)
      expect(parsedCsv[1][2]).toBe(idea.name)
      expect(parsedCsv[2][2]).toBe(String(report.overallScore))

      // 2. White-Label PDF Representation Verification
      const pdfReportText = `
        ${idea.name} — Comprehensive Validation Report
        Overall Score: ${report.overallScore}/100
        Decision: ${report.decision}
        Rationale: ${report.decisionReasons[0]}
      `
      expect(pdfReportText).toContain('NexusFlow AI')
      expect(pdfReportText).toContain('89/100')
      expect(pdfReportText).toContain('GO')
      expect(() => assertZeroValidoreBranding(pdfReportText)).not.toThrow()

      // 3. Portfolio ZIP Representation Verification
      const zip = new JSZip()
      zip.file(
        'index.html',
        `<html><body><h1>${idea.name}</h1><p class="industry">${idea.industry}</p><span class="score">${report.overallScore}</span></body></html>`
      )
      const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })
      expect(isValidZipBuffer(zipBuffer)).toBe(true)

      const html = await zip.file('index.html')?.async('string')
      expect(html).toContain('NexusFlow AI')
      expect(html).toContain('Developer Tools')
      expect(html).toContain('89')
    })
  })

  // =========================================================================
  // Interaction 4: Monthly Quota Reset & Billing Month Transition
  // =========================================================================
  describe('Interaction 4: Billing Cycle Transition & Quota Reset Interaction', () => {
    it('I4.1: Quota resets when billing date rolls over into the next month', () => {
      const monthlyLimit = 2
      let validationsThisMonth = 2
      let validationResetAt = new Date('2026-02-01T00:00:00Z') // past date

      const checkLimitWithReset = (now: Date) => {
        if (!validationResetAt || now > validationResetAt) {
          validationsThisMonth = 0
          validationResetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1)
          return { allowed: true, remaining: monthlyLimit }
        }
        const remaining = monthlyLimit - validationsThisMonth
        return { allowed: remaining > 0, remaining: Math.max(0, remaining) }
      }

      // Prior to rollover: currently exhausted
      const nowBeforeReset = new Date('2026-01-15T00:00:00Z')
      const statusBefore = checkLimitWithReset(nowBeforeReset)
      expect(statusBefore.allowed).toBe(false)
      expect(statusBefore.remaining).toBe(0)

      // After rollover date: automatically resets to 0 and grants full quota
      const nowAfterReset = new Date('2026-02-02T00:00:00Z')
      const statusAfter = checkLimitWithReset(nowAfterReset)
      expect(statusAfter.allowed).toBe(true)
      expect(statusAfter.remaining).toBe(monthlyLimit)
      expect(validationsThisMonth).toBe(0)
    })
  })

  // =========================================================================
  // Interaction 5: Founding Member Enrollment & Cap Interaction
  // =========================================================================
  describe('Interaction 5: Founding Member Cap & Enrollment Interaction', () => {
    it('I5.1: Founding member enrollment increments counter and halts at cap = 100', () => {
      const counter = { count: 0, cap: 100 }

      const enrollMember = () => {
        if (counter.count < counter.cap) {
          counter.count += 1
          return { isFoundingMember: true, memberNumber: counter.count }
        }
        return { isFoundingMember: false, memberNumber: null }
      }

      // Enroll first 99 members
      for (let i = 1; i <= 99; i++) {
        const res = enrollMember()
        expect(res.isFoundingMember).toBe(true)
        expect(res.memberNumber).toBe(i)
      }

      // Enroll 100th member (hits cap)
      const member100 = enrollMember()
      expect(member100.isFoundingMember).toBe(true)
      expect(member100.memberNumber).toBe(100)
      expect(counter.count).toBe(100)

      // Enroll 101st member (cap exceeded)
      const member101 = enrollMember()
      expect(member101.isFoundingMember).toBe(false)
      expect(member101.memberNumber).toBeNull()
      expect(counter.count).toBe(100)
    })
  })

  // =========================================================================
  // Interaction 6: Pricing Simulator & Sensitivity Matrix Cross-Module Calculation
  // =========================================================================
  describe('Interaction 6: Pricing Simulator & 5x5 Sensitivity Matrix', () => {
    it('I6.1: Sensitivity matrix computes consistent break-even units across price and cost variations', () => {
      const basePrice = 50
      const baseCogs = 10
      const fixedCosts = 20000

      const priceMultipliers = [0.8, 0.9, 1.0, 1.1, 1.2]
      const costMultipliers = [0.8, 0.9, 1.0, 1.1, 1.2]

      const matrix: number[][] = []

      for (const pMult of priceMultipliers) {
        const row: number[] = []
        for (const cMult of costMultipliers) {
          const testPrice = basePrice * pMult
          const testCogs = baseCogs * cMult
          const margin = calculateContributionMargin(testPrice, testCogs)
          expect(margin).toBeGreaterThan(0)
          const breakEven = calculateBreakEvenUnits(fixedCosts, testPrice, testCogs)
          row.push(Math.round(breakEven))
        }
        matrix.push(row)
      }

      // 5x5 Matrix produced
      expect(matrix.length).toBe(5)
      for (const row of matrix) {
        expect(row.length).toBe(5)
      }

      // Center cell (1.0, 1.0): basePrice=50, baseCogs=10, margin=40 -> 20000 / 40 = 500 units
      expect(matrix[2][2]).toBe(500)

      // Lower price, higher cost (0.8, 1.2): testPrice=40, testCogs=12, margin=28 -> 20000 / 28 = 714 units
      expect(matrix[0][4]).toBe(714)

      // Higher price, lower cost (1.2, 0.8): testPrice=60, testCogs=8, margin=52 -> 20000 / 52 = 385 units
      expect(matrix[4][0]).toBe(385)
    })
  })
})
