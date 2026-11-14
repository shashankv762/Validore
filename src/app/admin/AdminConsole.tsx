'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Activity, ArrowLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Coins, FileText, Gauge, LayoutDashboard, Loader2, LockKeyhole, LogOut, Menu, Search, Settings2, ShieldCheck, Users, X } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { toast } from 'sonner'
import type { AccountStatus, AdminAccountAction, AdminAuditEntry, AdminAuditResponse, AdminCreditGrant, AdminCreditType, AdminOverview, AdminPlan, AdminPlansResponse, AdminSettings, AdminSettingsResponse, AdminUser, AdminUserDetail, AdminUsersResponse } from '@/lib/admin-types'

type Section = 'overview' | 'accounts' | 'activity' | 'platform' | 'plans'
type Resource<T> = { data: T | null; loading: boolean; error: string | null }
const initial = <T,>(): Resource<T> => ({ data: null, loading: true, error: null })
const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'accounts', label: 'Accounts', icon: Users },
  { key: 'activity', label: 'Activity log', icon: Activity },
  { key: 'platform', label: 'Platform controls', icon: Settings2 },
  { key: 'plans', label: 'Plans & limits', icon: Gauge },
] as const
const CREDIT_LABELS: Record<AdminCreditType, string> = { general: 'General credits', crowdfunding: 'Crowdfunding runs', pitch_deck: 'Pitch deck runs' }
const ACTION_LABELS: Record<AdminAccountAction, string> = { block: 'Block account', unblock: 'Unblock account', deactivate: 'Deactivate account', reactivate: 'Reactivate account' }
const ACTION_EFFECTS: Record<AdminAccountAction, string> = {
  block: 'This account will lose access to the workspace. Its saved work and balances are retained. You can unblock it later.',
  unblock: 'This account will regain access to its workspace and retained balances.',
  deactivate: 'This account will lose access to the workspace. Its saved work and balances are retained. You can reactivate it later.',
  reactivate: 'This account will become active again with its saved work and retained balances.',
}
const PLAN_FEATURES: { key: keyof Pick<AdminPlan, 'canExportPdf' | 'canExportCsv' | 'canExportPptx' | 'canWhitelabelPdf' | 'canPortfolioExport' | 'canLeanCanvas' | 'canAiLeanCanvas' | 'canPricingSimulator' | 'canCrowdfunding' | 'canPitchDeck'>; label: string }[] = [
  { key: 'canExportPdf', label: 'PDF downloads' }, { key: 'canExportCsv', label: 'CSV downloads' }, { key: 'canExportPptx', label: 'PowerPoint downloads' },
  { key: 'canWhitelabelPdf', label: 'White-label PDF' }, { key: 'canPortfolioExport', label: 'Portfolio export' }, { key: 'canLeanCanvas', label: 'Manual Lean Canvas' },
  { key: 'canAiLeanCanvas', label: 'AI Lean Canvas' }, { key: 'canPricingSimulator', label: 'Pricing simulator' }, { key: 'canCrowdfunding', label: 'Crowdfunding' }, { key: 'canPitchDeck', label: 'Pitch deck' },
]

function date(value: string | null | undefined, time = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded'
  return new Date(value).toLocaleString('en-IN', { month: 'short', day: 'numeric', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) })
}
const number = (value: number) => value.toLocaleString('en-IN')
const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replaceAll('.', ' ')

class AdminRequestError extends Error {
  constructor(message: string, readonly status: number, readonly code: string | null) { super(message) }
}
const denied = (error: unknown) => error instanceof AdminRequestError && (error.status === 401 || error.status === 403 || error.code === 'not_found')
async function api<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch('/api/admin/' + path, {
    method: options.method ?? 'GET', cache: 'no-store', credentials: 'same-origin',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new AdminRequestError(data?.error || (response.status === 401 ? 'Your session expired. Sign in again to continue.' : response.status === 403 ? 'This account cannot open the command center.' : 'This request could not be completed. Please try again.'), response.status, data?.code ?? null)
  if (!data) throw new Error('The response was incomplete. Please try again.')
  return data as T
}

function Modal({ title, children, onClose, drawer = false, busy = false }: { title: string; children: ReactNode; onClose: () => void; drawer?: boolean; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])
  return <dialog ref={ref} className={'admin-dialog' + (drawer ? ' admin-drawer' : '')} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><h2>{title}</h2><button type="button" className="admin-icon-button" aria-label={'Close ' + title.toLowerCase()} disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
    {children}
  </dialog>
}

