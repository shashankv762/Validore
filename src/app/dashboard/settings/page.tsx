'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { DialogShell } from '@/components/ui/DialogShell'
import {
  User,
  Shield,
  Bell,
  KeyRound,
  LogOut,
  Crown,
  Check,
  Copy,
  Loader2,
  RefreshCw,
  Zap,
  Cpu,
  Eye,
  EyeOff,
  AlertTriangle,
  CreditCard,
  X,
} from 'lucide-react'

interface UserProfile {
  id: string
  email: string
  tier: 'free' | 'premium' | 'max_premium'
  isFoundingMember: boolean
  validationsThisMonth: number
  currentPeriodEnd?: string | null
  subscriptionStatus?: string | null
  cancelAtPeriodEnd?: boolean
  createdAt?: string
  emailVerified?: boolean
}

interface NotificationPrefs {
  validationComplete: boolean
  weeklyDigest: boolean
  productUpdates: boolean
}

type AiProviderChain = 'free_models' | 'paid_models' | 'custom_openrouter'

const PREFS_STORAGE_KEY = 'validore_notification_preferences'
const OPENROUTER_KEY_STORAGE_KEY = 'validore_custom_openrouter_key'

function SettingsContent() {
  const router = useRouter()
  const supabase = createClient()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [savingAiPrefs, setSavingAiPrefs] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  // Subscription management dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellingSub, setCancellingSub] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [profileError, setProfileError] = useState('')

  const [aiProvider, setAiProvider] = useState<AiProviderChain>('free_models')
  const [customApiKey, setCustomApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // Notification Preferences with lazy initialization
  const [notifications, setNotifications] = useState<NotificationPrefs>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(PREFS_STORAGE_KEY)
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return {
      validationComplete: true,
      weeklyDigest: true,
      productUpdates: false,
    }
  })

  const reloadProfile = () => {
    setLoading(true)
    fetch('/api/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setProfile({
            id: data.user.id || '',
            email: data.user.email || '',
            tier: data.user.tier || 'free',
            isFoundingMember: Boolean(data.user.isFoundingMember),
            validationsThisMonth: data.user.validationsThisMonth ?? 0,
            currentPeriodEnd: data.user.currentPeriodEnd,
            subscriptionStatus: data.user.subscriptionStatus || null,
            cancelAtPeriodEnd: Boolean(data.user.cancelAtPeriodEnd),
            createdAt: data.user.createdAt,
            emailVerified: Boolean(data.user.emailVerified),
          })
        }
        if (data?.user) {
          setProfileError('')
          const provider = data.user.preferredAiProvider
          setAiProvider(['free_models', 'paid_models', 'custom_openrouter'].includes(provider) ? provider : 'paid_models')
          setHasSavedKey(Boolean(data.user.hasCustomApiKey))
        } else setProfileError('Unable to load your account. Refresh to try again.')
        setLoading(false)
      })
      .catch(() => { setProfileError('Unable to load your account. Refresh to try again.'); setLoading(false) })
  }

  // Load profile from /api/me on mount
  useEffect(() => {
    // Remove keys saved by older versions; secrets are stored only on the server.
    try { localStorage.removeItem(OPENROUTER_KEY_STORAGE_KEY) } catch {}
    fetch('/api/me')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user) {
          setProfile({
            id: data.user.id || '',
            email: data.user.email || '',
            tier: data.user.tier || 'free',
            isFoundingMember: Boolean(data.user.isFoundingMember),
            validationsThisMonth: data.user.validationsThisMonth ?? 0,
            currentPeriodEnd: data.user.currentPeriodEnd,
            subscriptionStatus: data.user.subscriptionStatus || null,
            cancelAtPeriodEnd: Boolean(data.user.cancelAtPeriodEnd),
            createdAt: data.user.createdAt,
            emailVerified: Boolean(data.user.emailVerified),
          })
        }
        if (data?.user) {
          setProfileError('')
          const provider = data.user.preferredAiProvider
          setAiProvider(['free_models', 'paid_models', 'custom_openrouter'].includes(provider) ? provider : 'paid_models')
          setHasSavedKey(Boolean(data.user.hasCustomApiKey))
        } else setProfileError('Unable to load your account. Refresh to try again.')
        setLoading(false)
      })
      .catch(() => { setProfileError('Unable to load your account. Refresh to try again.'); setLoading(false) })
  }, [])

  const copyUserId = async () => {
    if (!profile?.id) return
    try {
      await navigator.clipboard.writeText(profile.id)
      setCopiedId(true); toast.success('User ID copied to clipboard')
      setTimeout(() => setCopiedId(false), 2000)
    } catch { toast.error('Unable to copy. Select the account ID and copy it manually.') }
  }

  const handleSaveNotifications = () => {
    setSavingPrefs(true)
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(notifications))
      toast.success('Notification preferences saved successfully.')
    } catch {
      toast.error('Failed to save preferences to local storage.')
    } finally {
      setTimeout(() => setSavingPrefs(false), 400)
    }
  }

  const handleSaveAiPreferences = async () => {
    if (aiProvider === 'custom_openrouter' && !customApiKey.trim() && !hasSavedKey) {
      toast.error('Enter your OpenRouter key before saving.'); return
    }
    setSavingAiPrefs(true)
    try {
      const response = await fetch('/api/me/preferences', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiProvider: aiProvider,
          customOpenRouterKey: customApiKey.trim() || undefined }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to save AI preferences')
      if (customApiKey.trim()) setHasSavedKey(true)
      setCustomApiKey('')
      toast.success('AI preferences saved.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save AI preferences')
    } finally { setSavingAiPrefs(false) }
  }

  const removeCustomKey = async () => {
    setSavingAiPrefs(true)
    try {
      const response = await fetch('/api/me/preferences', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredAiProvider: 'free_models', customOpenRouterKey: null }),
      })
      if (!response.ok) throw new Error('Unable to remove the stored key')
      setCustomApiKey(''); setHasSavedKey(false); setAiProvider('free_models')
      toast.success('Stored API key removed.')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to remove key') }
    finally { setSavingAiPrefs(false) }
  }

  const handlePasswordReset = async () => {
    if (!profile?.email) {
      toast.error('No email associated with current session.')
      return
    }

    try {
      setResettingPassword(true)
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: profile.email }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request a reset link')
      toast.success(data.message)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error sending password reset email'
      toast.error(msg)
    } finally {
      setResettingPassword(false)
    }
  }

  const handleSignOut = async () => {
    try {
      setSigningOut(true)
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success('Signed out successfully.')
      router.push('/auth/signin')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error signing out'
      toast.error(msg)
      setSigningOut(false)
    }
  }

  const openBilling = async (tier?: 'premium' | 'max_premium') => {
    setBillingBusy(true)
    try {
      const response = await fetch(tier ? '/api/billing/checkout' : '/api/billing/portal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tier ? { tier } : {}),
      })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error || 'Billing is unavailable')
      window.location.assign(data.url)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Billing is unavailable') }
    finally { setBillingBusy(false) }
  }

  const handleConfirmCancelSubscription = async () => {
    setCancellingSub(true)
    try {
      const res = await fetch('/api/billing/cancel', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to cancel')
      setProfile(prev => (prev ? { ...prev, cancelAtPeriodEnd: true } : null))
      setCancelDialogOpen(false)
      toast.success('Subscription scheduled for cancellation at the end of the current billing cycle.')
    } catch {
      toast.error('Failed to cancel subscription')
    } finally {
      setCancellingSub(false)
    }
  }

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—'
    try {
      const d = new Date(dateStr)
      if (!Number.isFinite(d.getTime())) return '—'
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const renewalDateDisplay = profile?.currentPeriodEnd
    ? formatDate(profile.currentPeriodEnd)
    : 'end of billing period'

  return (
    <div className="space-y-10 pb-16 max-w-4xl">
      {/* Header */}
      <div className="border-b border-[#E8E0D0] pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-[#C8A860]/15 text-[#96792b] mb-2 uppercase tracking-wider">
            <User className="w-3.5 h-3.5" />
            <span>Account & Configuration</span>
          </div>
          <h1 className="text-3xl font-light text-[#0A1628] tracking-tight">Settings</h1>
          <p className="text-sm text-[#1C1C1C]/70 mt-1">
            Manage your personal profile, subscription tier, AI provider cascade, and account credentials.
          </p>
        </div>

        <button
          onClick={reloadProfile}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs text-[#0A1628] hover:text-[#96792b] border border-[#E8E0D0] bg-[#FAFAF7] rounded transition-colors self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {profileError && <p role="alert" className="p-4 border border-[#C8A860] text-sm">{profileError}</p>}
      {/* Account Info Section */}
      <section className="card-angular p-6 bg-[#FAFAF7]">
        <div className="flex items-center gap-2 mb-6">
          <User className="w-4 h-4 text-[#96792b]" />
          <h2 className="text-base font-normal text-[#0A1628]">Account Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div>
            <label className="block text-[#1C1C1C]/60 uppercase tracking-wider mb-1 font-medium">
              Registered Email
            </label>
            <div className="p-3 bg-white border border-[#E8E0D0] rounded text-[#0A1628] font-mono text-sm flex items-center justify-between">
              <span>{profile?.email || (loading ? 'Loading…' : 'Unavailable')}</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-sans font-medium">
                {profile?.emailVerified ? 'Verified' : 'Unconfirmed'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[#1C1C1C]/60 uppercase tracking-wider mb-1 font-medium">
              Account Identifier (UUID)
            </label>
            <div className="p-3 bg-white border border-[#E8E0D0] rounded text-[#0A1628] font-mono text-xs flex items-center justify-between">
              <span className="truncate mr-2">{profile?.id || '—'}</span>
              <button
                onClick={copyUserId}
                className="text-[#1C1C1C]/60 hover:text-[#96792b] transition-colors p-1"
                title="Copy User ID"
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[#1C1C1C]/60 uppercase tracking-wider mb-1 font-medium">
              Membership Class
            </label>
            <div className="p-3 bg-white border border-[#E8E0D0] rounded text-[#0A1628] flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profile?.isFoundingMember ? (
                  <>
                    <Crown className="w-4 h-4 text-[#96792b]" />
                    <span className="font-medium text-[#96792b]">Founding Member</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 text-[#1C1C1C]/50" />
                    <span>Standard Member</span>
                  </>
                )}
              </div>
              {profile?.isFoundingMember && (
                <span className="text-[10px] bg-[#C8A860]/15 text-[#96792b] px-2 py-0.5 rounded font-medium">
                  Founding Member (1 of 100)
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[#1C1C1C]/60 uppercase tracking-wider mb-1 font-medium">
              Account Created
            </label>
            <div className="p-3 bg-white border border-[#E8E0D0] rounded text-[#0A1628] font-mono">
              {formatDate(profile?.createdAt)}
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Management Section */}
      <section className="card-angular p-6 bg-[#FAFAF7]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#96792b]" />
            <h2 className="text-base font-normal text-[#0A1628]">Subscription Management</h2>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded font-medium capitalize ${
              profile?.tier === 'max_premium'
                ? 'bg-[#C8A860]/20 text-[#0A1628] border border-[#C8A860]'
                : profile?.tier === 'premium'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-[#E8E0D0] text-[#1C1C1C]'
            }`}
          >
            {profile?.tier === 'max_premium'
              ? 'Max Premium Plan ($79/mo)'
              : profile?.tier === 'premium'
              ? 'Pro Plan ($29/mo)'
              : 'Free Plan ($0)'}
          </span>
        </div>

        {/* Plan Status Banner */}
        <div className="bg-white border border-[#E8E0D0] rounded p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs divide-y md:divide-y-0 md:divide-x divide-[#E8E0D0]">
            <div className="pr-4">
              <span className="text-[#1C1C1C]/60 uppercase tracking-wider block mb-1">
                Current Plan Tier
              </span>
              <span className="text-xl font-mono font-light text-[#0A1628] capitalize">
                {profile?.tier?.replace('_', ' ') || 'Free'}
              </span>
              <p className="text-[11px] text-[#1C1C1C]/60 mt-1">
                {profile?.tier === 'max_premium'
                  ? 'Unlimited launch & fundraising tools'
                  : profile?.tier === 'premium'
                  ? 'Full validation & pricing suite'
                  : 'Lite validation & manual canvas'}
              </p>
            </div>

            <div className="pt-3 md:pt-0 md:px-4">
              <span className="text-[#1C1C1C]/60 uppercase tracking-wider block mb-1">
                Subscription Status
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-flex items-center gap-1 font-semibold text-xs px-2 py-0.5 rounded ${
                    profile?.cancelAtPeriodEnd
                      ? 'bg-amber-100 text-amber-800'
                      : profile?.tier !== 'free'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  <Check className="w-3 h-3" />
                  {profile?.cancelAtPeriodEnd
                    ? 'Cancels at Period End'
                    : profile?.subscriptionStatus?.toUpperCase() || 'NO SUBSCRIPTION'}
                </span>
              </div>
              <p className="text-[11px] text-[#1C1C1C]/60 mt-1">
                {profile?.currentPeriodEnd
                  ? `Cycle ends ${formatDate(profile.currentPeriodEnd)}`
                  : '30-day rolling cycle'}
              </p>
            </div>

            <div className="pt-3 md:pt-0 md:pl-4">
              <span className="text-[#1C1C1C]/60 uppercase tracking-wider block mb-1">
                Billing Actions
              </span>
              <div className="flex flex-col gap-2 mt-1">
                <button
                  onClick={() => openBilling()}
                  disabled={billingBusy || loading}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-[#0A1628] bg-[#E8E0D0] hover:bg-[#C8A860] rounded transition-colors"
                >
                  <CreditCard className="w-3 h-3" />
                  <span>Manage Billing</span>
                </button>

                {profile?.tier !== 'free' && !profile?.cancelAtPeriodEnd && (
                  <button
                    onClick={() => setCancelDialogOpen(true)}
                    className="text-[11px] text-rose-700 hover:text-rose-900 underline text-left"
                  >
                    Cancel Subscription
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade / Plan CTAs */}
        <div className="border-t border-[#E8E0D0] pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#1C1C1C]/60 mb-4">
            Plan Upgrades & Downgrades
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pro Plan ($29/mo) */}
            <div
              className={`p-4 rounded border transition-all ${
                profile?.tier === 'premium'
                  ? 'border-[#C8A860] bg-[#C8A860]/5'
                  : 'border-[#E8E0D0] bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-[#0A1628]">Pro Plan ($29/mo)</span>
                {profile?.tier === 'premium' && (
                  <span className="text-[10px] bg-[#C8A860] text-[#0A1628] font-bold px-2 py-0.5 rounded">
                    Active Plan
                  </span>
                )}
              </div>
              <p className="text-xs text-[#1C1C1C]/70 mb-4">
                1,500 credits/mo, full 40-section validation, AI Lean Canvas, Pricing Simulator, and PDF/CSV downloads.
              </p>
              {profile?.tier === 'free' ? (
                <button
                  onClick={() => openBilling('premium')}
                  disabled={billingBusy || loading}
                  className="w-full py-2 px-3 text-xs font-medium text-[#0A1628] bg-[#E8E0D0] hover:bg-[#C8A860] rounded transition-colors"
                >
                  Upgrade to Pro ($29/mo)
                </button>
              ) : (
                <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Plan Features Included
                </div>
              )}
            </div>

            {/* Max Plan ($79/mo) */}
            <div
              className={`p-4 rounded border transition-all ${
                profile?.tier === 'max_premium'
                  ? 'border-[#C8A860] bg-[#C8A860]/5'
                  : 'border-[#E8E0D0] bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-[#0A1628]">Max Premium ($79/mo)</span>
                {profile?.tier === 'max_premium' && (
                  <span className="text-[10px] bg-[#C8A860] text-[#0A1628] font-bold px-2 py-0.5 rounded">
                    Active Plan
                  </span>
                )}
              </div>
              <p className="text-xs text-[#1C1C1C]/70 mb-4">
                4,500 credits/mo, Crowdfunding & Pitch Deck access, White-Label PDF, Portfolio ZIP, and PPTX export.
              </p>
              {profile?.tier !== 'max_premium' ? (
                <button
                  onClick={() => openBilling('max_premium')}
                  disabled={billingBusy || loading}
                  className="w-full py-2 px-3 text-xs font-semibold text-[#0A1628] bg-[#C8A860] hover:bg-[#b09048] rounded transition-colors"
                >
                  Upgrade to Max ($79/mo)
                </button>
              ) : (
                <div className="text-xs text-[#96792b] font-medium flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" /> Highest Tier Active
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* AI Provider Selection Chain Section */}
      <section className="card-angular p-6 bg-[#FAFAF7]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#96792b]" />
            <h2 className="text-base font-normal text-[#0A1628]">AI Inference Provider Chain</h2>
          </div>
          <span className="text-xs font-medium text-[#96792b] bg-[#C8A860]/15 px-2 py-0.5 rounded">
            Configurable Failover
          </span>
        </div>
        <p className="text-xs text-[#1C1C1C]/70 mb-6">
          Choose which AI model infrastructure executes your research, scoring, and document generation tasks.
        </p>

        <div className="space-y-4">
          {/* Mode 1: Default (Free Models Chain) */}
          <label
            className={`block p-4 rounded border cursor-pointer transition-all ${
              aiProvider === 'free_models'
                ? 'border-[#C8A860] bg-white shadow-sm ring-1 ring-[#C8A860]'
                : 'border-[#E8E0D0] bg-white/70 hover:border-[#C8A860]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="aiProvider"
                value="free_models"
                checked={aiProvider === 'free_models'}
                onChange={() => setAiProvider('free_models')}
                className="mt-1 text-[#C8A860] focus:ring-[#C8A860]"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0A1628]">
                    Default Free Models Chain
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    Recommended • Zero Added Cost
                  </span>
                </div>
                <p className="text-xs text-[#1C1C1C]/70 mt-1">
                  Zero platform inference cost with automatic cascade failover across open frontier models.
                </p>
                <div className="mt-3 p-2 bg-[#FAFAF7] rounded border border-[#E8E0D0] text-[11px] font-mono text-[#0A1628]">
                  <div className="text-[10px] uppercase text-[#1C1C1C]/50 font-sans font-semibold mb-1">
                    Cascade Execution Order:
                  </div>
                  <div>Uses the free OpenRouter models configured by Validore. Availability and quotas vary by provider.</div>
                  <div className="mt-0.5">
                    Research: <span className="text-[#96792b]">kimi-k2.5-free</span>
                  </div>
                </div>
              </div>
            </div>
          </label>

          {/* Mode 2: Paid Commercial Fallback Chain */}
          <label
            className={`block p-4 rounded border cursor-pointer transition-all ${
              aiProvider === 'paid_models'
                ? 'border-[#C8A860] bg-white shadow-sm ring-1 ring-[#C8A860]'
                : 'border-[#E8E0D0] bg-white/70 hover:border-[#C8A860]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="aiProvider"
                value="paid_models"
                checked={aiProvider === 'paid_models'}
                onChange={() => setAiProvider('paid_models')}
                className="mt-1 text-[#C8A860] focus:ring-[#C8A860]"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0A1628]">
                    Paid Commercial Models Chain
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Commercial Grade
                  </span>
                </div>
                <p className="text-xs text-[#1C1C1C]/70 mt-1">
                  Ultra-low latency with enterprise commercial APIs via Validore infrastructure.
                </p>
                <div className="mt-3 p-2 bg-[#FAFAF7] rounded border border-[#E8E0D0] text-[11px] font-mono text-[#0A1628]">
                  <div className="text-[10px] uppercase text-[#1C1C1C]/50 font-sans font-semibold mb-1">
                    Cascade Execution Order:
                  </div>
                  <div>
                    Google → Anthropic → OpenAI, with configured models and request budgets
                  </div>
                </div>
              </div>
            </div>
          </label>

          {/* Mode 3: Custom OpenRouter Key (BYOK) */}
          <label
            className={`block p-4 rounded border cursor-pointer transition-all ${
              aiProvider === 'custom_openrouter'
                ? 'border-[#C8A860] bg-white shadow-sm ring-1 ring-[#C8A860]'
                : 'border-[#E8E0D0] bg-white/70 hover:border-[#C8A860]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="aiProvider"
                value="custom_openrouter"
                checked={aiProvider === 'custom_openrouter'}
                onChange={() => setAiProvider('custom_openrouter')}
                className="mt-1 text-[#C8A860] focus:ring-[#C8A860]"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#0A1628]">
                    Custom OpenRouter API Key (BYOK)
                  </span>
                  <span className="text-[10px] font-bold uppercase bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                    Direct Account Access
                  </span>
                </div>
                <p className="text-xs text-[#1C1C1C]/70 mt-1">
                  Use your personal OpenRouter quota. Workspace credits and request limits still apply.
                </p>

                {aiProvider === 'custom_openrouter' && (
                  <div className="mt-4 pt-3 border-t border-[#E8E0D0]" onClick={e => e.stopPropagation()}>
                    <label className="block text-[11px] font-medium text-[#0A1628] mb-1">
                      OpenRouter API Key:
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={customApiKey}
                        onChange={e => setCustomApiKey(e.target.value)}
                        placeholder={hasSavedKey ? 'A key is saved. Enter a replacement to change it.' : 'sk-or-v1-...'}
                        maxLength={512} autoComplete="off" spellCheck={false} aria-label="OpenRouter API key"
                        className="w-full px-3 py-2 pr-10 text-xs font-mono bg-white border border-[#E8E0D0] rounded focus:outline-none focus:border-[#C8A860]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[#1C1C1C]/50 hover:text-[#0A1628]"
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#1C1C1C]/60 mt-1">
                      The key is encrypted on the server and used for your analyses. Its value is never returned to this page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </label>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {hasSavedKey && <button onClick={removeCustomKey} disabled={savingAiPrefs} className="px-4 py-2 text-xs border border-[#E8E0D0] rounded">Remove stored key</button>}
          <button
            onClick={handleSaveAiPreferences}
            disabled={savingAiPrefs}
            className="px-5 py-2 text-xs font-semibold bg-[#0A1628] text-[#FAFAF7] hover:bg-[#C8A860] hover:text-[#0A1628] rounded transition-colors inline-flex items-center gap-2"
          >
            {savingAiPrefs ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Save AI Preferences</span>
          </button>
        </div>
      </section>

      {/* Notification Preferences Section */}
      <section className="card-angular p-6 bg-[#FAFAF7]">
        <div className="flex items-center gap-2 mb-6">
          <Bell className="w-4 h-4 text-[#96792b]" />
          <h2 className="text-base font-normal text-[#0A1628]">Notification Preferences</h2>
        </div>

        <p className="text-xs text-[#1C1C1C]/70 mb-4">Preferences are saved in this browser. Email notifications are not enabled yet.</p>
        <div className="space-y-4">
          <label className="flex items-start justify-between p-3.5 bg-white border border-[#E8E0D0] rounded cursor-pointer hover:border-[#C8A860]/50 transition-colors">
            <div className="pr-4">
              <span className="text-xs font-medium text-[#0A1628] block">
                Validation Analysis Alerts
              </span>
              <span className="text-[11px] text-[#1C1C1C]/60 mt-0.5 block">
                Receive an immediate email alert when your AI deep market feasibility and viability report completes.
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifications.validationComplete}
              onChange={e =>
                setNotifications(prev => ({ ...prev, validationComplete: e.target.checked }))
              }
              className="mt-1 text-[#C8A860] focus:ring-[#C8A860] rounded"
            />
          </label>

          <label className="flex items-start justify-between p-3.5 bg-white border border-[#E8E0D0] rounded cursor-pointer hover:border-[#C8A860]/50 transition-colors">
            <div className="pr-4">
              <span className="text-xs font-medium text-[#0A1628] block">
                Weekly Startup Digest
              </span>
              <span className="text-[11px] text-[#1C1C1C]/60 mt-0.5 block">
                Curated briefing of startup failure post-mortems, market demand trends, and pricing shifts.
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifications.weeklyDigest}
              onChange={e =>
                setNotifications(prev => ({ ...prev, weeklyDigest: e.target.checked }))
              }
              className="mt-1 text-[#C8A860] focus:ring-[#C8A860] rounded"
            />
          </label>

          <label className="flex items-start justify-between p-3.5 bg-white border border-[#E8E0D0] rounded cursor-pointer hover:border-[#C8A860]/50 transition-colors">
            <div className="pr-4">
              <span className="text-xs font-medium text-[#0A1628] block">
                Product Updates & Engine Releases
              </span>
              <span className="text-[11px] text-[#1C1C1C]/60 mt-0.5 block">
                Stay updated on new scoring modules, export formats, and predictive benchmark datasets.
              </span>
            </div>
            <input
              type="checkbox"
              checked={notifications.productUpdates}
              onChange={e =>
                setNotifications(prev => ({ ...prev, productUpdates: e.target.checked }))
              }
              className="mt-1 text-[#C8A860] focus:ring-[#C8A860] rounded"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveNotifications}
            disabled={savingPrefs}
            className="px-5 py-2 text-xs font-semibold bg-[#0A1628] text-[#FAFAF7] hover:bg-[#C8A860] hover:text-[#0A1628] rounded transition-colors inline-flex items-center gap-2"
          >
            {savingPrefs ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Save Preferences</span>
          </button>
        </div>
      </section>

      {/* Account Security & Sign Out Section */}
      <section className="card-angular p-6 bg-[#FAFAF7]">
        <div className="flex items-center gap-2 mb-6">
          <KeyRound className="w-4 h-4 text-[#96792b]" />
          <h2 className="text-base font-normal text-[#0A1628]">Security & Credentials</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white border border-[#E8E0D0] rounded mb-6">
          <div>
            <span className="text-xs font-medium text-[#0A1628] block">
              Change Password
            </span>
            <span className="text-[11px] text-[#1C1C1C]/60 mt-0.5 block">
              We will send a secure password reset link to your verified email address.
            </span>
          </div>

          <button
            onClick={handlePasswordReset}
            disabled={resettingPassword}
            className="px-4 py-2 text-xs font-medium border border-[#E8E0D0] hover:border-[#C8A860] hover:bg-[#FAFAF7] text-[#0A1628] rounded transition-colors inline-flex items-center justify-center gap-2 shrink-0"
          >
            {resettingPassword ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#96792b]" />
            ) : (
              <KeyRound className="w-3.5 h-3.5 text-[#96792b]" />
            )}
            <span>Send Reset Email</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[#E8E0D0] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-[#0A1628] block">
              Sign Out of Session
            </span>
            <span className="text-[11px] text-[#1C1C1C]/60 mt-0.5 block">
              Terminate your authenticated session on this browser.
            </span>
          </div>

          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="px-4 py-2 text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded transition-colors inline-flex items-center justify-center gap-2 shrink-0"
          >
            {signingOut ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <LogOut className="w-3.5 h-3.5" />
            )}
            <span>Sign Out</span>
          </button>
        </div>
      </section>

      {/* Cancel Subscription Confirmation Dialog */}
      {cancelDialogOpen && (
        <DialogShell title="Cancel subscription" onClose={() => { if (!cancellingSub) setCancelDialogOpen(false) }}>
          <div className="card-angular p-6 bg-[#FAFAF7] max-w-md w-full shadow-xl border border-[#E8E0D0] relative">
            <button
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancellingSub}
              aria-label="Close cancellation dialog"
              className="absolute top-4 right-4 text-[#1C1C1C]/40 hover:text-[#0A1628]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#0A1628]">Cancel Subscription?</h3>
                <p className="text-xs text-[#1C1C1C]/60">Confirm Subscription Modification</p>
              </div>
            </div>
            <p className="text-xs text-[#1C1C1C]/80 leading-relaxed mb-4">
              You will retain full access to all your current plan features, monthly compute credits, and export tools until <strong>{renewalDateDisplay}</strong>. After this date, your account will automatically revert to the Free tier.
            </p>
            <p className="text-xs text-[#1C1C1C]/60 leading-relaxed mb-6">
              Saved ideas, reports, and generated lean canvases will not be deleted.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setCancelDialogOpen(false)}
              disabled={cancellingSub}
                className="px-4 py-2 text-xs font-medium border border-[#E8E0D0] text-[#0A1628] rounded hover:bg-[#E8E0D0]"
              >
                Keep Subscription
              </button>
              <button
                onClick={handleConfirmCancelSubscription}
                disabled={cancellingSub}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 rounded transition-colors inline-flex items-center gap-1.5"
              >
                {cancellingSub ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </DialogShell>
      )}

    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#C8A860]" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  )
}