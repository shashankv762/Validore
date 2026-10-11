import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST, GET, CREDIT_PACKAGES } from '@/app/api/credits/purchase/route'

// Mock Supabase server client
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}))

// Mock Drizzle DB
const mockFindFirst = vi.fn()
const mockInsert = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/db', () => ({
  db: {
    query: {
      users: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}))

// Mock Stripe
const mockCheckoutSessionsCreate = vi.fn()
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      checkout = {
        sessions: {
          create: mockCheckoutSessionsCreate,
        },
      }
    },
  }
})

describe('Credits Purchase API & Business Logic', () => {
  const mockDbUser = {
    id: 'user-uuid-1111',
    supabaseId: 'supa-uuid-1111',
    email: 'test@example.com',
    tier: 'free' as const,
    crowdfundingCredits: 2,
    pitchDeckCredits: 1,
    validationsThisMonth: 1,
    isFoundingMember: false,
    creditBalance: 100,
    purchasedCredits: 0,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_KEY_SECRET
  })

  describe('Package Pricing Configuration', () => {
    it('defines crowdfunding pack at $49 with 1 credit', () => {
      expect(CREDIT_PACKAGES.crowdfunding.amountUsd).toBe(49)
      expect(CREDIT_PACKAGES.crowdfunding.credits.crowdfunding).toBe(1)
      expect(CREDIT_PACKAGES.crowdfunding.credits.pitchDeck).toBe(0)
    })

    it('defines pitch deck pack at $49 with 1 credit', () => {
      expect(CREDIT_PACKAGES.pitch_deck.amountUsd).toBe(49)
      expect(CREDIT_PACKAGES.pitch_deck.credits.pitchDeck).toBe(1)
      expect(CREDIT_PACKAGES.pitch_deck.credits.crowdfunding).toBe(0)
    })

    it('defines founder bundle at $79 with 1 crowdfunding + 1 pitch deck credit', () => {
      expect(CREDIT_PACKAGES.bundle.amountUsd).toBe(79)
      expect(CREDIT_PACKAGES.bundle.credits.crowdfunding).toBe(1)
      expect(CREDIT_PACKAGES.bundle.credits.pitchDeck).toBe(1)
    })
  })

  describe('Authentication Enforcement', () => {
    it('returns 401 Unauthorized when no user session exists', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } })

      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'bundle', quantity: 1 }),
      })

      const res = await POST(req)
      expect(res.status).toBe(401)
      const data = await res.json()
      expect(data.error).toBe('Unauthorized')
    })
  })

  describe('Input Validation & Payload Handling', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'supa-uuid-1111', email: 'test@example.com' } },
      })
      mockFindFirst.mockResolvedValue(mockDbUser)
    })

    it('rejects invalid creditType with 400 Bad Request', async () => {
      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'invalid_type', quantity: 1 }),
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toContain('Invalid purchase payload')
    })

    it('rejects zero or negative quantities with 400 Bad Request', async () => {
      const reqZero = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'bundle', quantity: 0 }),
      })

      const resZero = await POST(reqZero)
      expect(resZero.status).toBe(400)

      const reqNegative = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'bundle', quantity: -5 }),
      })

      const resNegative = await POST(reqNegative)
      expect(resNegative.status).toBe(400)
    })

    it('rejects malformed non-JSON body with 400 Bad Request', async () => {
      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not a json string',
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Invalid JSON body')
    })
  })

  describe('Unconfigured Payment Provider Graceful Fallback', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'supa-uuid-1111', email: 'test@example.com' } },
      })
      mockFindFirst.mockResolvedValue(mockDbUser)
    })

    it('returns 503 when STRIPE_SECRET_KEY is undefined', async () => {
      delete process.env.STRIPE_SECRET_KEY

      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'bundle' }),
      })

      const res = await POST(req)
      expect(res.status).toBe(503)
      const data = await res.json()
      expect(data.configured).toBe(false)
      expect(data.error).toContain('Payment provider not configured')
    })

    it('returns 503 when STRIPE_SECRET_KEY is placeholder "your_stripe_secret"', async () => {
      process.env.STRIPE_SECRET_KEY = 'your_stripe_secret'

      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'crowdfunding' }),
      })

      const res = await POST(req)
      expect(res.status).toBe(503)
      const data = await res.json()
      expect(data.configured).toBe(false)
      expect(data.error).toContain('Payment provider not configured')
    })

    it('returns 503 when Razorpay credentials are unconfigured', async () => {
      process.env.RAZORPAY_KEY_ID = 'your_razorpay_key_id'

      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'pitch_deck', provider: 'razorpay' }),
      })

      const res = await POST(req)
      expect(res.status).toBe(503)
      const data = await res.json()
      expect(data.configured).toBe(false)
      expect(data.error).toContain('Payment provider not configured')
    })
  })

  describe('Configured Stripe Checkout Session Creation', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'supa-uuid-1111', email: 'test@example.com' } },
      })
      mockFindFirst.mockResolvedValue(mockDbUser)
      process.env.STRIPE_SECRET_KEY = 'sk_test_valid_dummy_key_12345'
    })

    it('creates Stripe checkout session and returns checkout URL', async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        url: 'https://checkout.stripe.com/c/pay/cs_test_bundle_session_123',
      })

      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'bundle', quantity: 1, provider: 'stripe' }),
      })

      const res = await POST(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.url).toBe('https://checkout.stripe.com/c/pay/cs_test_bundle_session_123')

      // Verify parameters sent to Stripe
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          customer_email: 'test@example.com',
          client_reference_id: mockDbUser.id,
          metadata: {
            userId: mockDbUser.id,
            creditType: 'bundle',
            quantity: '1',
          },
          line_items: [
            expect.objectContaining({
              price_data: expect.objectContaining({
                currency: 'usd',
                unit_amount: 7900, // $79.00 in cents
              }),
              quantity: 1,
            }),
          ],
        })
      )
    })

    it('handles Stripe API errors gracefully with status 503', async () => {
      mockCheckoutSessionsCreate.mockRejectedValueOnce(new Error('Stripe network connection failed'))

      const req = new NextRequest('http://localhost:3000/api/credits/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creditType: 'pitch_deck' }),
      })

      const res = await POST(req)
      expect(res.status).toBe(503)
      const data = await res.json()
      expect(data.configured).toBe(false)
      expect(data.error).toContain('Payment provider error')
      expect(data.error).toContain('Stripe network connection failed')
    })
  })

  describe('GET Purchase History Endpoint', () => {
    it('returns balances and purchase history for authenticated user', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'supa-uuid-1111', email: 'test@example.com' } },
      })
      mockFindFirst.mockResolvedValue(mockDbUser)

      const mockPurchases = [
        {
          id: 'purch-1',
          userId: mockDbUser.id,
          creditType: 'bundle',
          quantity: 1,
          amountUsd: 39,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      ]

      mockSelect.mockReturnValue({
        from: () => ({
          where: () => ({
            orderBy: () => Promise.resolve(mockPurchases),
          }),
        }),
      })

      const res = await GET()
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.user.crowdfundingCredits).toBe(2)
      expect(data.user.pitchDeckCredits).toBe(1)
      expect(data.purchases).toHaveLength(1)
      expect(data.purchases[0].creditType).toBe('bundle')
    })
  })
})