function Status({ status }: { status: AccountStatus }) { return <span className={'admin-status admin-status-' + status}>{status === 'active' ? <Check size={12} aria-hidden="true" /> : <LockKeyhole size={12} aria-hidden="true" />}{status}</span> }
function Feedback({ resource, retry }: { resource: Resource<unknown>; retry: () => void }) {
  return <>{resource.loading && <p className="admin-loading" role="status"><Loader2 size={17} aria-hidden="true" className="admin-spinner" />{resource.data ? 'Refreshing recorded data…' : 'Loading recorded data…'}</p>}
    {resource.error && <div className="admin-error" role="alert"><p>{resource.error}{resource.data ? ' The last loaded data is shown below.' : ''}</p><button type="button" className="admin-button" onClick={retry}>Try again</button></div>}</>
}
function Pagination({ page, totalPages, total, loading, onChange }: { page: number; totalPages: number; total: number; loading: boolean; onChange: (page: number) => void }) {
  return <div className="admin-pagination"><span>{number(total)} {total === 1 ? 'record' : 'records'}<span className="admin-muted"> · Page {page} of {Math.max(1, totalPages)}</span></span><div>
    <button type="button" aria-label="Previous page" className="admin-icon-button" disabled={loading || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
    <button type="button" aria-label="Next page" className="admin-icon-button" disabled={loading || page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight size={18} aria-hidden="true" /></button></div></div>
}
function AuditList({ entries, empty = 'No administration changes have been recorded yet.' }: { entries: AdminAuditEntry[]; empty?: string }) {
  return entries.length ? <ol className="admin-audit-list">{entries.map(entry => <li key={entry.id}><span className="admin-audit-dot" aria-hidden="true" /><div><div className="admin-audit-heading"><strong>{label(entry.action)}</strong><time dateTime={entry.createdAt}>{date(entry.createdAt, true)}</time></div>
    <p>{entry.targetEmail ?? 'Platform'}{entry.actorEmail && <span className="admin-muted"> · by {entry.actorEmail}</span>}</p>{entry.action === 'user.delete' && <p className="admin-audit-reason">{entry.details?.state === 'complete' ? 'Deletion completed' : entry.details?.state === 'failed' ? 'Deletion did not complete. The account remains deactivated; reopen it to retry.' : 'Deletion pending. Reopen this account to resume the request.'}</p>}<p className="admin-audit-reason">{entry.reason || 'No reason recorded'}</p>{entry.action === 'credits.grant' && typeof entry.details?.amount === 'number' && <p>{number(entry.details.amount)} {entry.details.type === 'crowdfunding' ? 'crowdfunding runs' : entry.details.type === 'pitch_deck' ? 'pitch deck runs' : 'general credits'} granted</p>}</div></li>)}</ol> : <p className="admin-empty">{empty}</p>
}

type Review =
  | { kind: 'credits'; grant: AdminCreditGrant; accounts: Pick<AdminUser, 'id' | 'email'>[] }
  | { kind: 'account'; action: AdminAccountAction; user: AdminUser; requestId: string }
  | { kind: 'delete'; user: AdminUser; requestId: string; resumeReason?: string }
  | { kind: 'settings'; settings: AdminSettings; previous: AdminSettings; requestId: string }
  | { kind: 'plans'; plans: AdminPlan[]; previous: AdminPlan[]; requestId: string }

export default function AdminConsole() {
  const router = useRouter()
  const [section, setSection] = useState<Section>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [overview, setOverview] = useState<Resource<AdminOverview>>(initial)
  const [users, setUsers] = useState<Resource<AdminUsersResponse>>(initial)
  const [audit, setAudit] = useState<Resource<AdminAuditResponse>>(initial)
  const [settings, setSettings] = useState<Resource<AdminSettingsResponse>>(initial)
  const [plans, setPlans] = useState<Resource<AdminPlansResponse>>(initial)
  const [settingsDraft, setSettingsDraft] = useState<AdminSettings | null>(null)
  const [plansDraft, setPlansDraft] = useState<AdminPlan[] | null>(null)
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [usersPage, setUsersPage] = useState(1)
  const [auditPage, setAuditPage] = useState(1)
  const [selected, setSelected] = useState<Map<string, AdminUser>>(new Map())
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Resource<AdminUserDetail>>(initial)
  const [grantAccounts, setGrantAccounts] = useState<Pick<AdminUser, 'id' | 'email'>[] | null>(null)
  const [grantType, setGrantType] = useState<AdminCreditType>('general')
  const [grantAmount, setGrantAmount] = useState('')
  const [grantReason, setGrantReason] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [reason, setReason] = useState('')
  const [typedEmail, setTypedEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [mutationError, setMutationError] = useState('')
  const [accessError, setAccessError] = useState('')
  const [attempted, setAttempted] = useState(false)
  const mutationPending = useRef(false)
  const requestKeys = useRef(new Map<string, string>())
  const heading = useRef<HTMLHeadingElement>(null)
  const menuToggle = useRef<HTMLButtonElement>(null)
  const retry = () => setRevision(value => value + 1)

  useEffect(() => {
    const controller = new AbortController()
    const load = async <T,>(path: string, setter: (value: Resource<T> | ((previous: Resource<T>) => Resource<T>)) => void, loaded?: (data: T) => void) => {
      setter(previous => ({ ...previous, loading: true, error: null }))
      try {
        const data = await api<T>(path, { signal: controller.signal })
        if (!controller.signal.aborted) { setter({ data, loading: false, error: null }); loaded?.(data) }
      } catch (error) { if (!controller.signal.aborted) { if (denied(error)) setAccessError((error as Error).message); setter(previous => ({ ...previous, data: denied(error) ? null : previous.data, loading: false, error: error instanceof Error ? error.message : 'Data could not be loaded.' })) } }
    }
    if (section === 'overview') void load('overview', setOverview)
    if (section === 'accounts') void load(`users?q=${encodeURIComponent(query)}&status=${status}&page=${usersPage}`, setUsers, data => setSelected(previous => {
      const next = new Map(previous)
      for (const user of data.users) if (next.has(user.id)) { if (user.isAdmin || user.accountStatus === 'deactivated') next.delete(user.id); else next.set(user.id, user) }
      return next
    }))
    if (section === 'activity') void load(`audit?page=${auditPage}`, setAudit)
    if (section === 'platform') void load('settings', setSettings, data => setSettingsDraft(data.settings))
    if (section === 'plans') void load('plans', setPlans, data => setPlansDraft(data.plans))
    return () => controller.abort()
  }, [section, query, status, usersPage, auditPage, revision])

  useEffect(() => {
    if (!detailId) return
    const controller = new AbortController()
    setDetail({ data: null, loading: true, error: null })
    void api<AdminUserDetail>('users/' + detailId, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setDetail({ data, loading: false, error: null }) })
      .catch(error => { if (!controller.signal.aborted) { if (denied(error)) setAccessError((error as Error).message); setDetail({ data: null, loading: false, error: error instanceof Error ? error.message : 'Account could not be loaded.' }) } })
    return () => controller.abort()
  }, [detailId, revision])

  const openReview = (next: Review) => { setReason(next.kind === 'delete' ? next.resumeReason ?? '' : ''); setTypedEmail(''); setMutationError(''); setAttempted(false); setReview(next) }
  const openDelete = (user: AdminUser, entries: AdminAuditEntry[]) => {
    const unfinished = entries.find(entry => entry.action === 'user.delete' && ['pending', 'failed'].includes(String(entry.details?.state)) && typeof entry.details?.requestId === 'string')
    openReview({ kind: 'delete', user, requestId: unfinished ? String(unfinished.details!.requestId) : crypto.randomUUID(), ...(unfinished ? { resumeReason: unfinished.reason } : {}) })
  }
  const openGrant = (accounts: Pick<AdminUser, 'id' | 'email'>[]) => { setGrantAccounts(accounts); setGrantAmount(''); setGrantReason(''); setGrantType('general') }
  const toggleSelection = (user: AdminUser) => setSelected(previous => {
    const next = new Map(previous)
    if (next.has(user.id)) next.delete(user.id); else next.set(user.id, user)
    return next
  })
  const eligibleUsers = users.data?.users.filter(user => !user.isAdmin && user.accountStatus !== 'deactivated') ?? []
  const allSelected = eligibleUsers.length > 0 && eligibleUsers.every(user => selected.has(user.id))
  const navigate = (next: Section) => {
    setSection(next); setMenuOpen(false)
    window.requestAnimationFrame(() => heading.current?.focus())
  }
  const perform = async () => {
    if (!review || busy || mutationPending.current) return
    const auditReason = review.kind === 'credits' ? review.grant.reason : reason.trim()
    if (auditReason.length < 3 || (review.kind === 'delete' && typedEmail !== review.user.email)) return
    const payload = review.kind === 'credits' ? { userIds: [...review.grant.userIds].sort(), type: review.grant.type, amount: review.grant.amount, reason: review.grant.reason }
      : review.kind === 'account' ? { userId: review.user.id, action: review.action, reason: auditReason }
      : review.kind === 'delete' ? { userId: review.user.id, email: typedEmail, reason: auditReason }
      : review.kind === 'settings' ? { settings: review.settings, reason: auditReason } : { plans: review.plans, reason: auditReason }
    const requestKey = JSON.stringify({ kind: review.kind, payload })
    const originalId = review.kind === 'credits' ? review.grant.requestId : review.requestId
    const requestId = requestKeys.current.get(requestKey) ?? originalId
    requestKeys.current.set(requestKey, requestId)
    mutationPending.current = true; setBusy(true); setAttempted(true); setMutationError('')
    try {
      if (review.kind === 'credits') await api('credits', { method: 'POST', body: { ...review.grant, requestId } })
      if (review.kind === 'account') await api('users/' + review.user.id, { method: 'PATCH', body: { action: review.action, reason: auditReason, requestId } })
      if (review.kind === 'delete') await api('users/' + review.user.id, { method: 'DELETE', body: { email: typedEmail, reason: auditReason, requestId } })
      if (review.kind === 'settings') await api('settings', { method: 'PATCH', body: { settings: review.settings, reason: auditReason, requestId } })
      if (review.kind === 'plans') await api('plans', { method: 'PUT', body: { plans: review.plans, reason: auditReason, requestId } })
      requestKeys.current.delete(requestKey)
      toast.success(review.kind === 'credits' ? `${number(review.grant.amount)} ${CREDIT_LABELS[review.grant.type].toLowerCase()} granted to ${review.accounts.length} ${review.accounts.length === 1 ? 'account' : 'accounts'}.` : review.kind === 'delete' ? 'Account permanently deleted.' : review.kind === 'account' ? ACTION_LABELS[review.action] + ' completed.' : 'Changes saved.')
      if (review.kind === 'delete') { setDetailId(null); setSelected(previous => { const next = new Map(previous); next.delete(review.user.id); return next }) }
      if (review.kind === 'credits') setSelected(new Map())
      setReview(null); retry()
      if (review.kind === 'settings') router.refresh()
    } catch (error) { if (denied(error)) setAccessError((error as Error).message); setMutationError(error instanceof Error ? error.message : 'This change could not be completed. Please try again.') }
    finally { mutationPending.current = false; setBusy(false) }
  }

  const currentSection = SECTIONS.find(item => item.key === section)!
  if (accessError) return <main className="admin-route-status"><h1>Command center unavailable</h1><p role="alert">{accessError}</p><Link className="admin-button admin-button-gold" href="/auth/signin?next=%2Fadmin">Sign in again</Link><Link className="admin-back-link" href="/dashboard">Open workspace</Link></main>
  return <div className="admin-shell">
    <a href="#admin-content" className="skip-link">Skip to command center</a>
    <header className="admin-mobile-header"><Brand light compact /><button ref={menuToggle} type="button" className="admin-icon-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="admin-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></header>
    <aside id="admin-navigation" className={'admin-navigation' + (menuOpen ? ' is-open' : '')} onKeyDown={event => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuToggle.current?.focus() } }}>
      <div className="admin-brand"><Brand light /><span><ShieldCheck size={13} aria-hidden="true" />Owner administration</span></div>
      <nav aria-label="Command center">{SECTIONS.map(({ key, label: text, icon: Icon }) => <button key={key} type="button" aria-current={section === key ? 'page' : undefined} className={'admin-nav-button' + (section === key ? ' is-active' : '')} onClick={() => navigate(key)}><Icon size={18} aria-hidden="true" />{text}{section === key && <span aria-hidden="true" />}</button>)}</nav>
      <div className="admin-navigation-bottom"><div className="admin-owner-access"><ShieldCheck size={18} aria-hidden="true" /><div><strong>Owner access</strong><span>Unlimited research allowance</span></div></div><Link href="/dashboard" className="admin-back-link"><ArrowLeft size={15} aria-hidden="true" />Founder workspace</Link><form method="post" action="/api/auth/signout"><button type="submit" className="admin-back-link admin-signout-button" disabled={busy}><LogOut size={15} aria-hidden="true" />Sign out</button></form></div>
    </aside>
    <main id="admin-content" className="admin-main" tabIndex={-1}>
      <div className="admin-topbar"><span><ShieldCheck size={15} aria-hidden="true" />Private command center</span><Link href="/dashboard">Open workspace<ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      <div className="admin-content">
        <header className="admin-page-heading"><div><h1 ref={heading} tabIndex={-1}>{currentSection.label}</h1><p>{section === 'overview' ? 'A clear view of your platform, its accounts, and the work in progress.' : section === 'accounts' ? 'Find an account, review its history, and manage access. Grant credits to up to 100 accounts at a time.' : section === 'activity' ? 'A record of administration changes, including who changed what and why.' : section === 'platform' ? 'Control announcements, workspace availability, and new registrations.' : 'Set plan prices, benefits, and operating limits.'}</p></div><button type="button" className="admin-button" onClick={retry}><Activity size={15} aria-hidden="true" />Refresh data</button></header>

        {section === 'overview' && <>
          <Feedback resource={overview} retry={retry} />
          {overview.data && <>
            <section className="admin-overview-metrics" aria-label="Account overview">{[
              { label: 'Registered accounts', value: overview.data.users.total, note: `${number(overview.data.users.newThisWeek)} joined this week` },
              { label: 'Active accounts', value: overview.data.users.active, note: 'Workspace access enabled' },
              { label: 'Blocked accounts', value: overview.data.users.blocked, note: 'Access paused' },
              { label: 'Deactivated accounts', value: overview.data.users.deactivated, note: 'Saved work retained' },
            ].map(item => <div key={item.label}><h2>{item.label}</h2><p>{number(item.value)}</p><span>{item.note}</span></div>)}</section>
            <div className="admin-overview-columns"><section className="admin-panel"><div className="admin-panel-heading"><h2>Research on the platform</h2><FileText size={17} aria-hidden="true" /></div><dl className="admin-research-stats"><div><dt>Saved ideas</dt><dd>{number(overview.data.activity.ideas)}</dd></div><div><dt>Validation reports</dt><dd>{number(overview.data.activity.reports)}</dd></div><div><dt>Research in progress</dt><dd>{number(overview.data.activity.activeJobs)}</dd></div><div><dt>Failed research jobs</dt><dd>{number(overview.data.activity.failedJobs)}</dd></div><div><dt>Credits granted by administration</dt><dd>{number(overview.data.activity.creditsGranted)}</dd></div></dl><button type="button" className="admin-text-button" onClick={() => navigate('accounts')}>Manage accounts<ArrowUpRight size={15} aria-hidden="true" /></button></section>
              <section className="admin-panel"><div className="admin-panel-heading"><h2>Recent administration changes</h2><button className="admin-text-button" type="button" onClick={() => navigate('activity')}>View all</button></div><AuditList entries={overview.data.recentActivity} /></section></div>
            <p className="admin-freshness">Recorded data as of {date(overview.data.updatedAt, true)}. Refresh to see the latest changes.</p>
          </>}
        </>}

        {section === 'accounts' && <>
          <form className="admin-account-search" onSubmit={event => { event.preventDefault(); setQuery(queryDraft.trim()); setUsersPage(1) }}><label className="admin-search-field"><span className="sr-only">Search accounts by email or ID</span><Search size={17} aria-hidden="true" /><input type="search" value={queryDraft} onInput={event => setQueryDraft(event.currentTarget.value)} placeholder="Search by email or account ID" maxLength={320} /></label><button className="admin-button" type="submit">Search</button><label className="admin-filter"><span>Status</span><select value={status} onChange={event => { setStatus(event.target.value); setUsersPage(1) }}><option value="all">All accounts</option><option value="active">Active</option><option value="blocked">Blocked</option><option value="deactivated">Deactivated</option></select></label></form>
          {selected.size > 0 && <div className="admin-selection-bar"><strong>{selected.size} {selected.size === 1 ? 'account selected' : 'accounts selected'}</strong><div><button type="button" className="admin-text-button" onClick={() => setSelected(new Map())}>Clear selection</button><button type="button" className="admin-button admin-button-gold" onClick={() => openGrant([...selected.values()])}><Coins size={15} aria-hidden="true" />Grant credits</button></div></div>}
          <Feedback resource={users} retry={retry} />
          {users.data && <section className="admin-panel admin-account-table-panel"><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th scope="col"><input type="checkbox" aria-label="Select all eligible accounts on this page" disabled={!eligibleUsers.length || users.loading} checked={allSelected} onChange={() => setSelected(previous => { const next = new Map(previous); for (const user of eligibleUsers) { if (allSelected) next.delete(user.id); else if (next.size < 100) next.set(user.id, user) } return next })} /></th><th scope="col">Account</th><th scope="col">Plan</th><th scope="col">Access</th><th scope="col" className="admin-align-right">Credits</th><th scope="col">Last active</th><th scope="col"><span className="sr-only">Account actions</span></th></tr></thead>
            <tbody>{users.data.users.length ? users.data.users.map(user => <tr key={user.id} className={selected.has(user.id) ? 'is-selected' : undefined}><td><input type="checkbox" aria-label={'Select ' + user.email} disabled={user.isAdmin || user.accountStatus === 'deactivated' || users.loading || (selected.size >= 100 && !selected.has(user.id))} checked={selected.has(user.id)} onChange={() => toggleSelection(user)} /></td><td><button type="button" className="admin-account-name" onClick={() => setDetailId(user.id)}>{user.email}{user.isAdmin && <span className="admin-owner-badge">Owner</span>}</button><span className="admin-account-id">Joined {date(user.createdAt)}</span></td><td>{user.isAdmin ? 'Owner' : label(user.tier)}</td><td><Status status={user.accountStatus} /></td><td className="admin-align-right admin-number">{user.isAdmin ? 'Unlimited' : number(user.creditBalance + user.purchasedCredits + user.rewardCredits)}</td><td className="admin-muted">{date(user.lastActiveAt)}</td><td><button type="button" className="admin-icon-button" aria-label={'View ' + user.email} onClick={() => setDetailId(user.id)}><ChevronRight size={18} aria-hidden="true" /></button></td></tr>) : <tr><td colSpan={7} className="admin-empty">No accounts match this search. Try a different email or status.</td></tr>}</tbody></table></div><Pagination page={users.data.page} totalPages={users.data.totalPages} total={users.data.total} loading={users.loading} onChange={setUsersPage} /></section>}
        </>}

        {section === 'activity' && <><Feedback resource={audit} retry={retry} />{audit.data && <section className="admin-panel"><AuditList entries={audit.data.entries} /><Pagination page={audit.data.page} totalPages={audit.data.totalPages} total={audit.data.total} loading={audit.loading} onChange={setAuditPage} /></section>}</>}

        {section === 'platform' && <><Feedback resource={settings} retry={retry} />{settingsDraft && settings.data && <form className="admin-settings-form" onSubmit={event => { event.preventDefault(); openReview({ kind: 'settings', settings: structuredClone(settingsDraft), previous: settings.data!.settings, requestId: crypto.randomUUID() }) }}>
          <section className="admin-panel"><div className="admin-panel-heading"><h2>Workspace announcement</h2><label className="admin-switch"><input type="checkbox" checked={settingsDraft.announcement.enabled} onChange={event => setSettingsDraft({ ...settingsDraft, announcement: { ...settingsDraft.announcement, enabled: event.target.checked } })} />Show announcement</label></div><p className="admin-description">Display a message across Validore, including public pages.</p><label className="admin-field">Announcement message<textarea maxLength={1000} rows={3} value={settingsDraft.announcement.message} onInput={event => setSettingsDraft({ ...settingsDraft, announcement: { ...settingsDraft.announcement, message: event.currentTarget.value } })} required={settingsDraft.announcement.enabled} placeholder="Write a short update for founders" /></label></section>
          <section className="admin-panel"><div className="admin-panel-heading"><h2>Maintenance mode</h2><label className="admin-switch"><input type="checkbox" checked={settingsDraft.maintenance.enabled} onChange={event => setSettingsDraft({ ...settingsDraft, maintenance: { ...settingsDraft.maintenance, enabled: event.target.checked } })} />Pause workspace access</label></div><p className="admin-description">Temporarily pause workspace access for other accounts. Saved work and balances are retained. Owner access stays available.</p><label className="admin-field">Maintenance message<textarea maxLength={1000} rows={3} value={settingsDraft.maintenance.message} onInput={event => setSettingsDraft({ ...settingsDraft, maintenance: { ...settingsDraft.maintenance, message: event.currentTarget.value } })} required={settingsDraft.maintenance.enabled} placeholder="Explain when the workspace will be available again" /></label></section>
          <section className="admin-panel"><div className="admin-panel-heading"><h2>New registrations</h2><label className="admin-switch"><input type="checkbox" checked={settingsDraft.signupEnabled} onChange={event => setSettingsDraft({ ...settingsDraft, signupEnabled: event.target.checked })} />Accept new accounts</label></div><p className="admin-description">Existing accounts can continue signing in when new registrations are paused.</p></section>
          <div className="admin-save-bar"><p>Review changes and record a reason before saving.</p><button type="submit" className="admin-button admin-button-gold" disabled={settings.loading || JSON.stringify(settingsDraft) === JSON.stringify(settings.data.settings)}>Review platform changes</button></div>
        </form>}</>}

        {section === 'plans' && <><Feedback resource={plans} retry={retry} />{plansDraft && plans.data && <form onSubmit={event => { event.preventDefault(); openReview({ kind: 'plans', plans: structuredClone(plansDraft).map(plan => ({ ...plan, benefits: plan.benefits.map(benefit => benefit.trim()).filter(Boolean) })), previous: plans.data!.plans, requestId: crypto.randomUUID() }) }}>
          <div className="admin-plans-grid">{plansDraft.map((plan, index) => {
            const update = (patch: Partial<AdminPlan>) => setPlansDraft(previous => previous!.map((item, position) => position === index ? { ...item, ...patch } : item))
            return <section key={plan.tier} className="admin-panel admin-plan"><div className="admin-panel-heading"><h2>{label(plan.tier)}</h2><span className="admin-plan-tier">{plan.tier === 'free' ? 'Entry plan' : 'Subscription'}</span></div>
              <label className="admin-field">Display name<input required maxLength={60} value={plan.name} onChange={event => update({ name: event.target.value })} /></label>
              <div className="admin-form-grid"><label className="admin-field">Monthly price (USD)<input type="number" min="0" max="10000" step="0.01" required value={plan.monthlyPriceUsd} disabled={plan.tier === 'free'} onChange={event => update({ monthlyPriceUsd: Number(event.target.value) })} /></label><label className="admin-field">Credits per month<input type="number" min="0" max="10000000" step="1" required value={plan.monthlyCredits} onChange={event => update({ monthlyCredits: Number(event.target.value) })} /></label>
              <label className="admin-field">Included validation runs per month<input type="number" min="0" max="1000000" step="1" required value={plan.validationLimit} onChange={event => update({ validationLimit: Number(event.target.value) })} /></label><label className="admin-field">Active ideas<input type="number" min="0" max="1000000" step="1" required value={plan.activeIdeaLimit} onChange={event => update({ activeIdeaLimit: Number(event.target.value) })} /></label>
              <label className="admin-field">Concurrent research requests<input type="number" min="1" max="100" step="1" required value={plan.maxConcurrentRequests} onChange={event => update({ maxConcurrentRequests: Number(event.target.value) })} /></label><label className="admin-field">Maximum output tokens per call<input type="number" min="256" max="128000" step="1" required value={plan.maxTokensPerCall} onChange={event => update({ maxTokensPerCall: Number(event.target.value) })} /></label></div>
              <label className="admin-field">Listed benefits <span>One benefit per line</span><textarea rows={4} maxLength={4000} value={plan.benefits.join('\n')} onInput={event => update({ benefits: event.currentTarget.value.split('\n') })} /></label>
              <fieldset className="admin-feature-list"><legend>Included access</legend>{PLAN_FEATURES.map(feature => <label key={feature.key}><input type="checkbox" checked={plan[feature.key]} onChange={event => update({ [feature.key]: event.target.checked })} />{feature.label}</label>)}</fieldset>
              <label className="admin-switch admin-plan-availability"><input type="checkbox" checked={plan.advertised} onChange={event => update({ advertised: event.target.checked })} />Offer this plan to new accounts</label>
              {plan.tier !== 'free' && <label className="admin-field">Stripe monthly price ID<input maxLength={200} value={plan.stripePriceId ?? ''} onChange={event => update({ stripePriceId: event.target.value || null })} placeholder="price_…" autoComplete="off" /><span>Use a Stripe price with a matching USD monthly amount. Existing subscriptions keep their current billing price.</span></label>}
            </section>
          })}</div><div className="admin-save-bar"><p>Plan access changes affect current accounts. Monthly allocations apply on the next credit cycle.</p><button type="submit" className="admin-button admin-button-gold" disabled={plans.loading || JSON.stringify(plansDraft) === JSON.stringify(plans.data.plans)}>Review plan changes</button></div></form>}</>}
      </div><footer className="admin-footer"><span><ShieldCheck size={13} aria-hidden="true" />Owner access only</span><span>Changes are recorded with their reason.</span></footer>
    </main>

    {detailId && <Modal title="Account details" drawer onClose={() => setDetailId(null)}><div className="admin-dialog-body"><Feedback resource={detail} retry={retry} />{detail.data && <>
      <div className="admin-detail-identity"><span className="admin-avatar" aria-hidden="true">{detail.data.user.email[0]?.toUpperCase()}</span><h3>{detail.data.user.email}</h3><div><Status status={detail.data.user.accountStatus} />{detail.data.user.isAdmin && <span className="admin-owner-badge">Owner</span>}</div><p className="admin-account-id">{detail.data.user.id}</p></div>
      <dl className="admin-detail-facts"><div><dt>Plan</dt><dd>{detail.data.user.isAdmin ? 'Owner · unlimited' : label(detail.data.user.tier)}</dd></div><div><dt>Joined</dt><dd>{date(detail.data.user.createdAt)}</dd></div><div><dt>Last active</dt><dd>{date(detail.data.user.lastActiveAt, true)}</dd></div><div><dt>Subscription</dt><dd>{detail.data.user.subscriptionStatus ?? 'No subscription'}</dd></div>{detail.data.user.statusReason && <div><dt>Access change reason</dt><dd>{detail.data.user.statusReason}<span className="admin-muted"> · {date(detail.data.user.statusChangedAt, true)}</span></dd></div>}</dl>
      <section className="admin-detail-section"><h3>Recorded balances</h3><dl className="admin-balance-grid">{[
        ['Plan credits', detail.data.user.creditBalance], ['General credits', detail.data.user.purchasedCredits], ['Earned credits', detail.data.user.rewardCredits], ['Crowdfunding runs', detail.data.user.crowdfundingCredits], ['Pitch deck runs', detail.data.user.pitchDeckCredits],
      ].map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{number(Number(value))}</dd></div>)}</dl>{detail.data.user.isAdmin ? <p className="admin-description">Owner research uses an unlimited allowance. These balances are retained account records.</p> : detail.data.user.accountStatus === 'deactivated' ? <p className="admin-description">Reactivate this account before granting credits.</p> : <button type="button" className="admin-button admin-button-gold" onClick={() => openGrant([detail.data!.user])}><Coins size={15} aria-hidden="true" />Grant credits</button>}</section>
      <section className="admin-detail-section"><h3>Saved work</h3><dl className="admin-detail-facts"><div><dt>Ideas</dt><dd>{number(detail.data.stats.ideas)}</dd></div><div><dt>Reports</dt><dd>{number(detail.data.stats.reports)}</dd></div><div><dt>Validation runs</dt><dd>{number(detail.data.stats.validations)}</dd></div></dl></section>
      {!detail.data.user.isAdmin && <section className="admin-detail-section"><h3>Account access</h3><p className="admin-description">Access changes retain saved work and balances.</p><div className="admin-access-actions">{(detail.data.user.accountStatus === 'active' ? ['block', 'deactivate'] : detail.data.user.accountStatus === 'blocked' ? ['unblock', 'deactivate'] : ['reactivate']).map(action => <button key={action} type="button" className="admin-button" onClick={() => openReview({ kind: 'account', action: action as AdminAccountAction, user: detail.data!.user, requestId: crypto.randomUUID() })}>{ACTION_LABELS[action as AdminAccountAction]}</button>)}</div>{detail.data.user.accountStatus === 'deactivated' && <button type="button" className="admin-text-button admin-danger-text" onClick={() => openDelete(detail.data!.user, detail.data!.recentActivity)}>Permanently delete account</button>}</section>}
      <section className="admin-detail-section"><h3>Recent credit transactions</h3>{detail.data.recentCredits.length ? <ul className="admin-credit-history">{detail.data.recentCredits.map(entry => <li key={entry.id}><div><strong>{label(entry.transactionType)}</strong><span>{date(entry.createdAt, true)}</span></div><span className="admin-number">{entry.amount > 0 ? '+' : ''}{number(entry.amount)}</span></li>)}</ul> : <p className="admin-empty">No credit transactions have been recorded.</p>}</section>
      <section className="admin-detail-section"><h3>Administration history</h3><AuditList entries={detail.data.recentActivity} /></section>
    </>}</div></Modal>}

    {grantAccounts && <Modal title="Grant credits" onClose={() => setGrantAccounts(null)}><form className="admin-dialog-body" onSubmit={event => { event.preventDefault(); const amount = Number(grantAmount); if (!Number.isInteger(amount) || amount < 1 || amount > 10000000 || grantReason.trim().length < 3) return; openReview({ kind: 'credits', accounts: grantAccounts, grant: { userIds: grantAccounts.map(user => user.id), type: grantType, amount, reason: grantReason.trim(), requestId: crypto.randomUUID() } }); setGrantAccounts(null) }}><p className="admin-description">Grant the same allowance to each selected account.</p><ul className="admin-recipient-list">{grantAccounts.map(user => <li key={user.id}>{user.email}</li>)}</ul><label className="admin-field">Credit type<select value={grantType} onChange={event => setGrantType(event.target.value as AdminCreditType)}>{Object.entries(CREDIT_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select><span>{grantType === 'general' ? 'General credits never expire. Plan feature limits still apply.' : 'Each module credit pays for one run of that module.'}</span></label><label className="admin-field">Amount per account<input type="number" min="1" max="10000000" step="1" required autoFocus value={grantAmount} onInput={event => setGrantAmount(event.currentTarget.value)} /></label><label className="admin-field">Reason<textarea rows={3} minLength={3} maxLength={1000} required value={grantReason} onInput={event => setGrantReason(event.currentTarget.value)} placeholder="Why are you granting this allowance?" /></label><div className="admin-dialog-actions"><button type="button" className="admin-button" onClick={() => setGrantAccounts(null)}>Cancel</button><button className="admin-button admin-button-gold" type="submit" disabled={!grantAmount || grantReason.trim().length < 3}>Review grant</button></div></form></Modal>}

    {review && <Modal title={review.kind === 'credits' ? 'Review credit grant' : review.kind === 'delete' ? 'Permanently delete account' : review.kind === 'account' ? ACTION_LABELS[review.action] : review.kind === 'settings' ? 'Review platform changes' : 'Review plan changes'} busy={busy} onClose={() => setReview(null)}><form className="admin-dialog-body" onSubmit={event => { event.preventDefault(); void perform() }}>
      {review.kind === 'credits' && <><p className="admin-review-amount">{number(review.grant.amount)}<span>{CREDIT_LABELS[review.grant.type].toLowerCase()} per account</span></p><p className="admin-description">{review.accounts.length} {review.accounts.length === 1 ? 'account' : 'accounts'} · {number(review.grant.amount * review.accounts.length)} total {review.grant.type === 'general' ? 'credits' : 'runs'}</p><ul className="admin-recipient-list">{review.accounts.map(user => <li key={user.id}>{user.email}</li>)}</ul><div className="admin-review-reason"><strong>Reason</strong><p>{review.grant.reason}</p></div><p className="admin-description">{review.grant.type === 'general' ? 'These credits are added to each account’s non-expiring general balance. Existing plan limits still apply.' : 'These runs are added to each account’s module balance.'}</p></>}
      {review.kind === 'account' && <><p className="admin-review-account">{review.user.email}</p><p className="admin-description">{ACTION_EFFECTS[review.action]}</p></>}
      {review.kind === 'delete' && <><p className="admin-review-account">{review.user.email}</p><div className="admin-delete-warning"><strong>This cannot be undone.</strong><p>The deactivated account and its saved work will be permanently deleted. Retained administration records identify the change.</p></div>{review.resumeReason && <p className="admin-description">Resuming the previously recorded deletion request with its original reason.</p>}<label className="admin-field">Type {review.user.email} to confirm<input type="text" autoComplete="off" spellCheck={false} disabled={attempted} value={typedEmail} onInput={event => setTypedEmail(event.currentTarget.value)} required /></label></>}
      {review.kind === 'settings' && <><p className="admin-description">These controls take effect after saving.</p><ul className="admin-change-list">
        {JSON.stringify(review.settings.announcement) !== JSON.stringify(review.previous.announcement) && <li><strong>Announcement: {review.settings.announcement.enabled ? 'visible' : 'hidden'}</strong><p>{review.settings.announcement.message || 'No message'}</p></li>}
        {JSON.stringify(review.settings.maintenance) !== JSON.stringify(review.previous.maintenance) && <li><strong>Workspace: {review.settings.maintenance.enabled ? 'paused for maintenance' : 'available'}</strong><p>{review.settings.maintenance.message || 'No maintenance message'}</p></li>}
        {review.settings.signupEnabled !== review.previous.signupEnabled && <li><strong>New registrations: {review.settings.signupEnabled ? 'open' : 'paused'}</strong></li>}
      </ul></>}
      {review.kind === 'plans' && <><p className="admin-description">Review the changed plans. Access changes affect current accounts; new credit allocations apply on the next cycle.</p><ul className="admin-change-list">{review.plans.filter(plan => JSON.stringify(plan) !== JSON.stringify(review.previous.find(item => item.tier === plan.tier))).map(plan => <li key={plan.tier}><strong>{plan.name}</strong><p>${plan.monthlyPriceUsd}/month · {number(plan.monthlyCredits)} credits per month · {number(plan.validationLimit)} included validation runs per month · {number(plan.activeIdeaLimit)} active ideas</p><p>{number(plan.maxConcurrentRequests)} concurrent requests · {number(plan.maxTokensPerCall)} maximum output tokens per call</p><p>Included: {PLAN_FEATURES.filter(feature => plan[feature.key]).map(feature => feature.label).join(', ') || 'No optional access'}</p><p>Listed benefits: {plan.benefits.filter(Boolean).join('; ') || 'None'}</p><p>{plan.advertised ? 'Offered to new accounts' : 'Unavailable to new accounts'}{plan.stripePriceId ? ` · Stripe price ${plan.stripePriceId}` : ''}</p></li>)}</ul></>}
      {review.kind !== 'credits' && <label className="admin-field">Reason for this change<textarea rows={3} minLength={3} maxLength={1000} disabled={attempted || (review.kind === 'delete' && Boolean(review.resumeReason))} value={reason} onInput={event => setReason(event.currentTarget.value)} required placeholder="Add a reason to the activity log" /></label>}
      {mutationError && <p className="admin-error" role="alert">{mutationError} You can retry this same request.</p>}
      <div className="admin-dialog-actions"><button type="button" className="admin-button" disabled={busy} onClick={() => setReview(null)}>Cancel</button><button type="submit" className={'admin-button ' + (review.kind === 'delete' ? 'admin-button-danger' : 'admin-button-gold')} disabled={busy || (review.kind !== 'credits' && reason.trim().length < 3) || (review.kind === 'delete' && typedEmail !== review.user.email)}>{busy && <Loader2 size={15} className="admin-spinner" aria-hidden="true" />}{busy ? 'Saving…' : review.kind === 'credits' ? 'Confirm grant' : review.kind === 'delete' ? 'Permanently delete' : review.kind === 'account' ? ACTION_LABELS[review.action] : 'Save changes'}</button></div>
    </form></Modal>}
  </div>
}
