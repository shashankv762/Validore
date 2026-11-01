'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { DialogShell } from '@/components/ui/DialogShell'
import { useAccount, notifyAccountUpdated } from '@/components/AccountProvider'
import { PLAN_CATALOG, formatUsd } from '@/lib/plans'
import { PrivacyControls } from '@/components/PrivacyControls'
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

type AiProviderChain = 'free_models' | 'paid_models' | 'custom_openrouter'

const OPENROUTER_KEY_STORAGE_KEY = 'validore_custom_openrouter_key'

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [supabase] = useState(createClient)
  const account = useAccount()
  const profile = account.data?.user ?? null
  const loading = account.loading
  const profileError = account.error
  const billing = account.data?.billing ?? { credits: false, premium: false, maxPremium: false }
  const freeOnly = account.data?.ai.freeOnly !== false
  const hasSavedKey = Boolean(profile?.hasCustomApiKey)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [savingAiPrefs, setSavingAiPrefs] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  // Subscription management dialog states
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [cancellingSub, setCancellingSub] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [aiProviderDraft, setAiProvider] = useState<AiProviderChain | null>(null)
  const aiProvider = aiProviderDraft ?? profile?.preferredAiProvider ?? 'free_models'
  const [customApiKey, setCustomApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  const reloadProfile = () => account.refresh()

  useEffect(() => {
    if (searchParams.get('checkout') !== 'returned') return
    notifyAccountUpdated()
    const timer = window.setInterval(notifyAccountUpdated, 4000)
    const end = window.setTimeout(() => { window.clearInterval(timer); router.replace('/dashboard/settings') }, 32_000)
    return () => { window.clearInterval(timer); window.clearTimeout(end) }
  }, [searchParams, router])

  // Load profile from /api/me on mount
  useEffect(() => {
    // Remove keys saved by older versions; secrets are stored only on the server.
    try { localStorage.removeItem(OPENROUTER_KEY_STORAGE_KEY) } catch {}
  }, [])

  const copyUserId = async () => {
    if (!profile?.id) return
    try {
      await navigator.clipboard.writeText(profile.id)
      setCopiedId(true); toast.success('User ID copied to clipboard')
      setTimeout(() => setCopiedId(false), 2000)
    } catch { toast.error('Unable to copy. Select the account ID and copy it manually.') }
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
      setCustomApiKey('')
      notifyAccountUpdated()
      await account.refresh()
      setAiProvider(null)
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
      setCustomApiKey(''); setAiProvider('free_models')
      notifyAccountUpdated()
      await account.refresh()
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
      const res = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) throw new Error('Failed to cancel')
      notifyAccountUpdated()
      await account.refresh()
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
      <div className="border-b border-[#E5E7EB] pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-[#E0A526]/15 text-[#89620B] mb-2 ">
            <User className="w-3.5 h-3.5" />
            <span>Your workspace</span>
          </div>
          <h1 className="text-3xl font-light text-[#141923] tracking-tight">Settings</h1>
          <p className="text-sm text-[#364152]/70 mt-1">
            Manage your account, plan and research preferences.
          </p>
        </div>

        <button
          onClick={reloadProfile}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs text-[#141923] hover:text-[#89620B] border border-[#E5E7EB] bg-[#FFFFFF] rounded transition-colors self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {profileError && <p role="alert" className="p-4 border border-[#E0A526] text-sm">{profileError}</p>}
      {/* Account Info Section */}
      <section className="card-angular p-6 bg-[#FFFFFF]">
        <div className="flex items-center gap-2 mb-6">
          <User className="w-4 h-4 text-[#89620B]" />
          <h2 className="text-base font-normal text-[#141923]">Account Information</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div>
            <label className="block text-[#364152]/60  mb-1 font-medium">
              Email address
            </label>
            <div className="p-3 bg-white border border-[#E5E7EB] rounded text-[#141923] tabular-nums text-sm flex items-center justify-between">
              <span className="min-w-0 break-all mr-2">{profile?.email || (loading ? 'Loading…' : 'Unavailable')}</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-sans font-medium">
                {profile?.emailVerified ? 'Verified' : 'Unconfirmed'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[#364152]/60  mb-1 font-medium">
              Account ID
            </label>
            <div className="p-3 bg-white border border-[#E5E7EB] rounded text-[#141923] tabular-nums text-xs flex items-center justify-between">
              <span className="truncate mr-2">{profile?.id || '—'}</span>
              <button
                onClick={copyUserId}
                className="text-[#364152]/60 hover:text-[#89620B] transition-colors p-1"
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
            <label className="block text-[#364152]/60  mb-1 font-medium">
              Membership Class
            </label>
            <div className="p-3 bg-white border border-[#E5E7EB] rounded text-[#141923] flex items-center justify-between">
              <div className="flex items-center gap-2">
                {profile?.isFoundingMember ? (
                  <>
                    <Crown className="w-4 h-4 text-[#89620B]" />
                    <span className="font-medium text-[#89620B]">Founding Member</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-4 h-4 text-[#364152]/50" />
                    <span>Standard Member</span>
                  </>
                )}
              </div>
              {profile?.isFoundingMember && (
                <span className="text-[10px] bg-[#E0A526]/15 text-[#89620B] px-2 py-0.5 rounded font-medium">
                  Founding Member (1 of 100)
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[#364152]/60  mb-1 font-medium">
              Account Created
            </label>
            <div className="p-3 bg-white border border-[#E5E7EB] rounded text-[#141923] tabular-nums">
              {formatDate(profile?.createdAt)}
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Management Section */}
      <section className="card-angular p-6 bg-[#FFFFFF]">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#89620B]" />
            <h2 className="text-base font-normal text-[#141923]">Subscription Management</h2>
          </div>
          <span
            className={`text-xs px-2.5 py-1 rounded font-medium capitalize ${
              profile?.tier === 'max_premium'
                ? 'bg-[#E0A526]/20 text-[#141923] border border-[#E0A526]'
                : profile?.tier === 'premium'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-[#E5E7EB] text-[#364152]'
            }`}
          >
            {profile ? `${PLAN_CATALOG[profile.tier].name} (${formatUsd(PLAN_CATALOG[profile.tier].monthlyPriceUsd)}${profile.tier === 'free' ? '' : '/mo'})` : 'Loading plan…'}
          </span>
        </div>

        {/* Plan Status Banner */}
        <div className="bg-white border border-[#E5E7EB] rounded p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs divide-y md:divide-y-0 md:divide-x divide-[#E5E7EB]">
            <div className="pr-4">
              <span className="text-[#364152]/60  block mb-1">
                Current Plan Tier
              </span>
              <span className="text-xl tabular-nums font-light text-[#141923] capitalize">
                {profile ? PLAN_CATALOG[profile.tier].name : '—'}
              </span>
              <p className="text-[11px] text-[#364152]/60 mt-1">
                {profile?.tier === 'max_premium'
                  ? 'Launch and fundraising tools'
                  : profile?.tier === 'premium'
                  ? 'Full validation & pricing suite'
                  : 'Lite validation & manual canvas'}
              </p>
            </div>

            <div className="pt-3 md:pt-0 md:px-4">
              <span className="text-[#364152]/60  block mb-1">
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
              <p className="text-[11px] text-[#364152]/60 mt-1">
                {profile?.currentPeriodEnd
                  ? `Cycle ends ${formatDate(profile.currentPeriodEnd)}`
                  : 'No renewal scheduled'}
              </p>
            </div>

            <div className="pt-3 md:pt-0 md:pl-4">
              <span className="text-[#364152]/60  block mb-1">
                Billing Actions
              </span>
              <div className="flex flex-col gap-2 mt-1">
                <button
                  onClick={() => openBilling()}
                  disabled={billingBusy || loading || !billing.credits || !profile?.subscriptionStatus}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-[#141923] bg-[#E5E7EB] hover:bg-[#E0A526] rounded transition-colors"
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
        <div className="border-t border-[#E5E7EB] pt-6">
          <h3 className="text-xs font-semibold  text-[#364152]/60 mb-4">
            Plan Upgrades & Downgrades
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pro Plan ($29/mo) */}
            <div
              className={`p-4 rounded border transition-colors ${
                profile?.tier === 'premium'
                  ? 'border-[#E0A526] bg-[#E0A526]/5'
                  : 'border-[#E5E7EB] bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-[#141923]">Premium ({formatUsd(PLAN_CATALOG.premium.monthlyPriceUsd)}/mo)</span>
                {profile?.tier === 'premium' && (
                  <span className="text-[10px] bg-[#E0A526] text-[#141923] font-bold px-2 py-0.5 rounded">
                    Active Plan
                  </span>
                )}
              </div>
              <p className="text-xs text-[#364152]/70 mb-4">
                {PLAN_CATALOG.premium.monthlyCredits.toLocaleString()} credits/mo, full validation, AI Lean Canvas, Pricing Simulator and CSV downloads. PDF and Word are included on every plan.
              </p>
              {profile?.tier === 'free' ? (
                <button
                  onClick={() => openBilling('premium')}
                  disabled={billingBusy || loading || !billing.premium}
                  className="w-full py-2 px-3 text-xs font-medium text-[#141923] bg-[#E5E7EB] hover:bg-[#E0A526] rounded transition-colors"
                >
                  {billing.premium ? `Upgrade to Premium (${formatUsd(PLAN_CATALOG.premium.monthlyPriceUsd)}/mo)` : 'Premium is coming soon'}
                </button>
              ) : (
                <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Plan Features Included
                </div>
              )}
            </div>

            {/* Max Plan ($79/mo) */}
            <div
              className={`p-4 rounded border transition-colors ${
                profile?.tier === 'max_premium'
                  ? 'border-[#E0A526] bg-[#E0A526]/5'
                  : 'border-[#E5E7EB] bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm text-[#141923]">Max Premium ({formatUsd(PLAN_CATALOG.max_premium.monthlyPriceUsd)}/mo)</span>
                {profile?.tier === 'max_premium' && (
                  <span className="text-[10px] bg-[#E0A526] text-[#141923] font-bold px-2 py-0.5 rounded">
                    Active Plan
                  </span>
                )}
              </div>
              <p className="text-xs text-[#364152]/70 mb-4">
                {PLAN_CATALOG.max_premium.monthlyCredits.toLocaleString()} credits/mo, Crowdfunding & Pitch Deck access, White-Label PDF, Portfolio ZIP, and PPTX export.
              </p>
              {profile?.tier !== 'max_premium' ? (
                <button
                  onClick={() => openBilling('max_premium')}
                  disabled={billingBusy || loading || !billing.maxPremium}
                  className="w-full py-2 px-3 text-xs font-semibold text-[#141923] bg-[#E0A526] hover:bg-[#b09048] rounded transition-colors"
                >
                  {billing.maxPremium ? `Upgrade to Max Premium (${formatUsd(PLAN_CATALOG.max_premium.monthlyPriceUsd)}/mo)` : 'Max Premium is coming soon'}
                </button>
              ) : (
                <div className="text-xs text-[#89620B] font-medium flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5" /> Highest Tier Active
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* AI Provider Selection Chain Section */}
      <section className="card-angular p-6 bg-[#FFFFFF]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#89620B]" />
            <h2 className="text-base font-normal text-[#141923]">AI research preferences</h2>
          </div>
          <span className="text-xs font-medium text-[#89620B] bg-[#E0A526]/15 px-2 py-0.5 rounded">
            Research access
          </span>
        </div>
        <p className="text-xs text-[#364152]/70 mb-6">
          Choose how the research team accesses models for your analyses.
        </p>

        <div className="space-y-4">
          {/* Mode 1: Default (Free Models Chain) */}
          <label
            className={`block p-4 rounded border cursor-pointer transition-colors ${
              aiProvider === 'free_models'
                ? 'border-[#E0A526] bg-white shadow-sm ring-1 ring-[#E0A526]'
                : 'border-[#E5E7EB] bg-white/70 hover:border-[#E0A526]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="aiProvider"
                value="free_models"
                checked={aiProvider === 'free_models'}
                onChange={() => setAiProvider('free_models')}
                className="mt-1 text-[#E0A526] focus:ring-[#E0A526]"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#141923]">
                    Automatic free models
                  </span>
                  <span className="text-[10px] font-bold  bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                    Recommended
                  </span>
                </div>
                <p className="text-xs text-[#364152]/70 mt-1">
                  Use the available free models selected for each research task. If one provider is unavailable, the team tries another within its request budget.
                </p>
                <div className="mt-3 p-2 bg-[#FFFFFF] rounded border border-[#E5E7EB] text-[11px] tabular-nums text-[#141923]">
                  <div className="text-[10px]  text-[#364152]/50 font-sans font-semibold mb-1">
                    How research works:
                  </div>
                  <div>Specialists reuse dated market knowledge, read public sources and check calculations. Free-model availability and quotas vary.</div>
                  <div className="mt-0.5">
                    Available models are selected for each task within the workspace request limits.
                  </div>
                </div>
              </div>
            </div>
          </label>

          {!freeOnly && <label
            className={`block p-4 rounded border cursor-pointer transition-colors ${
              aiProvider === 'paid_models'
                ? 'border-[#E0A526] bg-white shadow-sm ring-1 ring-[#E0A526]'
                : 'border-[#E5E7EB] bg-white/70 hover:border-[#E0A526]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="aiProvider"
                value="paid_models"
                checked={aiProvider === 'paid_models'}
                onChange={() => setAiProvider('paid_models')}
                className="mt-1 text-[#E0A526] focus:ring-[#E0A526]"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#141923]">
                    Operator-enabled models
                  </span>
                  <span className="text-[10px] font-bold  bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    Optional
                  </span>
                </div>
                <p className="text-xs text-[#364152]/70 mt-1">
                  Use the paid models enabled by the workspace operator. Availability depends on the configured providers.
                </p>
                <div className="mt-3 p-2 bg-[#FFFFFF] rounded border border-[#E5E7EB] text-[11px] tabular-nums text-[#141923]">
                  <div className="text-[10px]  text-[#364152]/50 font-sans font-semibold mb-1">
                    How research works:
                  </div>
                  <div>
                    Google → Anthropic → OpenAI, with configured models and request budgets
                  </div>
                </div>
              </div>
            </div>
          </label>}

          {/* Mode 3: Custom OpenRouter Key (BYOK) */}
          <label
            className={`block p-4 rounded border cursor-pointer transition-colors ${
              aiProvider === 'custom_openrouter'
                ? 'border-[#E0A526] bg-white shadow-sm ring-1 ring-[#E0A526]'
                : 'border-[#E5E7EB] bg-white/70 hover:border-[#E0A526]/40'
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="radio"
                name="aiProvider"
                value="custom_openrouter"
                checked={aiProvider === 'custom_openrouter'}
                onChange={() => setAiProvider('custom_openrouter')}
                className="mt-1 text-[#E0A526] focus:ring-[#E0A526]"
              />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-[#141923]">
                    Your OpenRouter account
                  </span>
                  <span className="text-[10px] font-bold  bg-purple-100 text-purple-800 px-2 py-0.5 rounded">
                    Personal quota
                  </span>
                </div>
                <p className="text-xs text-[#364152]/70 mt-1">
                  Use your personal OpenRouter quota. Workspace credits and request limits still apply.
                </p>
              </div>
            </div>
          </label>
        </div>

        {aiProvider === 'custom_openrouter' && <div className="mt-5 rounded-lg border border-[#E5E7EB] p-4">
          <label htmlFor="openrouter-key" className="block text-sm font-medium mb-2">OpenRouter API key</label>
          <div className="relative">
            <input id="openrouter-key" type={showApiKey ? 'text' : 'password'} value={customApiKey} onChange={event => setCustomApiKey(event.target.value)}
              placeholder={hasSavedKey ? 'A key is saved. Enter a replacement to change it.' : 'sk-or-v1-...'} maxLength={512} autoComplete="off" spellCheck={false}
              className="w-full min-h-11 px-3 py-2 pr-12 text-sm bg-white border border-[#E5E7EB] rounded" />
            <button type="button" onClick={() => setShowApiKey(!showApiKey)} aria-label={showApiKey ? 'Hide API key' : 'Show API key'} aria-pressed={showApiKey}
              className="absolute right-0 top-0 h-full w-11 grid place-items-center text-[#364152]/70">{showApiKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </div>
          <p className="text-xs text-[#364152]/70 mt-2">Stored encrypted on the server and used only for your analyses. Workspace credits and research limits still apply.</p>
        </div>}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {hasSavedKey && <button onClick={removeCustomKey} disabled={savingAiPrefs || loading || !profile} className="px-4 py-2 text-xs border border-[#E5E7EB] rounded">Remove stored key</button>}
          <button
            onClick={handleSaveAiPreferences}
            disabled={savingAiPrefs || loading || !profile}
            className="px-5 py-2 text-xs font-semibold bg-[#141923] text-[#FFFFFF] hover:bg-[#E0A526] hover:text-[#141923] rounded transition-colors inline-flex items-center gap-2"
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

      <section className="card-angular p-6">
        <div className="flex items-center gap-2 mb-3"><Bell size={17} className="text-[#89620B]" /><h2 className="text-base font-medium">Report notifications</h2></div>
        <p className="text-sm text-[#364152]/70 leading-relaxed">Track analyses from Your reports. Email alerts and digests are not available yet.</p>
      </section>

      {/* Account Security & Sign Out Section */}
      <PrivacyControls />
      <section className="card-angular p-6 bg-[#FFFFFF]">
        <div className="flex items-center gap-2 mb-6">
          <KeyRound className="w-4 h-4 text-[#89620B]" />
          <h2 className="text-base font-normal text-[#141923]">Security & Credentials</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 bg-white border border-[#E5E7EB] rounded mb-6">
          <div>
            <span className="text-xs font-medium text-[#141923] block">
              Change Password
            </span>
            <span className="text-[11px] text-[#364152]/60 mt-0.5 block">
              We will send a secure password reset link to your verified email address.
            </span>
          </div>

          <button
            onClick={handlePasswordReset}
            disabled={resettingPassword || loading || !profile}
            className="px-4 py-2 text-xs font-medium border border-[#E5E7EB] hover:border-[#E0A526] hover:bg-[#FFFFFF] text-[#141923] rounded transition-colors inline-flex items-center justify-center gap-2 shrink-0"
          >
            {resettingPassword ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#89620B]" />
            ) : (
              <KeyRound className="w-3.5 h-3.5 text-[#89620B]" />
            )}
            <span>Send Reset Email</span>
          </button>
        </div>

        <div className="pt-4 border-t border-[#E5E7EB] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-medium text-[#141923] block">
              Sign Out of Session
            </span>
            <span className="text-[11px] text-[#364152]/60 mt-0.5 block">
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
          <div className="card-angular p-6 bg-[#FFFFFF] max-w-md w-full shadow-xl border border-[#E5E7EB] relative">
            <button
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancellingSub}
              aria-label="Close cancellation dialog"
              className="absolute top-4 right-4 text-[#364152]/40 hover:text-[#141923]"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-[#141923]">Cancel Subscription?</h3>
                <p className="text-xs text-[#364152]/60">Confirm Subscription Modification</p>
              </div>
            </div>
            <p className="text-xs text-[#364152]/80 leading-relaxed mb-4">
              You will retain full access to all your current plan features, monthly compute credits, and export tools until <strong>{renewalDateDisplay}</strong>. After this date, your account will automatically revert to the Free tier.
            </p>
            <p className="text-xs text-[#364152]/60 leading-relaxed mb-6">
              Saved ideas, reports, and generated lean canvases will not be deleted.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setCancelDialogOpen(false)}
              disabled={cancellingSub}
                className="px-4 py-2 text-xs font-medium border border-[#E5E7EB] text-[#141923] rounded hover:bg-[#E5E7EB]"
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
          <Loader2 className="w-6 h-6 animate-spin text-[#E0A526]" />
        </div>
      }
    >
      <SettingsContent />
    </Suspense>
  )
}
