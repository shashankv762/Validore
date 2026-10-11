import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as signinHandler } from '@/app/api/auth/signin/route'
import { POST as signupHandler } from '@/app/api/auth/signup/route'
import { GET as callbackHandler } from '@/app/auth/callback/route'
import { POST as signoutHandler } from '@/app/api/auth/signout/route'

vi.mock('@/lib/supabase/server', () => {
  return {
    createClient: vi.fn().mockImplementation(async () => {
      return {
        auth: {
          signInWithPassword: vi.fn().mockImplementation(async ({ email, password }) => {
            if (password === 'wrongpassword') {
              return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } }
            }
            return {
              data: {
                user: { id: 'mock-auth-id-123', email },
                session: { access_token: 'mock-token', expires_in: 3600 },
              },
              error: null,
            }
          }),
          signUp: vi.fn().mockImplementation(async ({ email, password }) => {
            if (password.length < 6) {
              return { data: { user: null, session: null }, error: { message: 'Password too short' } }
            }
            return {
              data: {
                user: { id: 'mock-signup-id-456', email },
                session: { access_token: 'mock-signup-token' },
              },
              error: null,
            }
          }),
          exchangeCodeForSession: vi.fn().mockImplementation(async (code: string) => {
            if (code === 'valid-auth-code') {
              return {
                data: {
                  user: { id: 'mock-callback-id-789', email: 'callback@example.com' },
                  session: { access_token: 'valid-session' },
                },
                error: null,
              }
            }
            return { data: { user: null, session: null }, error: { message: 'Invalid code' } }
          }),
          signOut: vi.fn().mockResolvedValue({ error: null }),
        },
      }
    }),
  }
})

vi.mock('@/lib/auth-sync', () => {
  return {
    syncUserToDatabase: vi.fn().mockResolvedValue({
      id: 'mock-db-uuid',
      email: 'test@example.com',
      supabaseId: 'mock-auth-id-123',
      tier: 'free',
    }),
    getOrCreateDbUser: vi.fn().mockResolvedValue({
      id: 'mock-db-uuid',
      email: 'test@example.com',
      supabaseId: 'mock-auth-id-123',
      tier: 'free',
    }),
  }
})

describe('Auth API Routes', () => {
  describe('POST /api/auth/signin', () => {
    it('returns 400 when email or password is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: '' }),
      })
      const res = await signinHandler(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Email and password are required')
    })

    it('returns 400 when invalid credentials are provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'wrongpassword' }),
      })
      const res = await signinHandler(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Invalid login credentials')
    })

    it('returns user and session on successful JSON signin', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', password: 'correctpassword' }),
      })
      const res = await signinHandler(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.user?.id).toBe('mock-auth-id-123')
      expect(data.session?.access_token).toBe('mock-token')
    })
  })

  describe('POST /api/auth/signup', () => {
    it('returns 400 when password is too short', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com', password: '123' }),
      })
      const res = await signupHandler(req)
      expect(res.status).toBe(400)
      const data = await res.json()
      expect(data.error).toBe('Password too short')
    })

    it('returns user and session on successful signup', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'new@example.com', password: 'securepassword123' }),
      })
      const res = await signupHandler(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.user?.id).toBe('mock-signup-id-456')
      expect(data.session?.access_token).toBe('mock-signup-token')
    })
  })

  describe('GET /auth/callback', () => {
    it('redirects to signin when code is missing', async () => {
      const req = new NextRequest('http://localhost:3000/auth/callback')
      const res = await callbackHandler(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/auth/signin?error=auth_callback_failed')
    })

    it('exchanges code for session and redirects to /dashboard when code is valid', async () => {
      const req = new NextRequest('http://localhost:3000/auth/callback?code=valid-auth-code')
      const res = await callbackHandler(req)
      expect(res.status).toBe(307)
      expect(res.headers.get('location')).toContain('/dashboard')
    })
  })

  describe('POST /api/auth/signout', () => {
    it('successfully signs out user', async () => {
      const req = new NextRequest('http://localhost:3000/api/auth/signout', {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
      })
      const res = await signoutHandler(req)
      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.success).toBe(true)
    })
  })
})
