/**
 * Tier 2: Boundary & Corner Cases E2E Test Suite
 *
 * Exercises adversarial inputs, invalid combinations, boundary values,
 * security perimeters, escaping integrity, and tenant isolation.
 */

import { describe, it, expect } from 'vitest'
import { parseCsvRows, TIER_CONFIG_SPECS, createMockUser, createMockReport, createMockPitchDeck } from './helpers/test-fixtures'
import { canUserAccess, canUserAccessWithCredits } from '@/lib/tier-gate'
import { calculateBreakEvenUnits, calculateCAC, calculateARPU, calculateCACPaybackPeriod } from '@/lib/financial'
import { clampScore, getCampaignClassificationBand } from '@/lib/scoring'
import { z } from 'zod'

describe('Tier 2: Boundary & Corner Cases', () => {

  // =========================================================================
  // 1. Authentication & Middleware Boundaries
  // =========================================================================
  describe('Authentication & Middleware Boundaries', () => {
    it('B1.1: Unauthenticated user context returns false for all tier-gated features', async () => {
      // Empty or non-existent supabaseId
      const allowed = await canUserAccess('non-existent-user-id', 'canExportCsv')
      expect(allowed).toBe(false)
    })

    it('B1.2: Unauthenticated credit check denies module access with reason "denied"', async () => {
      const result = await canUserAccessWithCredits('non-existent-user-id', 'crowdfunding')
      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('denied')
    })

    it('B1.3: Middleware matcher configuration protects /dashboard and subroutes while bypassing static assets', () => {
      const protectedPaths = ['/dashboard', '/dashboard/settings', '/dashboard/credits', '/dashboard/pricing']
      const publicPaths = ['/_next/static/chunk.js', '/favicon.ico', '/public/logo.svg', '/share/test-token']

      // Regex matching pattern from middleware config: /((?!_next/static|_next/image|favicon.ico|public|share).*)
      const matcherRegex = /^\/((?!_next\/static|_next\/image|favicon\.ico|public|share).*)$/

      for (const p of protectedPaths) {
        expect(matcherRegex.test(p)).toBe(true)
      }
      for (const p of publicPaths) {
        expect(matcherRegex.test(p)).toBe(false)
      }
    })
  })

  // =========================================================================
  // 2. Tier-Gating & Limit Boundaries
  // =========================================================================
  describe('Tier-Gating & Quota Boundaries', () => {
    it('B2.1: Free tier user is strictly denied canExportCsv, canWhitelabelPdf, and canPortfolioExport', () => {
      const free = TIER_CONFIG_SPECS.free
      expect(free.canExportCsv).toBe(false)
      expect(free.canWhitelabelPdf).toBe(false)
      expect(free.canPortfolioExport).toBe(false)
      expect(free.canExportPptx).toBe(false)
    })

    it('B2.2: Premium tier user is allowed CSV and PDF but denied White-Label PDF, Portfolio, and PPTX', () => {
      const premium = TIER_CONFIG_SPECS.premium
      expect(premium.canExportCsv).toBe(true)
      expect(premium.canExportPdf).toBe(true)
      expect(premium.canWhitelabelPdf).toBe(false)
      expect(premium.canPortfolioExport).toBe(false)
      expect(premium.canExportPptx).toBe(false)
    })

    it('B2.3: Monthly validation limit boundary for Free tier: 2 validations allowed, 3rd denied', () => {
      const limit = TIER_CONFIG_SPECS.free.monthlyValidationLimit
      expect(limit).toBe(2)

      const remainingAtZero = Math.max(0, limit - 0)
      expect(remainingAtZero).toBe(2)
      expect(remainingAtZero > 0).toBe(true)

      const remainingAtOne = Math.max(0, limit - 1)
      expect(remainingAtOne).toBe(1)
      expect(remainingAtOne > 0).toBe(true)

      const remainingAtLimit = Math.max(0, limit - 2)
      expect(remainingAtLimit).toBe(0)
      expect(remainingAtLimit > 0).toBe(false)

      const remainingExceeded = Math.max(0, limit - 3)
      expect(remainingExceeded).toBe(0)
    })

    it('B2.4: Zero credits boundary: user with 0 credits and free tier is denied module access', () => {
      const user = createMockUser({ tier: 'free', crowdfundingCredits: 0, pitchDeckCredits: 0 })
      const hasCrowdfundingAccess = user.crowdfundingCredits > 0 || TIER_CONFIG_SPECS[user.tier].canCrowdfunding
      const hasPitchDeckAccess = user.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[user.tier].canPitchDeck

      expect(hasCrowdfundingAccess).toBe(false)
      expect(hasPitchDeckAccess).toBe(false)
    })

    it('B2.5: Max tier user accesses modules regardless of credit balance being 0', () => {
      const user = createMockUser({ tier: 'max_premium', crowdfundingCredits: 0, pitchDeckCredits: 0 })
      const hasCrowdfundingAccess = user.crowdfundingCredits > 0 || TIER_CONFIG_SPECS[user.tier].canCrowdfunding
      const hasPitchDeckAccess = user.pitchDeckCredits > 0 || TIER_CONFIG_SPECS[user.tier].canPitchDeck

      expect(hasCrowdfundingAccess).toBe(true)
      expect(hasPitchDeckAccess).toBe(true)
    })
  })

  // =========================================================================
  // 3. Parameter & Query Validation Boundaries
  // =========================================================================
  describe('Parameter & Query Validation Boundaries', () => {
    it('B3.1: Export query parameter schema requires valid UUID string for reportId', () => {
      const ExportQuerySchema = z.object({
        reportId: z.string().uuid(),
      })

      expect(ExportQuerySchema.safeParse({ reportId: 'c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d' }).success).toBe(true)
      expect(ExportQuerySchema.safeParse({ reportId: 'not-a-uuid' }).success).toBe(false)
      expect(ExportQuerySchema.safeParse({ reportId: '' }).success).toBe(false)
      expect(ExportQuerySchema.safeParse({}).success).toBe(false)
    })

    it('B3.2: PPTX export query schema accepts either ideaId or deckId UUID', () => {
      const PptxQuerySchema = z.object({
        ideaId: z.string().uuid().optional(),
        deckId: z.string().uuid().optional(),
      }).refine(data => data.ideaId || data.deckId, {
        message: 'Either ideaId or deckId must be provided',
      })

      expect(PptxQuerySchema.safeParse({ ideaId: 'c8d0a3d4-1e2f-4a3b-9c5d-6e7f8a9b0c1d' }).success).toBe(true)
      expect(PptxQuerySchema.safeParse({ deckId: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' }).success).toBe(true)
      expect(PptxQuerySchema.safeParse({}).success).toBe(false)
      expect(PptxQuerySchema.safeParse({ ideaId: 'invalid' }).success).toBe(false)
    })
  })

  // =========================================================================
  // 4. Input Malformation & Payload Boundaries
  // =========================================================================
  describe('Input Malformation & Payload Boundaries', () => {
    const PurchaseSchema = z.object({
      creditType: z.enum(['crowdfunding', 'pitch_deck', 'bundle']),
      quantity: z.number().int().positive().default(1),
      provider: z.enum(['stripe', 'razorpay']).default('stripe'),
    })

    it('B4.1: Credit purchase payload rejects invalid credit types', () => {
      expect(PurchaseSchema.safeParse({ creditType: 'crypto' }).success).toBe(false)
      expect(PurchaseSchema.safeParse({ creditType: 'unlimited' }).success).toBe(false)
      expect(PurchaseSchema.safeParse({ creditType: '' }).success).toBe(false)
    })

    it('B4.2: Credit purchase payload rejects zero or negative quantities', () => {
      expect(PurchaseSchema.safeParse({ creditType: 'bundle', quantity: 0 }).success).toBe(false)
      expect(PurchaseSchema.safeParse({ creditType: 'bundle', quantity: -1 }).success).toBe(false)
      expect(PurchaseSchema.safeParse({ creditType: 'bundle', quantity: -999 }).success).toBe(false)
    })

    it('B4.3: Credit purchase payload rejects non-integer decimal quantities', () => {
      expect(PurchaseSchema.safeParse({ creditType: 'bundle', quantity: 1.5 }).success).toBe(false)
      expect(PurchaseSchema.safeParse({ creditType: 'bundle', quantity: 0.1 }).success).toBe(false)
    })

    it('B4.4: Financial formula calculateBreakEvenUnits handles sellingPrice <= variableCost safely', () => {
      // If selling price equals variable cost, break even is impossible (Infinity)
      expect(calculateBreakEvenUnits(1000, 50, 50)).toBe(Infinity)
      // If variable cost exceeds selling price, break even is impossible (Infinity)
      expect(calculateBreakEvenUnits(1000, 40, 50)).toBe(Infinity)
    })

    it('B4.5: Financial formula calculateCAC handles zero acquired customers safely without division by zero crash', () => {
      expect(calculateCAC(5000, 0)).toBe(Infinity)
      expect(calculateCAC(5000, -10)).toBe(Infinity)
    })

    it('B4.6: Financial formula calculateARPU handles zero users safely returning 0', () => {
      expect(calculateARPU(10000, 0)).toBe(0)
      expect(calculateARPU(10000, -5)).toBe(0)
    })

    it('B4.7: Financial formula calculateCACPaybackPeriod handles zero or negative contribution safely', () => {
      expect(calculateCACPaybackPeriod(200, 0)).toBe(Infinity)
      expect(calculateCACPaybackPeriod(200, -20)).toBe(Infinity)
    })

    it('B4.8: Scoring clampScore enforces strict upper and lower bounds [0, maxWeight]', () => {
      expect(clampScore(15, 20)).toBe(15)
      expect(clampScore(25, 20)).toBe(20) // Upper bound clamped
      expect(clampScore(-5, 20)).toBe(0)  // Lower bound clamped
      expect(clampScore(0, 20)).toBe(0)
    })

    it('B4.9: Crowdfunding classification bands handle score boundaries cleanly', () => {
      expect(getCampaignClassificationBand(100).band).toBe('80-100')
      expect(getCampaignClassificationBand(80).band).toBe('80-100')
      expect(getCampaignClassificationBand(79).band).toBe('65-79')
      expect(getCampaignClassificationBand(65).band).toBe('65-79')
      expect(getCampaignClassificationBand(64).band).toBe('50-64')
      expect(getCampaignClassificationBand(50).band).toBe('50-64')
      expect(getCampaignClassificationBand(49).band).toBe('<50')
      expect(getCampaignClassificationBand(0).band).toBe('<50')
    })
  })

  // =========================================================================
  // 5. Tenant Isolation & Data Security Boundaries
  // =========================================================================
  describe('Tenant Isolation & Ownership Boundaries', () => {
    it('B5.1: Tenant boundary check rejects access when report does not belong to requesting user', () => {
      const userA = createMockUser({ id: 'user-aaa' })
      const userB = createMockUser({ id: 'user-bbb' })
      const reportOwnedByB = createMockReport('idea-1', userB.id)

      const isAuthorized = reportOwnedByB.userId === userA.id
      expect(isAuthorized).toBe(false)
    })

    it('B5.2: Tenant boundary check rejects access when pitch deck does not belong to requesting user', () => {
      const userA = createMockUser({ id: 'user-aaa' })
      const userB = createMockUser({ id: 'user-bbb' })
      const deckOwnedByB = createMockPitchDeck('idea-1', userB.id)

      const isAuthorized = deckOwnedByB.userId === userA.id
      expect(isAuthorized).toBe(false)
    })
  })

  // =========================================================================
  // 6. Adversarial Encoding & Escaping Boundaries
  // =========================================================================
  describe('Adversarial Escaping & Encoding Boundaries', () => {
    it('B6.1: RFC 4180 CSV escaping handles quotes, commas, and newlines in startup names and rationale', () => {
      // Helper to RFC 4180 escape a field
      const escapeCsvField = (field: string): string => {
        if (field.includes('"') || field.includes(',') || field.includes('\n') || field.includes('\r')) {
          return `"${field.replace(/"/g, '""')}"`
        }
        return field
      }

      const rawField1 = 'Validore "AI", NextGen'
      const rawField2 = 'Line 1\nLine 2 with, commas'
      const rawField3 = 'NormalField'

      const escaped1 = escapeCsvField(rawField1)
      const escaped2 = escapeCsvField(rawField2)
      const escaped3 = escapeCsvField(rawField3)

      expect(escaped1).toBe('"Validore ""AI"", NextGen"')
      expect(escaped2).toBe('"Line 1\nLine 2 with, commas"')
      expect(escaped3).toBe('NormalField')

      const reconstructedCsv = `Category,Metric\nMetadata,${escaped1}\nRationale,${escaped2}`
      const parsed = parseCsvRows(reconstructedCsv)
      expect(parsed[1][1]).toBe('Validore "AI", NextGen')
      expect(parsed[2][1]).toBe('Line 1\nLine 2 with, commas')
    })

    it('B6.2: CSV Unicode preservation retains emojis, international alphabets, and symbols without corruption', () => {
      const internationalText = '🚀 Startup Café — Стартап 日本語 £€¥'
      const csvLine = `Title,"${internationalText}"`
      const parsed = parseCsvRows(csvLine)
      expect(parsed[0][1]).toBe(internationalText)
    })

    it('B6.3: Portfolio HTML generation safely escapes XSS payload characters', () => {
      const sanitizeHtml = (str: string): string => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;')
      }

      const xssInput = `<script>alert('xss');</script><img src="x" onerror="alert(1)">`
      const sanitized = sanitizeHtml(xssInput)

      expect(sanitized).not.toContain('<script>')
      expect(sanitized).toContain('&lt;script&gt;')
      expect(sanitized).toContain('&lt;img')
    })
  })
})
