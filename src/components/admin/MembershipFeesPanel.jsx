import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { NAVY, BLUE, money, StatusPill } from './specialistRevenueShared'
import { OnboardingListSkeleton } from '../shared/Skeleton'
import SandboxModeToggle from './SandboxModeToggle'
import StepEmailsChip from '../shared/StepEmailsChip'
import { MemberNameLink } from '../shared/personLinks'
import { MEMBER_TYPES, ACCOUNTANT_TYPES } from '../shared/memberTypes'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'

// Accounting > Members > Advisor/Accountant Membership Fees.
//
// Billing model: the member pays their FIRST payment at the setup link; their
// ongoing charge day = the day they paid (1st-15th; paying after the 15th
// skips a month then bills on the 1st). Charges are whole dollars (round half
// up). Renewal is always a 15th — the last 15th before their 1-year mark
// (transfers keep the renewal they already had). The schedule appears once
// they pay.
//
// Sections per category: Members (expandable reconciliation grid), Set Up
// Membership (input form incl. mid-year transfers and "Track billing on old
// system" — a plan only recorded here, never charged or emailed, its row
// statuses set by hand), Overdue Payments, Outstanding Payment Links (setup
// links never completed) and Renewals (by month).

const PLAN_STATUS = {
  setup_pending: { label: 'Awaiting first payment', color: '#0095ff' },
  active: { label: 'Active', color: '#16a34a' },
  canceled: { label: 'Canceled', color: '#6b7280' },
  terminated: { label: 'Terminated', color: '#ef4444' },
}

const SCHED_STATUS = {
  scheduled: { label: 'Scheduled', color: '#6b7280' },
  processing: { label: 'Processing', color: '#e06717' },
  paid: { label: 'Paid', color: '#16a34a' },
  missed: { label: 'Missed', color: '#ef4444' },
  declined: { label: 'Declined', color: '#ef4444' },
  waived: { label: 'Waived', color: '#6b7280' },
  canceled: { label: 'Canceled', color: '#6b7280' },
}

// Paused months (kind='pause' marker rows) get their own amber so a pause reads
// as a band in the grid without looking like a money row.
const PAUSE_COLOR = '#b45309'
const PAUSE_TINT = 'rgba(180,83,9,0.06)'

function fmtDate(d) {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// For timestamptz values (e.g. paid_at, setup_email_sent_at): parse the full
// timestamp and render the LOCAL calendar date, so an evening-ET payment shows
// on the day it happened rather than the UTC date. Same visual format as fmtDate.
function fmtStamp(d) {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayIso() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function addMonthsIso(dateIso, months) {
  let [y, m, d] = dateIso.split('-').map(Number)
  m += months
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function addDaysIso(dateIso, days) {
  const [y, m, d] = dateIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function addYearsIso(dateStr, years) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dim = new Date(y + years, m, 0).getDate()
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`
}

// Recurring charge dates after an immediate first payment on payDate: same day
// monthly when paid 1st-15th; paid after the 15th skips a month then the 1st.
function chargeDatesAfter(payDateIso, untilExclusive, max = 11) {
  const payDay = Number(payDateIso.slice(8, 10))
  const day = payDay <= 15 ? payDay : 1
  const startOffset = payDay <= 15 ? 1 : 2
  const anchor = payDateIso.slice(0, 8) + String(day).padStart(2, '0')
  const dates = []
  for (let i = 0; i < 24; i++) {
    const d = addMonthsIso(anchor, startOffset + i)
    if (untilExclusive && d >= untilExclusive) break
    dates.push(d)
    if (dates.length >= max) break
  }
  return dates
}

// Renewal = last 15th strictly before payDate + 12 months.
function renewalPreview(payDateIso) {
  const plus = addMonthsIso(payDateIso.slice(0, 8) + Math.min(Number(payDateIso.slice(8, 10)), 15), 12)
  if (Number(payDateIso.slice(8, 10)) > 15) return plus.slice(0, 8) + '15'
  return addMonthsIso(plus.slice(0, 8) + '15', -1)
}

// Charge slots a monthly transfer has left if it pays on payDateIso: the link
// itself plus every recurring date strictly before the fixed renewal. Mirrors
// transferLinkPulls in the backend's actions/membership/shared.ts.
function transferSlots(payDateIso, renewalIso) {
  return 1 + chargeDatesAfter(payDateIso, renewalIso, 23).length
}

function pullsAtLinkOn(payDateIso, renewalIso, remaining) {
  return 1 + Math.max(0, remaining - transferSlots(payDateIso, renewalIso))
}

// A transfer is quoted as-if-they-pay-today, but the real charge is recomputed
// from the ACTUAL pay date — slots run out as the fixed renewal approaches, so
// the amount at the link only grows. Finds the first future date where it does,
// so the admin sees how long the quote holds instead of trusting a stale number.
function catchUpCliff(fromIso, renewalIso, remaining) {
  const base = pullsAtLinkOn(fromIso, renewalIso, remaining)
  let d = fromIso
  for (let i = 0; i < 400; i++) {
    d = addDaysIso(d, 1)
    if (d >= renewalIso) return null
    const pulls = pullsAtLinkOn(d, renewalIso, remaining)
    if (pulls > base) return { date: d, pullsAtLink: pulls }
  }
  return null
}

// Every occurrence of day-of-month `day` STRICTLY AFTER basisIso, oldest first
// and stopping before the fixed renewal. Mirrors dayOccurrencesAfter in the
// backend's actions/membership/shared.ts (same 24-iteration cap; days are 1-15
// only, so the month never clamps). Same month only when its day-D has not
// passed yet — a save ON day D bills from the NEXT one.
function dayOccurrencesAfter(basisIso, day, untilExclusive) {
  const startOffset = Number(basisIso.slice(8, 10)) < day ? 0 : 1
  const anchor = basisIso.slice(0, 8) + String(day).padStart(2, '0')
  const dates = []
  for (let i = 0; i < 24; i++) {
    const d = addMonthsIso(anchor, startOffset + i)
    if (untilExclusive && d >= untilExclusive) break
    dates.push(d)
  }
  return dates
}

// The year-1 schedule for a monthly transfer that carries a fixed charge day:
// nothing at the link, every remaining month laid onto a day-D date before the
// renewal. Mirrors transferDaySchedule + placeMonths in the backend's shared.ts
// — BEHIND (more months owed than slots) folds the shortfall into the FIRST
// charge as one combined row, AHEAD just stops early, and with no slots at all
// the whole year collapses onto the save date itself.
function transferDaySchedule(basisIso, renewalIso, day, remaining) {
  // A year that has not started yet (renewal more than a year out) is charged
  // from its first day, never before it — mirrors transferYearStart in the
  // backend's shared.ts. Every other transfer: the basis date, as before.
  const yearStart = /^\d{4}-\d{2}-\d{2}/.test(renewalIso || '') ? addMonthsIso(renewalIso.slice(0, 10), -12) : null
  const slotBasis = yearStart && yearStart > basisIso ? addDaysIso(yearStart, -1) : basisIso
  const slotDates = dayOccurrencesAfter(slotBasis, day, renewalIso)
  const rowDates = slotDates.length === 0
    ? [basisIso]
    : slotDates.slice(0, Math.min(remaining, slotDates.length))
  const catchUpMonths = slotDates.length === 0
    ? remaining
    : 1 + Math.max(0, remaining - slotDates.length)
  return {
    slots: slotDates.length,
    payments: rowDates.length,
    catchUpMonths,
    firstChargeDate: rowDates[0],
    lastChargeDate: rowDates[rowDates.length - 1],
  }
}

function parseMoney(v) {
  const n = parseFloat(String(v ?? '').replace(/[,$]/g, ''))
  return Number.isFinite(n) ? n : 0
}

// Whole dollars, .50 rounds up.
function roundDollar(n) {
  return Math.round(n)
}

function monthsDiff(fromIso, toIso) {
  const [fy, fm] = fromIso.split('-').map(Number)
  const [ty, tm] = toIso.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

function fmtMonthYear(dateIso) {
  const [y, m] = dateIso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Bucket schedule rows into membership years, so the grid shows one year at a
// time once renewals accumulate. year_start (stamped by activate/sweep) is the
// authority: it survives a pause, which stretches a membership year past 12
// calendar months and would push late rows into the next 12-month window. Rows
// written before year_start existed (legacy) still fall back to that window,
// anchored on the earliest due date. Returns oldest → newest.
function bucketByYear(schedule) {
  if (!schedule.length) return []
  const firstDue = String(schedule[0].due_date).slice(0, 10)
  const groups = new Map()
  for (const row of schedule) {
    const due = String(row.due_date).slice(0, 10)
    const ys = row.year_start ? String(row.year_start).slice(0, 10) : null
    const key = ys || addMonthsIso(firstDue, Math.max(0, Math.floor(monthsDiff(firstDue, due) / 12)) * 12)
    if (!groups.has(key)) groups.set(key, { start: key, end: due, rows: [] })
    const g = groups.get(key)
    if (due > g.end) g.end = due
    g.rows.push(row)
  }
  return [...groups.values()]
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
    .map(g => {
      // A membership year runs 12 months unless a pause stretched it, so the
      // label ends at whichever is later: the nominal 12th month or the last row.
      const nominalEnd = addMonthsIso(g.start, 11)
      const end = g.end > nominalEnd ? g.end : nominalEnd
      return { label: `${fmtMonthYear(g.start)} – ${fmtMonthYear(end)}`, rows: g.rows }
    })
}

// Self-contained searchable single-select (same pattern as SpecialistPaymentInput).
function SearchSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const boxRef = useRef(null)

  useEffect(() => {
    function onDoc(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const selected = options.find(o => o.key === value)
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', color: selected ? 'var(--vfo-ink)' : 'var(--vfo-faint)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected ? selected.label : (placeholder || 'Select…')}</span>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '10px', zIndex: 50, boxShadow: '0 14px 36px rgba(20,45,95,0.16)', overflow: 'hidden' }}>
          <input type="search" name="search" autoComplete="off" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--vfo-tint)', fontSize: '13px', outline: 'none', fontFamily: 'Inter, sans-serif', background: 'var(--vfo-card)', color: 'var(--vfo-ink)' }} />
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {filtered.length === 0 && <div style={{ padding: '12px', fontSize: '12px', color: 'var(--vfo-faint)' }}>No matches</div>}
            {filtered.map(o => (
              <button key={o.key} type="button" onClick={() => { onChange(o.key); setOpen(false); setQuery('') }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', background: o.key === value ? 'var(--vfo-tint)' : 'transparent', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
                onMouseLeave={e => e.currentTarget.style.background = o.key === value ? 'var(--vfo-tint)' : 'transparent'}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '5px' }
const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', outline: 'none' }
const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)' }
const primaryBtn = (busy) => ({ padding: '8px 16px', borderRadius: '8px', border: 'none', background: busy ? '#c7d2e4' : `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)`, color: '#fff', fontWeight: 700, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif' })
const ghostBtn = { padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
const dangerBtn = { padding: '8px 16px', borderRadius: '8px', border: '1px solid #f3c0c0', background: 'var(--vfo-card)', color: '#b91c1c', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }

// isSuperadmin gates every money control (create/edit plans, payment links,
// auto-renew, terminate, reminders). Full-parity decision 2026-08-07: the Accounting
// tab mount sites pass canSeeTab('accounting'), so a granted admin works every control
// here — the tab grant, not superadmin, is the boundary. The prop name is kept so any
// future non-accounting mount can still pin it to the superadmin alone.
export default function MembershipFeesPanel({ title, category, allMembers = [], isSuperadmin = false, initialMemberNumber = null }) {
  const [section, setSection] = useState('members')
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editPlan, setEditPlan] = useState(null)
  const [sandboxConfig, setSandboxConfig] = useState(null)
  const [notice, setNotice] = useState(null)
  // Deep link from the renewal-meeting bell: open that member's plan card once.
  // The ref keeps a later reload/refresh from re-expanding it.
  const [focusMember, setFocusMember] = useState(initialMemberNumber || null)
  const focusConsumed = useRef(false)
  // A Renewals row opens its own plan card (a member can hold more than one plan).
  const [focusPlanId, setFocusPlanId] = useState(null)

  // Re-open draws the last plans for this category at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen(`membershipfees:${category}`)
    if (snap) { apply(snap); setError(''); setLoading(false) }
    load(!!snap)
  }, [category])

  useEffect(() => {
    if (initialMemberNumber && !focusConsumed.current) setFocusMember(initialMemberNumber)
  }, [initialMemberNumber])

  function apply(res) {
    setPlans(res.plans || [])
    setSandboxConfig(res.sandbox_config || null)
  }

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('membership_plans_load', { category })
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      apply(res)
      setLastSeen(`membershipfees:${category}`, res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  function startEdit(plan) {
    setEditPlan(plan)
    setSection('setup')
  }

  const pills = [
    { key: 'members', label: 'Members' },
    ...(isSuperadmin ? [{ key: 'setup', label: 'Set Up Membership' }] : []),
    { key: 'outstanding', label: 'Overdue Payments' },
    { key: 'outstanding_links', label: 'Outstanding Payment Links' },
    { key: 'renewals', label: 'Renewals' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1050px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · Members</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>{title}</h2>
          <SandboxModeToggle pipeline="MEMBER_MEMBERSHIP" label="Membership Fees" sandboxConfig={sandboxConfig} onChange={setSandboxConfig}
            note="Membership setup links + monthly pulls follow this toggle. Both Advisor and Accountant panels share the one MEMBER_MEMBERSHIP row." />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {pills.map(p => (
          <button key={p.key} type="button" onClick={() => { setSection(p.key); setNotice(null); if (p.key !== 'setup') setEditPlan(null) }}
            style={{ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (section === p.key ? 'transparent' : 'var(--vfo-border-strong)'), background: section === p.key ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)', color: section === p.key ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {p.label}
          </button>
        ))}
      </div>

      {notice && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', marginBottom: '14px', wordBreak: 'break-all',
          color: notice.tone === 'success' ? '#166534' : notice.tone === 'amber' ? '#b45309' : '#b91c1c',
          border: `1px solid ${notice.tone === 'success' ? '#bbf7d0' : notice.tone === 'amber' ? '#fde68a' : '#fecaca'}`,
          background: notice.tone === 'success' ? '#f0fdf4' : notice.tone === 'amber' ? '#fffbeb' : '#fef2f2' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)}
            style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, fontSize: '12.5px', fontWeight: 700, color: 'inherit', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>Dismiss</button>
        </div>
      )}

      {loading && <OnboardingListSkeleton rows={3} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && section === 'members' && (
        <MembersSection plans={plans} allMembers={allMembers} category={category} onChanged={load} onEdit={startEdit} isSuperadmin={isSuperadmin}
          focusMember={focusMember} focusPlanId={focusPlanId}
          onFocusConsumed={() => { focusConsumed.current = true; setFocusMember(null); setFocusPlanId(null) }} />
      )}
      {!loading && !error && section === 'setup' && isSuperadmin && (
        <SetupSection key={editPlan?.id || 'new'} category={category} allMembers={allMembers} plans={plans} editPlan={editPlan}
          onSaved={(n) => { setEditPlan(null); setSection('members'); load(); setNotice(n || null) }} />
      )}
      {!loading && !error && section === 'outstanding' && (
        <OutstandingSection plans={plans} isSuperadmin={isSuperadmin} />
      )}
      {!loading && !error && section === 'outstanding_links' && (
        <OutstandingLinksSection plans={plans} onChanged={load} onEdit={startEdit} isSuperadmin={isSuperadmin} />
      )}
      {!loading && !error && section === 'renewals' && (
        <RenewalsSection plans={plans} onRefresh={() => load()} onOpenPlan={(p) => { setFocusPlanId(p.id); setSection('members'); setNotice(null) }} />
      )}
    </div>
  )
}

// ── Members: the reconciliation list ──────────────────────────────────────────

function MembersSection({ plans, allMembers, category, onChanged, onEdit, isSuperadmin, focusMember, focusPlanId, onFocusConsumed }) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const filtered = plans.filter(p => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (p.member_name || '').toLowerCase().includes(q) || (p.member_number || '').toLowerCase().includes(q)
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or number…"
          style={{ ...input, width: '260px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...input, width: '210px' }}>
          <option value="all">All statuses</option>
          <option value="setup_pending">Awaiting first payment</option>
          <option value="active">Active</option>
          <option value="canceled">Canceled</option>
          <option value="terminated">Terminated</option>
        </select>
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{filtered.length} plan{filtered.length === 1 ? '' : 's'}</span>
      </div>

      {filtered.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No membership plans yet — create one under Set Up Membership.
        </div>
      )}
      {filtered.map(p => (
        <PlanCard key={p.id} plan={p} allMembers={allMembers} category={category} onChanged={onChanged} onEdit={onEdit} isSuperadmin={isSuperadmin}
          autoOpen={focusPlanId ? p.id === focusPlanId : !!focusMember && String(p.member_number) === String(focusMember)}
          onAutoOpened={onFocusConsumed} />
      ))}
    </div>
  )
}

function PlanCard({ plan, allMembers = [], category, onChanged, onEdit, isSuperadmin, autoOpen = false, onAutoOpened }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [outcomeFor, setOutcomeFor] = useState(null)
  const cardRef = useRef(null)
  const autoOpenedRef = useRef(false)
  const [showTerminate, setShowTerminate] = useState(false)
  const [terminateFee, setTerminateFee] = useState('')
  const [showNextYear, setShowNextYear] = useState(false)
  const [nyAmount, setNyAmount] = useState(plan.next_year_amount ? String(plan.next_year_amount) : '')
  const [nyCredit, setNyCredit] = useState(plan.next_year_credit_note ? String(plan.next_year_credit_note) : '')
  const [nyType, setNyType] = useState(plan.next_year_member_type || plan.member?.member_type || '')
  const [showPause, setShowPause] = useState(false)
  const [pauseMonths, setPauseMonths] = useState('1')
  const [pausePreview, setPausePreview] = useState(null)
  const [pausePreviewBusy, setPausePreviewBusy] = useState(false)
  const [pauseErr, setPauseErr] = useState('')
  const pauseReqRef = useRef(0)
  // A tracked plan is "ended", not terminated — nothing is charged on the way out.
  const meta = plan.tracking_only && plan.status === 'terminated'
    ? { label: 'Ended', color: '#6b7280' }
    : PLAN_STATUS[plan.status] || { label: plan.status, color: 'var(--vfo-muted)' }
  const allSched = plan.schedule || []
  const years = useMemo(() => bucketByYear(allSched), [allSched])
  const [yearIdx, setYearIdx] = useState(-1) // -1 = latest (current) year
  const activeYear = years.length ? years[yearIdx === -1 ? years.length - 1 : yearIdx] : null
  const sched = activeYear ? activeYear.rows : []
  const currentRows = years.length ? years[years.length - 1].rows : []
  const payable = currentRows.filter(r => Number(r.amount_due) > 0 || (plan.paid_with_gc && r.kind === 'membership'))
  const paidCount = payable.filter(r => r.status === 'paid').length
  const missedCount = currentRows.filter(r => r.status === 'missed' || r.status === 'declined').length
  const perPull = Number(plan.per_pull_amount) || 0
  const m = plan.member || {}
  const closed = plan.status === 'canceled' || plan.status === 'terminated'
  // Billed on the old system — tracked only: no links, no charges, no emails.
  const tracking = !!plan.tracking_only
  const canMarkRows = tracking && isSuperadmin && plan.status === 'active'
  // Paid in Growth Credits (a Corporate Member, 2026-10-22): no money, no links;
  // each year the same credits come out of the same account.
  const gc = !!plan.paid_with_gc
  const gcCredits = Number(plan.gc_credits) || 0
  const gcPayer = (allMembers || []).find(x => x.member_number === plan.gc_payer_member_number)
  const gcPayerName = [gcPayer?.first_name, gcPayer?.last_name].filter(Boolean).join(' ')
  const gcFrom = plan.gc_payer_member_number && plan.gc_payer_member_number !== plan.member_number
    ? `from ${gcPayerName ? `${gcPayerName} (${plan.gc_payer_member_number})` : plan.gc_payer_member_number}`
    : 'from their own account'
  // A month-to-month VFO Associate / Financial Collaborator plan (portal licensing
  // L6b): the backend refuses Pause, Terminate and next year's terms on it, and
  // auto-renew is always on — it ends with 30 days' notice instead.
  const tier1 = !!plan.tier1_monthly
  const licence = tier1 ? (Number(allSched.find(r => Number(r.vfo_portal_licence_amount) > 0)?.vfo_portal_licence_amount) || 25) : 0
  const licenceOnly = tier1 && perPull === licence
  const payerNumber = tier1 && plan.paid_by_member_number && plan.paid_by_member_number !== plan.member_number ? plan.paid_by_member_number : null
  const payer = payerNumber ? (allMembers || []).find(x => x.member_number === payerNumber) : null
  const payerName = [payer?.first_name, payer?.last_name].filter(Boolean).join(' ')
  const endingOn = tier1 && !closed && plan.ending_on ? plan.ending_on : null
  // Month to month reads as months, not a 12-month year: the months that have
  // happened plus the next scheduled one. The later scheduled rows (the rolling
  // schedule) and rows cancelled by a notice are hidden here only.
  const nextDue = tier1 ? allSched.find(r => r.kind === 'membership' && r.status === 'scheduled') || null : null
  const shownSched = tier1
    ? allSched.filter(r => r === nextDue || (r.status !== 'scheduled' && !(r.status === 'canceled' && String(r.due_date).slice(0, 10) > todayIso())))
    : sched
  const tier1PaidCount = tier1 ? allSched.filter(r => r.kind === 'membership' && r.status === 'paid').length : 0
  const tier1Missed = tier1 && allSched.some(r => r.status === 'missed' || r.status === 'declined')
  // Header hint: any pause marker still dated today or later means the plan is
  // sitting inside (or about to enter) a pause. Deliberately simple — the marker
  // rows are only written by a pause and are removed with it.
  const pausedNow = allSched.some(r => r.kind === 'pause' && String(r.due_date).slice(0, 10) >= todayIso())
  const pauseMonthsNum = /^\d+$/.test(String(pauseMonths).trim()) ? Number(String(pauseMonths).trim()) : NaN
  const pauseMonthsValid = Number.isInteger(pauseMonthsNum) && pauseMonthsNum >= 1 && pauseMonthsNum <= 12

  // Renewal meetings (newest first from the backend). One open request at most.
  const meetings = plan.renewal_meetings || []
  const openMeeting = meetings.find(x => !x.completed_at) || null
  const doneMeetings = meetings.filter(x => x.completed_at)
  const showMeetings = meetings.length > 0 || !!plan.renewal_notice_for

  // Deep link from the renewal-meeting bell: expand this card and bring it into
  // view exactly once (the ref survives the reload that follows an outcome).
  useEffect(() => {
    if (!autoOpen || autoOpenedRef.current) return
    autoOpenedRef.current = true
    setOpen(true)
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    onAutoOpened?.()
  }, [autoOpen])

  // Known-value substitutions for the email previews (see StepEmailsChip).
  // Mirrors the setup-link handler exactly: [Amount] uses the annual value for
  // annual transfers (else per-pull), [Cadence] = per month/year, [Renewal Date]
  // = long-month UTC. Empty/unverifiable values are omitted (tokens stay chips).
  const emailCtx = (() => {
    const ctx = {}
    const first = ((m.first_name || '') || String(plan.member_name || '').split(' ')[0] || '').trim()
    if (first) ctx['First Name'] = first
    // A monthly transfer with a fixed charge day collects nothing at the link
    // either — the whole year is scheduled on that day.
    const saveOnly = Number(plan.per_pull_amount) <= 0 || (plan.transfer && plan.frequency === 'annual') ||
      (plan.transfer && plan.frequency === 'monthly' && Number(plan.charge_day) >= 1)
    const amt = saveOnly && plan.frequency === 'annual' ? Number(plan.annual_amount) : Number(plan.per_pull_amount || 0)
    if (Number.isFinite(amt) && amt > 0) ctx['Amount'] = `$${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    if (plan.frequency === 'monthly' || plan.frequency === 'annual') ctx['Cadence'] = plan.frequency === 'monthly' ? 'per month' : 'per year'
    if (plan.renewal_date) {
      const [ry, rm, rd] = String(plan.renewal_date).slice(0, 10).split('-').map(Number)
      if (ry && rm && rd) ctx['Renewal Date'] = new Date(Date.UTC(ry, rm - 1, rd)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    }
    return ctx
  })()

  async function run(action, payload, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return null
    setBusy(true); setMsg(null)
    try {
      const res = await callApi(action, payload)
      if (res?.ok) return res
      setMsg({ tone: 'error', text: res?.error || 'Action failed.' })
      return null
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Action failed.' })
      return null
    } finally {
      setBusy(false)
    }
  }

  async function sendLink() {
    const res = await run('membership_send_setup_link', { plan_id: plan.id })
    if (!res) return
    if (res.email_skipped) setMsg({ tone: 'amber', text: `Link ready, but the email template isn't seeded yet — send it manually: ${res.setup_link}` })
    else setMsg({ tone: 'success', text: `Setup email drafted for ${res.to_email}.` })
    onChanged?.()
  }

  // Active plans: same action, but the backend sends an update-payment-method
  // email and returns { update_link: true }. Amber (template not seeded) shape
  // is handled the same way as the setup path.
  async function sendUpdateLink() {
    const res = await run('membership_send_setup_link', { plan_id: plan.id })
    if (!res) return
    if (res.email_skipped) setMsg({ tone: 'amber', text: `Link ready, but the email template isn't seeded yet — send it manually: ${res.setup_link}` })
    else setMsg({ tone: 'success', text: `Update-method email created for ${res.to_email}.` })
    onChanged?.()
  }

  async function terminate() {
    const fee = parseMoney(terminateFee)
    const res = await run('membership_terminate', { plan_id: plan.id, termination_fee: fee },
      plan.paid_with_gc
        ? `Terminate ${plan.member_name}'s Growth Credit membership? It will not renew and no more credits are taken. Credits already used are not refunded.`
        : plan.tracking_only
        ? `End ${plan.member_name}'s membership? The remaining scheduled payments are canceled and it will not renew. Nothing is charged or emailed.`
        : fee > 0
        ? `Terminate ${plan.member_name}'s membership and charge a ${money(roundDollar(fee))} termination fee to their ${plan.payment_method_type === 'ach' ? 'bank account' : 'card'} on file right now?`
        : `Terminate ${plan.member_name}'s membership with no termination fee? Remaining scheduled payments are voided.`)
    if (!res) return
    if (res.fee_status === 'declined') setMsg({ tone: 'amber', text: `Plan terminated, but the fee charge FAILED: ${res.fee_error || 'declined'}. The declined fee row stays in the grid for follow-up.` })
    setShowTerminate(false)
    onChanged?.()
  }

  async function endWithNotice() {
    const res = await run('membership_end_with_notice', { plan_id: plan.id },
      `End ${plan.member_name}'s membership with 30 days' notice?\n\nIt ends on ${fmtDate(addDaysIso(todayIso(), 30))}. Payments due on or before that date are still collected; later ones are cancelled. No termination fee.\n\nThe End of Membership Confirmation email goes to the member${payerNumber ? ' (Cc the connected advisor)' : ''}.`)
    if (!res) return
    const finalLine = res.final_payment
      ? `Final payment ${money(res.final_payment.amount_due)} on ${fmtDate(res.final_payment.due_date)}.`
      : 'No further payments.'
    setMsg(res.emailed
      ? { tone: 'success', text: `Notice recorded — the membership ends ${fmtDate(res.ending_on)}. ${finalLine} End of Membership Confirmation email created.` }
      : { tone: 'amber', text: `Notice recorded — the membership ends ${fmtDate(res.ending_on)}. ${finalLine} The confirmation email could not be created — send it by hand.` })
    onChanged?.()
  }

  // Records what came out of the renewal meeting. 'cancel' turns auto-renew off
  // and drafts the cancellation confirmation email — hence the window.confirm,
  // same shape as the terminate flow.
  async function recordOutcome(meetingId, outcome) {
    const res = await run('membership_renewal_meeting_outcome', { meeting_id: meetingId, outcome },
      outcome === 'cancel'
        ? `Cancel ${plan.member_name}'s membership? Auto-renew will be turned off, the current year completes as contracted, and a cancellation confirmation email will be drafted.`
        : undefined)
    if (!res) return
    setOutcomeFor(null)
    setMsg({
      tone: 'success',
      text: outcome === 'cancel'
        ? 'Cancellation recorded — auto-renew is off and the confirmation email has been drafted.'
        : 'Meeting recorded — the membership continues.',
    })
    onChanged?.()
  }

  // Pause preview: refreshed whenever the panel is open and the month count is
  // usable. It keeps its own busy flag so the action row above stays clickable,
  // and a request token so a slow earlier reply can't overwrite a newer one.
  useEffect(() => {
    if (!showPause || !pauseMonthsValid) { setPausePreview(null); return }
    const token = ++pauseReqRef.current
    setPausePreviewBusy(true); setPauseErr('')
    callApi('membership_pause', { plan_id: plan.id, months: pauseMonthsNum, preview: true })
      .then(res => {
        if (token !== pauseReqRef.current) return
        if (res?.ok) setPausePreview(res)
        else { setPausePreview(null); setPauseErr(res?.error || 'Could not preview the pause.') }
      })
      .catch(e => {
        if (token !== pauseReqRef.current) return
        setPausePreview(null); setPauseErr(e?.message || 'Could not preview the pause.')
      })
      .finally(() => { if (token === pauseReqRef.current) setPausePreviewBusy(false) })
  }, [showPause, pauseMonthsValid, pauseMonthsNum, plan.id])

  // The confirm text spells out both moving parts (when payments restart, where
  // the renewal lands), same show-then-confirm shape as terminate.
  async function pausePayments() {
    if (!pauseMonthsValid || !pausePreview) return
    const resumeLine = pausePreview.resume_due_date
      ? `Payments continue on ${fmtDate(pausePreview.resume_due_date)}`
      : 'No upcoming payments this year — only the renewal date moves'
    const res = await run('membership_pause', { plan_id: plan.id, months: pauseMonthsNum },
      `Pause ${plan.member_name}'s membership payments for ${pauseMonthsNum} month${pauseMonthsNum === 1 ? '' : 's'}? ${resumeLine}. The renewal date moves to ${fmtDate(pausePreview.new_renewal_date)}.`)
    if (!res) return
    setShowPause(false); setPausePreview(null); setPauseErr('')
    setMsg({
      tone: 'success',
      text: `Payments paused for ${res.months} month${Number(res.months) === 1 ? '' : 's'}${res.resume_due_date ? ` — payments continue ${fmtDate(res.resume_due_date)}` : ''} · renewal now ${fmtDate(res.new_renewal_date)}.`,
    })
    onChanged?.()
  }

  async function saveNextYear(clear) {
    const res = await run('membership_next_year_save', clear
      ? { plan_id: plan.id, clear: true }
      : { plan_id: plan.id, next_year_amount: parseMoney(nyAmount), next_year_credit_note: parseMoney(nyCredit), next_year_member_type: nyType || undefined })
    if (!res) return
    setShowNextYear(false)
    // The terms are saved either way — a Gmail problem is amber, never an error.
    if (!clear) {
      if (res.tracking_only) setMsg({ tone: 'success', text: "Next year's terms saved — they apply at renewal. No email (billed on the old system)." })
      else if (res.email) setMsg({ tone: 'success', text: `Next year's terms saved — email ${res.email} to ${m.email || 'the member'}.` })
      else setMsg({ tone: 'amber', text: `Next year's terms saved, but the member email could not be drafted: ${res.email_error || 'unknown'}.` })
    }
    onChanged?.()
  }

  // Old-system tracked plans: an admin records what the old system did. Missed /
  // Declined puts the member In arrears (their revenue shares are held); anything
  // else clears it once no missed payment is left. A Paid row's date defaults to
  // its due date on the server.
  async function setRowStatus(row, status, paidDate) {
    const res = await run('membership_tracking_row_save', { row_id: row.id, status, paid_date: status === 'paid' ? (paidDate || undefined) : undefined })
    if (!res) return
    if (res.arrears_error) setMsg({ tone: 'amber', text: res.arrears_error })
    else if (res.arrears === 'set') setMsg({ tone: 'amber', text: `${plan.member_name} is now In arrears — their revenue-share payouts are held until every missed payment is marked Paid.` })
    else if (res.arrears === 'cleared') setMsg({ tone: 'success', text: `${plan.member_name} is no longer in arrears.` })
    onChanged?.()
  }

  const grid = '1.2fr 110px 110px 110px 120px 1.4fr'

  return (
    <div ref={cardRef} style={{ ...card, marginBottom: '10px', overflow: 'hidden', opacity: closed ? 0.7 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', width: '12px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <MemberNameLink memberNumber={plan.member_number}>{plan.member_name || plan.member_number}</MemberNameLink>
            {plan.transfer && <StatusPill label="Transferred" color={BLUE} />}
            {tracking && <StatusPill label="Old system" color="#6b7280" />}
            {gc && <StatusPill label="Growth Credits" color="#7c3aed" />}
            {tier1 && <StatusPill label="Month to month" color="#0d9488" />}
            {endingOn && <StatusPill label={`Ends ${fmtDate(endingOn)}`} color="#e06717" />}
            {openMeeting && <StatusPill label="Meeting requested" color="#e06717" />}
            {m.suspended && <StatusPill label="Suspended" color="#ef4444" />}
            {m.paused && <StatusPill label="Paused" color="#e06717" />}
            {m.membership_arrears && <StatusPill label="In arrears" color="#b45309" />}
            {/* Payments pause. Suppressed when the member record's own paused
                flag already renders an identically-worded pill. */}
            {pausedNow && <StatusPill label="Payments paused" color={PAUSE_COLOR} />}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
            {plan.member_number} · {plan.advisor_model || 'Model —'} · {m.member_type || '—'}
            {' · '}{gc
              ? `Annual (${gcCredits} GC/yr ${gcFrom})`
              : plan.frequency === 'monthly'
              ? `Monthly (${money(perPull)}/mo${plan.charge_day ? ` on the ${ordinal(plan.charge_day)}` : ''})`
              : `Annual (${money(perPull)}/yr)`}
            {tier1 ? (licenceOnly ? ' · VFO Portal licence only' : ` · incl. ${money(licence)} VFO Portal licence`) : ''}
            {payerNumber ? ` · Paid by ${payerName ? `${payerName} (${payerNumber})` : payerNumber}, connected advisor` : ''}
            {Number(plan.credit_note) > 0 ? ` · Credit note ${money(plan.credit_note)}` : ''}
            {plan.payment_method_type ? ` · ${plan.payment_method_type === 'ach' ? 'ACH' : 'Card'}${plan.acct_last4 ? ` ••${plan.acct_last4}` : ''}` : ''}
            {plan.next_year_amount ? ` · Next year ${money(plan.next_year_amount)}${Number(plan.next_year_credit_note) > 0 ? ` − ${money(plan.next_year_credit_note)} credit` : ''}${plan.next_year_member_type ? ` · ${plan.next_year_member_type}` : ''}` : ''}
            {plan.sandbox ? ' · Sandbox' : ''}
            {!plan.auto_renew && !closed && !tier1 ? ' · Auto-renew OFF' : ''}
            {plan.status === 'terminated' && Number(plan.termination_fee) > 0 ? ` · Termination fee ${money(plan.termination_fee)}` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{gc ? `${gcCredits} GC` : tier1 ? money(perPull) : money(plan.net_annual)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{gc ? 'per year' : tier1 ? 'per month' : 'net / year'}</div>
        </div>
        <div style={{ textAlign: 'right', width: '110px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>{plan.status === 'setup_pending' ? '—' : endingOn ? fmtDate(endingOn) : tier1 ? (nextDue ? fmtDate(nextDue.due_date) : '—') : fmtDate(plan.renewal_date)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{endingOn ? 'ends' : tier1 ? 'next payment' : 'renewal'}</div>
        </div>
        <div style={{ textAlign: 'right', width: '80px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: (tier1 ? tier1Missed : missedCount) ? '#ef4444' : 'var(--vfo-ink-2)' }}>
            {tier1 ? tier1PaidCount : payable.length ? `${paidCount}/${payable.length}` : '—'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>paid</div>
        </div>
        <div style={{ width: '170px', textAlign: 'right' }}>
          <StatusPill label={meta.label} color={meta.color} />
        </div>
      </div>

      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          {plan.status === 'setup_pending' ? (
            <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', padding: '4px 0 10px' }}>
              Awaiting their first payment — the month-by-month schedule appears once they pay at the setup link.
              Their charge day and renewal date are locked in from the day they pay.
            </div>
          ) : (
            <>
              {years.length > 1 && !tier1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>Membership year</span>
                  <select value={yearIdx === -1 ? years.length - 1 : yearIdx} onChange={e => setYearIdx(Number(e.target.value))}
                    onClick={e => e.stopPropagation()}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '12.5px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif' }}>
                    {years.map((yr, i) => (
                      <option key={yr.label} value={i}>{yr.label}{i === years.length - 1 ? ' (current)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
                <div>Period</div><div>Due date</div><div>Amount</div><div>Credit</div><div>Status</div><div style={{ textAlign: 'right' }}>Payment</div>
              </div>
              {shownSched.map(row => {
                // Pause markers ride in the same grid — positioned by due_date
                // among the real rows — so the paused months read as a band.
                // They carry no money, so every money cell is a muted dash.
                if (row.kind === 'pause') {
                  return (
                    <div key={row.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)', background: PAUSE_TINT, borderRadius: '6px' }}>
                      <div style={{ fontWeight: 600 }}>{row.period_label}</div>
                      <div>{fmtDate(row.due_date)}</div>
                      <div style={{ color: 'var(--vfo-faint)' }}>—</div>
                      <div style={{ color: 'var(--vfo-faint)' }}>—</div>
                      <div><StatusPill label="Paused" color={PAUSE_COLOR} /></div>
                      <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>—</div>
                    </div>
                  )
                }
                const sMeta = SCHED_STATUS[row.status] || { label: row.status, color: 'var(--vfo-muted)' }
                const zero = Number(row.amount_due) === 0
                const rowBg = row.status === 'paid' ? 'rgba(22,163,74,0.07)'
                  : (row.status === 'missed' || row.status === 'declined') ? 'rgba(239,68,68,0.07)' : 'transparent'
                return (
                  <div key={row.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)', background: rowBg, borderRadius: '6px' }}>
                    <div style={{ fontWeight: 600 }}>{row.period_label}</div>
                    <div>{fmtDate(row.due_date)}</div>
                    <div style={{ fontWeight: 600, color: zero && !gc ? 'var(--vfo-faint)' : 'var(--vfo-ink)' }}>
                      {gc && row.kind === 'membership' ? `${gcCredits} GC` : money(row.amount_due)}
                      {Number(row.vfo_portal_licence_amount) > 0 && (
                        <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--vfo-faint)' }}>
                          {Number(row.amount_due) === Number(row.vfo_portal_licence_amount) ? 'VFO Portal licence' : `incl. ${money(row.vfo_portal_licence_amount)} VFO Portal`}
                        </div>
                      )}
                    </div>
                    <div style={{ color: 'var(--vfo-faint)' }}>{Number(row.credit_applied) > 0 ? money(row.credit_applied) : '—'}</div>
                    <div>
                      {canMarkRows && row.kind === 'membership' ? (
                        <select value={row.status} disabled={busy} onChange={e => setRowStatus(row, e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: '99px', border: `1px solid ${sMeta.color}`, background: 'var(--vfo-card)', color: sMeta.color, fontSize: '11.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: busy ? 'wait' : 'pointer' }}>
                          {Object.entries(SCHED_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ) : (
                        <StatusPill label={zero && row.status === 'scheduled' ? 'Covered by credit' : sMeta.label} color={zero && row.status === 'scheduled' ? '#6b7280' : sMeta.color} />
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)', wordBreak: 'break-all' }}>
                      {gc && row.kind === 'membership' ? (
                        row.status === 'paid' ? `${row.paid_at ? `${fmtStamp(row.paid_at)} · ` : ''}Growth Credits` : '—'
                      ) : tracking ? (
                        row.status === 'paid' ? (
                          canMarkRows ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              Paid on
                              <input type="date" value={row.paid_at ? String(row.paid_at).slice(0, 10) : ''} disabled={busy}
                                onChange={e => e.target.value && setRowStatus(row, 'paid', e.target.value)}
                                style={{ padding: '3px 6px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '11.5px', fontFamily: 'Inter, sans-serif' }} />
                              · Old system
                            </span>
                          ) : `${row.paid_at ? `${fmtStamp(row.paid_at)} · ` : ''}Old system`
                        ) : '—'
                      ) : row.status === 'paid' || row.status === 'processing' ? (
                        <>
                          {row.paid_on_onboarding ? 'Paid at onboarding · ' : ''}
                          {row.paid_at ? `${fmtStamp(row.paid_at)} · ` : ''}
                          {row.payment_method_type ? `${row.payment_method_type}${row.acct_last4 ? ` ••${row.acct_last4}` : ''} · ` : ''}
                          {row.stripe_payment_intent_id || ''}
                        </>
                      ) : (row.failure_reason || '—')}
                    </div>
                  </div>
                )
              })}
              {!gc && <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '10px 6px 2px', borderTop: '2px solid var(--vfo-border)', marginTop: '4px', fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)' }}>
                <div>Totals</div>
                <div />
                <div>
                  {money(shownSched.reduce((s, r) => s + Number(r.amount_due || 0), 0))}
                  {tier1 && !licenceOnly && (
                    <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--vfo-faint)' }}>
                      incl. {money(shownSched.reduce((s, r) => s + Number(r.vfo_portal_licence_amount || 0), 0))} VFO Portal
                    </div>
                  )}
                </div>
                <div>{money(shownSched.reduce((s, r) => s + Number(r.credit_applied || 0), 0))}</div>
                <div style={{ color: 'var(--vfo-success-text-2)' }}>{money(shownSched.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount_due || 0), 0))} paid</div>
                <div />
              </div>}
              {tier1 && !closed && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
                  Bills monthly{plan.charge_day ? ` on the ${ordinal(plan.charge_day)}` : ''} until {endingOn ? fmtDate(endingOn) : 'the membership is ended'}.
                </div>
              )}
            </>
          )}

          {showMeetings && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ ...label, marginBottom: '8px' }}>Renewal meeting</div>

              {openMeeting && (
                <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--vfo-card)', border: '1px solid rgba(224,103,23,0.35)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <StatusPill label="Requested" color="#e06717" />
                    <span style={{ flex: 1, minWidth: '220px', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
                      Renewal meeting requested {fmtStamp(openMeeting.requested_at)} — renewal {fmtDate(openMeeting.renewal_date_for)}
                    </span>
                    {outcomeFor !== openMeeting.id && (
                      <button type="button" disabled={busy} style={primaryBtn(busy)} onClick={() => setOutcomeFor(openMeeting.id)}>
                        {busy ? 'Working…' : 'Meeting complete'}
                      </button>
                    )}
                  </div>
                  {outcomeFor === openMeeting.id && (
                    <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--vfo-tint)' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)', marginBottom: '10px' }}>What was the outcome of the meeting?</div>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button type="button" disabled={busy} style={{ ...ghostBtn, border: `1px solid ${BLUE}`, color: BLUE }}
                          onClick={() => recordOutcome(openMeeting.id, 'continue')}>
                          Continue membership
                        </button>
                        <button type="button" disabled={busy} style={dangerBtn}
                          onClick={() => recordOutcome(openMeeting.id, 'cancel')}>
                          Cancel membership
                        </button>
                        <button type="button" disabled={busy} style={ghostBtn} onClick={() => setOutcomeFor(null)}>Back</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {doneMeetings.map(mt => (
                <div key={mt.id} style={{ fontSize: '12px', color: 'var(--vfo-faint)', padding: '5px 0' }}>
                  Meeting {fmtStamp(mt.requested_at)} → {mt.outcome === 'cancel' ? 'Cancelled membership' : 'Continued membership'}
                  {mt.recorded_by ? ` · ${mt.recorded_by}` : ''}
                  {mt.completed_at ? ` · ${fmtStamp(mt.completed_at)}` : ''}
                </div>
              ))}

              {!openMeeting && plan.renewal_notice_for && (
                <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', padding: '5px 0' }}>
                  Renewal notice sent for {fmtDate(plan.renewal_notice_for)}
                </div>
              )}
            </div>
          )}

          {plan.pauses?.length > 0 && (
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ ...label, marginBottom: '8px' }}>Pauses</div>
              {plan.pauses.map(pz => (
                <div key={pz.id} style={{ fontSize: '12px', color: 'var(--vfo-faint)', padding: '5px 0' }}>
                  Paused {pz.months} month{Number(pz.months) === 1 ? '' : 's'} on {fmtStamp(pz.created_at)}
                  {pz.created_by ? ` by ${pz.created_by}` : ''}
                  {' — '}renewal {fmtDate(pz.old_renewal_date)} → {fmtDate(pz.new_renewal_date)}
                </div>
              ))}
            </div>
          )}

          {!closed && isSuperadmin && (
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {plan.status === 'setup_pending' && (
                <>
                  <button type="button" disabled={busy} onClick={sendLink} style={primaryBtn(busy)}>
                    {busy ? 'Working…' : (plan.setup_email_sent_at ? 'Resend payment setup link' : 'Send payment setup link')}
                  </button>
                  {plan.setup_email_sent_at && (
                    <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Link sent {fmtStamp(plan.setup_email_sent_at)}</span>
                  )}
                  <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); onEdit?.(plan) }}
                    style={{ ...ghostBtn, border: `1px solid ${BLUE}`, color: BLUE }}>
                    Edit plan
                  </button>
                  <button type="button" disabled={busy} style={dangerBtn}
                    onClick={() => run('membership_plan_cancel', { plan_id: plan.id, mode: 'cancel_now' }, 'Cancel this plan? It never took a payment, so it just gets closed.').then(r => r && onChanged?.())}>
                    Cancel plan
                  </button>
                </>
              )}
              {plan.status === 'active' && (
                <>
                  {!tracking && !gc && (
                    <button type="button" disabled={busy} onClick={sendUpdateLink} style={ghostBtn}>
                      {busy ? 'Working…' : 'Send payment update link'}
                    </button>
                  )}
                  {!tier1 && (
                    <button type="button" disabled={busy} style={ghostBtn}
                      onClick={() => run('membership_plan_cancel', { plan_id: plan.id, mode: plan.auto_renew ? 'auto_renew_off' : 'auto_renew_on' }).then(r => r && onChanged?.())}>
                      {plan.auto_renew ? 'Turn auto-renew off' : 'Turn auto-renew on'}
                    </button>
                  )}
                  {!gc && !tier1 && (
                    <button type="button" disabled={busy} style={ghostBtn} onClick={() => setShowNextYear(v => !v)}>
                      Edit next year's terms
                    </button>
                  )}
                  {!tracking && !gc && !tier1 && (
                    <button type="button" disabled={busy} style={ghostBtn} onClick={() => setShowPause(v => !v)}>
                      Pause Membership Payments
                    </button>
                  )}
                  {!tier1 ? (
                    <button type="button" disabled={busy} style={dangerBtn} onClick={() => setShowTerminate(v => !v)}>
                      {tracking ? 'End membership' : 'Terminate member'}
                    </button>
                  ) : endingOn ? (
                    <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Notice given — ends {fmtDate(endingOn)}. Payments due up to then are still collected.</span>
                  ) : (
                    <button type="button" disabled={busy} style={dangerBtn} onClick={endWithNotice}>
                      {busy ? 'Working…' : "End membership (30 days' notice)"}
                    </button>
                  )}
                </>
              )}
              {gc ? (
                <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="MEMBER_MEMBERSHIP_FEES" title="Growth Credit emails" context={emailCtx} templates={[
                  { name: 'MEMBERSHIP_gc_confirmation', when: 'Plan created — credits taken, to the member and the member they are connected to' },
                  { name: 'MEMBERSHIP_gc_renewal_notice', when: '30 days before renewal — renews on the same credits unless they reply to cancel' },
                ]} /></span>
              ) : tracking ? (
                <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--vfo-faint)' }}>Billed on the old system — no emails are sent and nothing is charged here.</span>
              ) : tier1 ? (
                <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="MEMBER_MEMBERSHIP_FEES" title="Monthly membership emails" context={emailCtx} templates={payerNumber ? [
                  { name: 'MEMBERSHIP_receipt_email|monthly|tier1_advisor_pays', when: 'Each month paid — receipt to the connected advisor' },
                  { name: 'MEMBERSHIP_payment_failed|tier1_advisor_pays', when: 'A month failed — to the connected advisor' },
                  { name: 'MEMBERSHIP_update_link', when: 'Update payment method link' },
                  { name: 'MEMBERSHIP_end_of_membership|tier1', when: "End membership (30 days' notice)" },
                ] : [
                  { name: 'MEMBERSHIP_receipt_email|monthly|tier1', when: 'Each month paid — receipt' },
                  { name: 'MEMBERSHIP_payment_failed', when: 'A month failed' },
                  { name: 'MEMBERSHIP_update_link', when: 'Update payment method link' },
                  { name: 'MEMBERSHIP_end_of_membership|tier1', when: "End membership (30 days' notice)" },
                ]} /></span>
              ) : (
                <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="MEMBER_MEMBERSHIP_FEES" title="Payment link emails" context={emailCtx} templates={[
                  { name: 'MEMBERSHIP_setup_link', when: 'New plan — payment setup link' },
                  { name: 'MEMBERSHIP_transfer_setup_link', when: 'Transfer plan — setup link' },
                  { name: 'MEMBERSHIP_transfer_setup_link|monthly-saveonly', when: 'Transfer plan with fixed charge day — setup link (save-only)' },
                  { name: 'MEMBERSHIP_update_link', when: 'Active plan — update payment method link' },
                  { name: 'MEMBERSHIP_next_year_terms', when: "Active plan — next year's terms saved" },
                ]} /></span>
              )}
            </div>
          )}

          {showNextYear && isSuperadmin && plan.status === 'active' && (
            <div style={{ marginTop: '12px', padding: '14px 16px', borderRadius: '10px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)' }}>
              <div style={{ ...label, marginBottom: '10px' }}>Next membership year (applies at renewal on {fmtDate(plan.renewal_date)})</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: '180px' }}>
                  <div style={label}>Annual value ($)</div>
                  <input value={nyAmount} onChange={e => setNyAmount(e.target.value)} placeholder={String(plan.annual_amount)} style={input} />
                </div>
                <div style={{ width: '180px' }}>
                  <div style={label}>Credit note ($)</div>
                  <input value={nyCredit} onChange={e => setNyCredit(e.target.value)} placeholder="0" style={input} />
                </div>
                <div style={{ width: '240px' }}>
                  <div style={label}>Member type from renewal</div>
                  {/* A legacy/retired type is prepended so an existing value never renders blank. */}
                  <select value={nyType} onChange={e => setNyType(e.target.value)} style={input}>
                    <option value="">—</option>
                    {(() => {
                      const opts = category === 'accountant' ? ACCOUNTANT_TYPES : MEMBER_TYPES
                      return (nyType && !opts.includes(nyType) ? [nyType, ...opts] : opts)
                        .map(t => <option key={t} value={t}>{t}</option>)
                    })()}
                  </select>
                </div>
                <button type="button" disabled={busy} style={primaryBtn(busy)} onClick={() => saveNextYear(false)}>{tracking ? 'Save' : <>Save &amp; email member</>}</button>
                {(plan.next_year_amount || plan.next_year_credit_note) && (
                  <button type="button" disabled={busy} style={ghostBtn} onClick={() => saveNextYear(true)}>Clear (use current terms)</button>
                )}
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
                {tracking
                  ? 'Billed on the old system — saving sends no email. '
                  : 'Saving emails the member a note confirming the new terms (Draft mode — it lands in Gmail Drafts for you to send). '}
                Unset = renews at the current annual value with no credit. Monthly amounts stay whole dollars (round half up).
              </div>
            </div>
          )}

          {showPause && isSuperadmin && plan.status === 'active' && (
            <div style={{ marginTop: '12px', padding: '14px 16px', borderRadius: '10px', background: 'var(--vfo-card)', border: `1px solid ${PAUSE_COLOR}55` }}>
              <div style={{ ...label, marginBottom: '10px', color: PAUSE_COLOR }}>Pause membership payments</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: '200px' }}>
                  <div style={label}>Pause for how many months?</div>
                  <input type="number" min="1" max="12" step="1" value={pauseMonths}
                    onChange={e => setPauseMonths(e.target.value)} style={input} />
                </div>
                <button type="button" disabled={busy || !pausePreview} style={primaryBtn(busy || !pausePreview)} onClick={pausePayments}>
                  {busy ? 'Working…' : 'Pause payments'}
                </button>
                <button type="button" disabled={busy} style={ghostBtn} onClick={() => { setShowPause(false); setPausePreview(null); setPauseErr('') }}>Cancel</button>
              </div>

              {!pauseMonthsValid && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#b91c1c' }}>Must be a whole number of months between 1 and 12.</div>
              )}
              {pauseMonthsValid && pausePreviewBusy && !pausePreview && (
                <div style={{ marginTop: '10px', fontSize: '12.5px', color: 'var(--vfo-faint)' }}>Working out the new dates…</div>
              )}
              {pauseMonthsValid && pauseErr && (
                <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#b91c1c' }}>{pauseErr}</div>
              )}
              {pauseMonthsValid && pausePreview && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--vfo-tint)', opacity: pausePreviewBusy ? 0.55 : 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>
                    {pausePreview.resume_due_date
                      ? `Payments continue on ${fmtDate(pausePreview.resume_due_date)}`
                      : 'No upcoming payments this year — only the renewal date moves'}
                  </div>
                  <div style={{ marginTop: '4px', fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>
                    Renewal date moves {fmtDate(pausePreview.old_renewal_date)} → {fmtDate(pausePreview.new_renewal_date)}
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
                    ({Number(pausePreview.rows_to_shift) || 0} upcoming payment{Number(pausePreview.rows_to_shift) === 1 ? '' : 's'} will each move {pausePreview.months} month{Number(pausePreview.months) === 1 ? '' : 's'} later)
                  </div>
                </div>
              )}
            </div>
          )}

          {showTerminate && isSuperadmin && plan.status === 'active' && (
            <div style={{ marginTop: '12px', padding: '14px 16px', borderRadius: '10px', background: 'var(--vfo-card)', border: '1px solid #f3c0c0' }}>
              <div style={{ ...label, marginBottom: '10px', color: '#b91c1c' }}>{tracking ? `End ${plan.member_name}'s membership` : `Terminate ${plan.member_name}`}</div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {!tracking && !gc && (
                  <div style={{ width: '200px' }}>
                    <div style={label}>Termination fee ($, 0 = none)</div>
                    <input value={terminateFee} onChange={e => setTerminateFee(e.target.value)} placeholder="e.g. 2500" style={input} />
                  </div>
                )}
                <button type="button" disabled={busy} onClick={terminate}
                  style={{ ...primaryBtn(busy), background: busy ? '#c7d2e4' : '#ef4444' }}>
                  {busy ? 'Working…' : (tracking ? 'Confirm — end membership' : 'Confirm termination')}
                </button>
                <button type="button" disabled={busy} style={ghostBtn} onClick={() => setShowTerminate(false)}>Back</button>
              </div>
              <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
                {gc
                  ? 'The plan will not renew and no more Growth Credits are taken. Credits already used are not refunded.'
                  : tracking
                  ? 'The remaining scheduled payments are canceled and the plan will not renew. Nothing is charged or emailed.'
                  : <>The fee is charged to their saved {plan.payment_method_type === 'ach' ? 'bank account' : 'card'} immediately; all remaining scheduled payments are voided and the plan will not renew.</>}
              </div>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: '10px', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', wordBreak: 'break-all',
              color: msg.tone === 'success' ? '#166534' : msg.tone === 'amber' ? '#b45309' : '#b91c1c',
              border: `1px solid ${msg.tone === 'success' ? '#bbf7d0' : msg.tone === 'amber' ? '#fde68a' : '#fecaca'}`,
              background: msg.tone === 'success' ? '#f0fdf4' : msg.tone === 'amber' ? '#fffbeb' : '#fef2f2' }}>{msg.text}</div>
          )}
        </div>
      )}
    </div>
  )
}

function ordinal(n) {
  const v = Number(n) || 0
  const s = ['th', 'st', 'nd', 'rd']
  const m = v % 100
  return `${v}${s[(m - 20) % 10] || s[m] || s[0]}`
}

// ── Set Up Membership: the input form ─────────────────────────────────────────

function SetupSection({ category, allMembers, plans, editPlan, onSaved }) {
  const [memberNumber, setMemberNumber] = useState(editPlan?.member_number || '')
  // 'new' | 'transfer' | 'tracking' (billed on the old system, only tracked here).
  const [mode, setMode] = useState(editPlan?.transfer ? 'transfer' : 'new')
  const isTransfer = mode === 'transfer'
  const isTracking = mode === 'tracking'
  const [trackRenewal, setTrackRenewal] = useState('')
  const [trackDay, setTrackDay] = useState('')
  const [trackRows, setTrackRows] = useState([])
  const rowKey = useRef(0)
  const [transferRenewal, setTransferRenewal] = useState(editPlan?.transfer ? editPlan.renewal_date : '')
  const [priorPaid, setPriorPaid] = useState(
    editPlan?.prior_payments_made === 0 || editPlan?.prior_payments_made ? String(editPlan.prior_payments_made) : '',
  )
  const [chargeDay, setChargeDay] = useState(
    Number(editPlan?.charge_day) >= 1 ? String(editPlan.charge_day) : '',
  )
  // Brand new + "Year starts on": a member renewing from the old system whose
  // previous year is fully paid and whose NEW year has not started yet. Saved as
  // a day-scheduled transfer (charge day the 15th, renewal a year after the
  // start, 0 payments made; annual = charged at the start), so the real
  // anniversary is kept and nothing is taken before the year begins. A year that
  // has already started is Transfer from old billing's job, not this field's.
  const [yearStart, setYearStart] = useState('')
  const [frequency, setFrequency] = useState(editPlan?.frequency || 'monthly')
  const [annualAmount, setAnnualAmount] = useState(editPlan ? String(editPlan.annual_amount) : '')
  const [creditNote, setCreditNote] = useState(editPlan && Number(editPlan.credit_note) > 0 ? String(editPlan.credit_note) : '')
  const [creditMemo, setCreditMemo] = useState(editPlan?.credit_note_memo || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  // A Corporate Member's brand-new membership can be paid in Growth Credits
  // ('gc') instead of dollars ('usd', the default): annual only, no credit note,
  // taken from their own account or the member they are connected to.
  const [payIn, setPayIn] = useState('usd')
  const [gcCreditsIn, setGcCreditsIn] = useState('')
  const [gcPayer, setGcPayer] = useState('')
  const [gcPayers, setGcPayers] = useState(null)
  const [gcPayersErr, setGcPayersErr] = useState('')

  const liveNumbers = useMemo(() => new Set(
    plans.filter(p => p.status !== 'canceled' && p.status !== 'terminated' && p.id !== editPlan?.id).map(p => p.member_number)
  ), [plans, editPlan])

  const options = useMemo(() => {
    // Untagged members (corporate members etc.) are only ever advisors — they
    // appear in the advisor picker automatically and never in the accountant one.
    const pool = allMembers.filter(m =>
      (category === 'advisor' ? (m.member_category === 'advisor' || !m.member_category) : m.member_category === 'accountant') &&
      !liveNumbers.has(m.member_number)
    )
    return pool
      .map(m => ({
        key: m.member_number,
        label: `${m.last_name || ''}${m.last_name && m.first_name ? ', ' : ''}${m.first_name || ''} — ${m.member_number}${m.member_type ? ` (${m.member_type})` : ''}`,
        member: m,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allMembers, category, liveNumbers])

  const selected = allMembers.find(m => m.member_number === memberNumber)
  const gcOffered = !editPlan && mode === 'new' && selected?.member_type === 'Corporate Member'
  const useGc = gcOffered && payIn === 'gc'
  const gcCredits = Number(gcCreditsIn)
  const gcCreditsValid = Number.isFinite(gcCredits) && gcCredits > 0 && Math.abs(gcCredits * 4 - Math.round(gcCredits * 4)) < 1e-9
  const gcPayerRow = (gcPayers || []).find(p => p.member_number === gcPayer)

  useEffect(() => { if (!gcOffered) setPayIn('usd') }, [gcOffered])
  // Growth Credit memberships are annual — Monthly stays visible but disabled.
  useEffect(() => { if (useGc) setFrequency('annual') }, [useGc])
  useEffect(() => {
    setGcPayers(null); setGcPayersErr(''); setGcPayer('')
    if (!useGc || !memberNumber) return
    let live = true
    callApi('membership_gc_payers_load', { member_number: memberNumber })
      .then(res => {
        if (!live) return
        if (res?.ok) setGcPayers(res.payers || [])
        else setGcPayersErr(res?.error || 'Could not load the Growth Credit balances.')
      })
      .catch(e => { if (live) setGcPayersErr(e?.message || 'Could not load the Growth Credit balances.') })
    return () => { live = false }
  }, [useGc, memberNumber])

  const annual = parseMoney(annualAmount)
  const credit = parseMoney(creditNote)
  const net = Math.max(0, Math.round((annual - credit) * 100) / 100)
  const today = todayIso()
  const isAnchored = mode === 'new' && !useGc && !!yearStart
  // Everything below runs off these, so a Year-starts-on plan is quoted and
  // saved exactly like the transfer it is stored as.
  const xfer = isTransfer || isAnchored
  const yearStartIs15th = /^\d{4}-\d{2}-15$/.test(yearStart || '')
  const yearStartFuture = !!yearStart && yearStart > today
  const xferRenewal = !isAnchored ? transferRenewal
    : !yearStartIs15th ? ''
    : frequency === 'monthly' ? addYearsIso(yearStart, 1) : yearStart
  const xferPrior = isAnchored ? '0' : priorPaid
  const xferDay = isAnchored ? '15' : chargeDay
  // A monthly year may start up to a month ahead, so its renewal may be up to a
  // year and a month out — the backend allows exactly that (plan-save.ts).
  const transferRenewalLimit = frequency === 'monthly' ? addMonthsIso(today.slice(0, 8) + '15', 13) : addYearsIso(today, 1)
  const transferRenewalValid = /^\d{4}-\d{2}-15$/.test(xferRenewal || '') && xferRenewal > today && xferRenewal <= transferRenewalLimit

  // As-if-they-pay-today preview (the real dates lock in when they pay).
  const previewChargeDay = Number(today.slice(8, 10)) <= 15 ? Number(today.slice(8, 10)) : 1
  const previewRenewal = renewalPreview(today)
  const transferPullCount = xfer && transferRenewalValid && frequency === 'monthly'
    ? transferSlots(today, xferRenewal)
    : 0
  const priorPaidFilled = String(xferPrior).trim() !== ''
  const priorPaidValid = priorPaidFilled &&
    /^\d+$/.test(String(xferPrior).trim()) && Number(xferPrior) >= 0 && Number(xferPrior) <= 11
  // Everything else about a monthly transfer is derived from the payments they
  // already made — the backend does the same arithmetic, so keep them in step.
  const prior = priorPaidValid ? Number(xferPrior) : 0
  const remaining = 12 - prior
  // Fewer charge dates left than payments owed (a late-in-the-year transfer)
  // means the extra months ride along on the payment at the link.
  const pullsAtLink = 1 + Math.max(0, remaining - transferPullCount)
  const perPull = frequency === 'annual'
    ? roundDollar(xfer ? annual : net)
    : xfer
      ? (priorPaidValid ? Math.max(0, roundDollar(annual / 12 - credit / remaining)) : 0)
      : Math.max(0, roundDollar(net / 12))
  const linkAmount = pullsAtLink * perPull

  // The transfer quote is as-if-paid-today and only ever gets worse: slots run
  // out as the fixed renewal approaches, so a member who sits on the email pays
  // more at the link than the admin was shown. Surface both ends of that.
  const transferQuoteLive = xfer && frequency === 'monthly' && transferRenewalValid && priorPaidValid
  const cliff = useMemo(
    () => (transferQuoteLive ? catchUpCliff(today, xferRenewal, remaining) : null),
    [transferQuoteLive, today, xferRenewal, remaining],
  )
  // Year 1's last charge. An "ahead" transfer finishes well before the renewal,
  // so "until renewal" would overstate how long they keep paying.
  const lastChargeDate = transferQuoteLive
    ? (chargeDatesAfter(today, xferRenewal, 23)
      .slice(0, Math.max(0, remaining - pullsAtLink)).slice(-1)[0] || today)
    : null

  // The fixed charge day (1-15) a monthly transfer already pays on. Required —
  // it turns the link save-only and schedules the whole year on that day.
  const chargeDayFilled = String(xferDay).trim() !== ''
  const chargeDayValid = chargeDayFilled &&
    /^\d+$/.test(String(xferDay).trim()) && Number(xferDay) >= 1 && Number(xferDay) <= 15
  // Quoted as-if-they-save-today; the real dates are recomputed from the day
  // they actually save, exactly as the backend does from its own basis date.
  const daySched = transferQuoteLive && chargeDayValid
    ? transferDaySchedule(today, xferRenewal, Number(xferDay), remaining)
    : null

  // ── Track billing on old system ──────────────────────────────────────────
  // Any renewal day; payments on the 1st–15th. "Payments left this year" = every
  // payment day from today up to (not on) the renewal date, each (annual −
  // credit) ÷ 12 — the list is rebuilt whenever those inputs change, then the
  // admin can edit amounts, x out a row or add one for a weird case.
  const trackRenewalValid = /^\d{4}-\d{2}-\d{2}$/.test(trackRenewal || '') && trackRenewal > today && trackRenewal <= addYearsIso(today, 1)
  const trackDayValid = frequency === 'annual' || (/^\d+$/.test(String(trackDay)) && Number(trackDay) >= 1 && Number(trackDay) <= 15)
  const trackYearStart = trackRenewalValid ? addYearsIso(trackRenewal, -1) : null
  const trackPerPull = frequency === 'annual' ? roundDollar(net) : Math.max(0, roundDollar(net / 12))
  useEffect(() => {
    if (!isTracking || !trackRenewalValid || frequency !== 'monthly' || !trackDayValid) { setTrackRows([]); return }
    // On or after today: a payment due today may not have been recorded yet.
    const dates = dayOccurrencesAfter(addDaysIso(today, -1), Number(trackDay), trackRenewal)
    setTrackRows(dates.map(d => ({ key: ++rowKey.current, due_date: d, amount: String(trackPerPull) })))
  }, [isTracking, trackRenewal, trackDay, frequency, trackPerPull])

  const trackRowErrors = trackRows.map((r, i) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.due_date || '')) return 'Pick a date'
    if (trackRenewalValid && r.due_date >= trackRenewal) return 'On or after the renewal — that is next year'
    if (trackYearStart && r.due_date < trackYearStart) return 'Before this membership year started'
    if (trackRows.some((o, j) => j !== i && o.due_date === r.due_date)) return 'Two payments on the same date'
    if (String(r.amount).trim() === '' || !(parseMoney(r.amount) >= 0)) return 'Enter an amount'
    return null
  })

  function addTrackRow() {
    const last = [...trackRows].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(-1)[0]
    const day = frequency === 'monthly' && trackDayValid ? Number(trackDay) : 15
    const next = last?.due_date ? addMonthsIso(last.due_date, 1) : `${today.slice(0, 8)}${String(day).padStart(2, '0')}`
    setTrackRows(rows => [...rows, { key: ++rowKey.current, due_date: next, amount: String(trackPerPull) }])
  }

  async function saveTracking() {
    if (!trackRenewalValid) { setMsg({ tone: 'error', text: 'Enter their renewal date — in the future and within a year.' }); return }
    if (!trackDayValid) { setMsg({ tone: 'error', text: 'Pick the day of the month they pay on (1–15).' }); return }
    if (trackRowErrors.some(Boolean)) { setMsg({ tone: 'error', text: 'Fix the highlighted payments first.' }); return }
    setBusy(true)
    try {
      const res = await callApi('membership_tracking_plan_save', {
        member_number: memberNumber,
        category,
        frequency,
        annual_amount: annual,
        credit_note: credit,
        credit_note_memo: creditMemo || undefined,
        renewal_date: trackRenewal,
        charge_day: frequency === 'monthly' ? Number(trackDay) : 15,
        rows: trackRows.map(r => ({ due_date: r.due_date, amount_due: parseMoney(r.amount) })),
      })
      if (!res?.ok) { setMsg({ tone: 'error', text: res?.error || 'Could not save the plan.' }); return }
      onSaved?.({ tone: 'success', text: `Tracking plan created — ${res.rows} payment${res.rows === 1 ? '' : 's'} this year. Nothing was emailed or charged; set each payment's status on their plan card.` })
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not save the plan.' })
    } finally {
      setBusy(false)
    }
  }

  async function saveGc() {
    if (!gcCreditsValid) { setMsg({ tone: 'error', text: 'Enter how many Growth Credits — a number greater than 0 (whole or quarters).' }); return }
    if (!gcPayerRow) { setMsg({ tone: 'error', text: 'Pick whose Growth Credit account to take them from.' }); return }
    if (gcCredits > gcPayerRow.balance) { setMsg({ tone: 'error', text: `${gcPayerRow.name} only has ${gcPayerRow.balance} Growth Credits.` }); return }
    if (!window.confirm(`Take ${gcCredits} Growth Credits from ${gcPayerRow.name}'s account now and create ${selected?.first_name || 'this member'}'s annual membership?`)) return
    setBusy(true)
    try {
      const res = await callApi('membership_gc_plan_save', {
        member_number: memberNumber,
        category,
        gc_credits: gcCredits,
        payer_member_number: gcPayerRow.member_number,
      })
      if (!res?.ok) { setMsg({ tone: 'error', text: res?.error || 'Could not save the plan.' }); return }
      const base = `Membership created — ${gcCredits} Growth Credits taken from ${gcPayerRow.name} (${res.balance_after} left), renews ${fmtDate(res.renewal_date)}.`
      onSaved?.(res.email
        ? { tone: 'success', text: `${base} Confirmation email drafted.` }
        : { tone: 'amber', text: `${base} The confirmation email could not be drafted: ${res.email_error || 'unknown error'}.` })
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not save the plan.' })
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    setMsg(null)
    if (!memberNumber) { setMsg({ tone: 'error', text: 'Pick a member first.' }); return }
    if (useGc) { await saveGc(); return }
    if (!(annual > 0)) { setMsg({ tone: 'error', text: 'Enter the annual membership value.' }); return }
    if (isTracking) { await saveTracking(); return }
    if (isAnchored && !yearStartIs15th) { setMsg({ tone: 'error', text: 'The membership year must start on the 15th of a month — their anniversary.' }); return }
    if (isAnchored && !yearStartFuture) { setMsg({ tone: 'error', text: 'This membership year has already started — use Transfer from old billing (mid-year) instead.' }); return }
    if (isAnchored && !transferRenewalValid) {
      setMsg({ tone: 'error', text: frequency === 'monthly' ? 'The new membership year must start by next month.' : 'An annual membership year must start within a year.' })
      return
    }
    if (isTransfer && !transferRenewalValid) { setMsg({ tone: 'error', text: 'Enter the member\'s existing renewal date — it must be the 15th of a month, within a year.' }); return }
    if (isTransfer && frequency === 'monthly' && !priorPaidValid) {
      setMsg({ tone: 'error', text: priorPaidFilled ? 'Must be a whole number between 0 and 11.' : 'Enter how many payments they\'ve already made this year (0 if none).' })
      return
    }
    if (isTransfer && frequency === 'monthly' && !chargeDayValid) {
      setMsg({ tone: 'error', text: 'Pick the day of the month they currently pay on (1–15) — the whole remaining year is charged on that day.' })
      return
    }
    setBusy(true)
    try {
      const res = await callApi('membership_plan_save', {
        plan_id: editPlan?.id || undefined,
        member_number: memberNumber,
        category,
        frequency,
        transfer: xfer,
        annual_amount: annual,
        credit_note: credit,
        credit_note_memo: creditMemo || undefined,
        renewal_date: xfer ? xferRenewal : undefined,
        prior_payments_made: xfer && frequency === 'monthly' ? Number(xferPrior) : undefined,
        charge_day: xfer && frequency === 'monthly' ? Number(xferDay) : undefined,
      })
      if (!res?.ok) { setMsg({ tone: 'error', text: res?.error || 'Could not save the plan.' }); return }
      if (editPlan) { onSaved?.({ tone: 'success', text: 'Plan updated.' }); return }
      // Create: the plan now exists, so email failure is reported but never
      // reverts the save.
      try {
        const link = await callApi('membership_send_setup_link', { plan_id: res.plan_id })
        if (link?.email_skipped) onSaved?.({ tone: 'amber', text: `Plan created — link ready, but the email template isn't seeded yet — send it manually: ${link.setup_link}` })
        else if (link?.ok) onSaved?.({ tone: 'success', text: `Plan created — setup email drafted for ${link.to_email}.` })
        else onSaved?.({ tone: 'amber', text: `Plan created, but the setup email failed: ${link?.error || 'unknown error'}. Use "Send setup link" on their plan card to retry.` })
      } catch (e) {
        onSaved?.({ tone: 'amber', text: `Plan created, but the setup email failed: ${e?.message || 'unknown error'}. Use "Send setup link" on their plan card to retry.` })
      }
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not save the plan.' })
    } finally {
      setBusy(false)
    }
  }

  const chip = (active) => ({ padding: '9px 18px', borderRadius: '8px', border: '1px solid ' + (active ? 'transparent' : 'var(--vfo-border-strong)'), background: active ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)', color: active ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })

  return (
    <div style={{ ...card, padding: '20px' }}>
      {editPlan && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(18,94,204,0.08)', border: '1px solid rgba(18,94,204,0.25)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
          Editing the plan for <strong>{editPlan.member_name}</strong> — they haven't paid yet, so terms can still change.
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={label}>Which member is this for?</div>
        <SearchSelect options={options} value={memberNumber} onChange={setMemberNumber}
          placeholder={`Select a${category === 'advisor' ? 'n advisor' : 'n accountant'} member…`} />
      </div>

      {selected && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <StatusPill label={selected.advisor_model || 'Model unknown'} color={selected.advisor_model === 'New Model' ? '#7c3aed' : '#0095ff'} />
          <StatusPill label={selected.member_type || 'Type —'} color="#6b7280" />
          <StatusPill label={selected.elite_status || 'Active'} color={(selected.elite_status || 'Active') === 'Active' ? '#16a34a' : '#e06717'} />
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={label}>Is this a brand-new membership, or moving someone over from the old billing?</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" style={chip(mode === 'new')} onClick={() => setMode('new')}>Brand new membership</button>
          <button type="button" style={chip(isTransfer)} onClick={() => setMode('transfer')}>Transfer from old billing (mid-year)</button>
          {/* A pending plan being edited may already have had its setup link sent. */}
          {!editPlan && (
            <button type="button" style={chip(isTracking)} onClick={() => setMode('tracking')}>Track billing on old system</button>
          )}
        </div>
        {isTracking && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-muted)' }}>
            They stay on the old billing — this only records their membership here so everyone is in one place. Nothing is charged and no email is sent. You set each payment's status by hand on their plan card; it still auto-renews on the same terms.
          </div>
        )}
        {isTransfer && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-muted)' }}>
            {frequency === 'monthly'
              ? 'They already paid this year\'s earlier months on the old system — the setup link only saves their payment method, the payments they still owe are charged on the day of the month they already pay on until their existing renewal date, then they auto-renew at the full annual value.'
              : 'They already paid this year on the old system — nothing is collected at the setup link, it only saves their payment method, and they auto-renew at the full annual value on their existing renewal date.'}
          </div>
        )}
      </div>

      {gcOffered && (
        <div style={{ marginBottom: '12px' }}>
          <div style={label}>Annual membership value in</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={chip(!useGc)} onClick={() => setPayIn('usd')}>$</button>
            <button type="button" style={chip(useGc)} onClick={() => setPayIn('gc')}>GC</button>
          </div>
        </div>
      )}

      {useGc ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div>
            <div style={label}>How many Growth Credits?</div>
            <input type="number" min="0.25" step="0.25" value={gcCreditsIn} onChange={e => setGcCreditsIn(e.target.value)} placeholder="e.g. 40" style={input} />
            {String(gcCreditsIn).trim() !== '' && !gcCreditsValid && (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>Must be greater than 0, in whole credits or quarters (.25, .5, .75).</div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
          <div>
            <div style={label}>Annual membership value ($)</div>
            <input value={annualAmount} onChange={e => setAnnualAmount(e.target.value)} placeholder="e.g. 18000" style={input} />
          </div>
          <div>
            <div style={label}>Credit note ($, optional)</div>
            <input value={creditNote} onChange={e => setCreditNote(e.target.value)} placeholder="0" style={input} />
          </div>
          <div>
            <div style={label}>Credit note reason (optional)</div>
            <input value={creditMemo} onChange={e => setCreditMemo(e.target.value)} placeholder="e.g. earned via referrals in 2025" style={input} />
          </div>
        </div>
      )}

      {useGc && (
        <div style={{ marginBottom: '16px' }}>
          <div style={label}>Whose Growth Credit account are we depleting from?</div>
          {gcPayersErr ? (
            <div style={{ fontSize: '12.5px', color: '#b91c1c' }}>{gcPayersErr}</div>
          ) : !gcPayers ? (
            <div style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>Loading balances…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {gcPayers.map(p => {
                const short = gcCreditsValid && gcCredits > p.balance
                return (
                  <label key={p.member_number} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: short ? 'var(--vfo-faint)' : 'var(--vfo-ink-2)', cursor: short ? 'not-allowed' : 'pointer' }}>
                    <input type="radio" name="gc-payer" value={p.member_number} checked={gcPayer === p.member_number} disabled={short}
                      onChange={() => setGcPayer(p.member_number)} />
                    <span><strong>{p.name}</strong> ({p.member_number}){p.is_lead ? ' · connected member' : ''} — {p.balance} GC</span>
                    {short && <span style={{ fontSize: '12px', color: '#b45309' }}>not enough credits</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '16px' }}>
        <div>
          <div style={label}>Payment frequency</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Growth Credit memberships are annual only — no Monthly option. */}
            {!useGc && <button type="button" style={chip(frequency === 'monthly')} onClick={() => setFrequency('monthly')}>Monthly</button>}
            <button type="button" style={chip(frequency === 'annual')} onClick={() => setFrequency('annual')}>Annual</button>
          </div>
        </div>
        {mode === 'new' && !useGc && (
          <div>
            <div style={label}>Membership year starts on (optional)</div>
            <input type="date" value={yearStart} onChange={e => setYearStart(e.target.value)} style={input} />
            {yearStart && !yearStartIs15th ? (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>Must be the 15th of a month — their membership anniversary.</div>
            ) : yearStart && !yearStartFuture ? (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>This year has already started — use Transfer from old billing (mid-year) instead.</div>
            ) : yearStart && !transferRenewalValid ? (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>{frequency === 'monthly' ? 'Must start by next month.' : 'Must be within a year.'}</div>
            ) : (
              <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--vfo-ink-3)' }}>For a member renewing from the old system whose new year has not started yet: the day it starts (their anniversary). Keeps their real renewal date and charges nothing before it. Leave blank for a new member.</div>
            )}
          </div>
        )}
        {isTracking && (
          <div>
            <div style={label}>Their renewal date</div>
            <input type="date" value={trackRenewal} onChange={e => setTrackRenewal(e.target.value)} style={input} />
            {trackRenewal && !trackRenewalValid && (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>Must be in the future and within a year.</div>
            )}
          </div>
        )}
        {isTracking && frequency === 'monthly' && (
          <div>
            <div style={label}>Day of the month they pay on (1–15)</div>
            <select value={trackDay} onChange={e => setTrackDay(e.target.value)} style={input}>
              <option value="">Select a day…</option>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(d => (
                <option key={d} value={String(d)}>{ordinal(d)}</option>
              ))}
            </select>
          </div>
        )}
        {isTransfer && (
          <div>
            <div style={label}>Their existing renewal date (must be a 15th)</div>
            <input type="date" value={transferRenewal} onChange={e => setTransferRenewal(e.target.value)} style={input} />
            {transferRenewal && !transferRenewalValid && (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>Must be the 15th of a month, in the future and within a year.</div>
            )}
          </div>
        )}
        {isTransfer && frequency === 'monthly' && (
          <div>
            <div style={label}>Payments already made this year</div>
            <input
              type="number" min="0" max="11" step="1" placeholder="e.g. 6"
              value={priorPaid} onChange={e => setPriorPaid(e.target.value)} style={input}
            />
            {priorPaidFilled && !priorPaidValid ? (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>Must be a whole number between 0 and 11.</div>
            ) : (
              <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--vfo-ink-3)' }}>Under the old billing. The rest is worked out from this: 12 minus this number are still to be charged.</div>
            )}
          </div>
        )}
        {isTransfer && frequency === 'monthly' && (
          <div>
            <div style={label}>Day of the month they currently pay on (1–15)</div>
            <select value={chargeDay} onChange={e => setChargeDay(e.target.value)} style={input}>
              <option value="">Select a day…</option>
              {Array.from({ length: 15 }, (_, i) => i + 1).map(d => (
                <option key={d} value={String(d)}>{ordinal(d)}</option>
              ))}
            </select>
            {chargeDayFilled && !chargeDayValid ? (
              <div style={{ marginTop: '5px', fontSize: '12px', color: '#b91c1c' }}>Must be a whole number between 1 and 15.</div>
            ) : (
              <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--vfo-ink-3)' }}>The day they already pay on. The link only saves their payment method — every remaining payment is charged on this day.</div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '16px', padding: '14px 16px', borderRadius: '10px', background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
        <div style={{ ...label, marginBottom: '8px' }}>Plan preview</div>
        {useGc ? (
          !gcCreditsValid || !gcPayerRow ? (
            <div style={{ color: '#b45309' }}>Enter the Growth Credits and pick whose account they come from.</div>
          ) : (
            <div>
              <strong>{gcCredits} Growth Credits</strong> taken from <strong>{gcPayerRow.name}</strong> today
              {' '}({gcPayerRow.balance} → {Math.round((gcPayerRow.balance - gcCredits) * 100) / 100} left)
              {' · '}membership year {fmtDate(today)} to <strong>{fmtDate(previewRenewal)}</strong>
              {' · '}renews each year on the same credits from the same account, with a notice 30 days before
            </div>
          )
        ) : isTracking ? (
          !trackRenewalValid || !trackDayValid ? (
            <div style={{ color: '#b45309' }}>Enter their renewal date{frequency === 'monthly' ? ' and the day they pay on' : ''} to see the payments left this year.</div>
          ) : (
            <div>
              <div>
                Based on your inputs there {trackRows.length === 1 ? 'is' : 'are'} <strong>{trackRows.length} payment{trackRows.length === 1 ? '' : 's'}</strong> left this year
                {' · '}renewal <strong>{fmtDate(trackRenewal)}</strong>
                {frequency === 'annual' ? <> · next year's {money(trackPerPull)} is due at renewal</> : null}
                {credit > 0 ? <> · credit {money(credit)}</> : null}
              </div>
              {trackRows.length > 0 && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 140px 36px', gap: '8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '4px' }}>
                    <div>Month</div><div>Due date</div><div>Amount ($)</div><div />
                  </div>
                  {trackRows.map((r, i) => (
                    <div key={r.key} style={{ marginBottom: '6px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 140px 36px', gap: '8px', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600 }}>{/^\d{4}-\d{2}-\d{2}$/.test(r.due_date || '') ? fmtMonthYear(r.due_date) : '—'}</div>
                        <input type="date" value={r.due_date} onChange={e => setTrackRows(rows => rows.map(x => x.key === r.key ? { ...x, due_date: e.target.value } : x))}
                          style={{ ...input, padding: '7px 10px' }} />
                        <input value={r.amount} onChange={e => setTrackRows(rows => rows.map(x => x.key === r.key ? { ...x, amount: e.target.value } : x))}
                          style={{ ...input, padding: '7px 10px' }} />
                        <button type="button" title="Remove this payment" onClick={() => setTrackRows(rows => rows.filter(x => x.key !== r.key))}
                          style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #f3c0c0', background: 'var(--vfo-card)', color: '#b91c1c', fontWeight: 700, fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>✕</button>
                      </div>
                      {trackRowErrors[i] && <div style={{ marginTop: '3px', fontSize: '12px', color: '#b91c1c' }}>{trackRowErrors[i]}</div>}
                    </div>
                  ))}
                  <div style={{ marginTop: '6px', fontSize: '12.5px', fontWeight: 700 }}>
                    Total this year {money(trackRows.reduce((s, r) => s + parseMoney(r.amount), 0))}
                  </div>
                </div>
              )}
              <button type="button" onClick={addTrackRow} style={{ ...ghostBtn, marginTop: '10px', padding: '6px 12px', fontSize: '12.5px' }}>+ Add a payment</button>
              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
                Changing the renewal date, payment day or amounts above rebuilds this list.
              </div>
            </div>
          )
        ) : isAnchored && (!yearStartFuture || !transferRenewalValid) ? (
          <div style={{ color: '#b45309' }}>{yearStart && yearStartIs15th && !yearStartFuture ? 'This year has already started — use Transfer from old billing (mid-year).' : 'Enter the future date their new membership year starts (a 15th) to see the schedule.'}</div>
        ) : xfer ? (
          frequency === 'monthly' ? (
            (!transferRenewalValid || !priorPaidValid) ? (
              <div style={{ color: '#b45309' }}>Enter their existing renewal date and how many payments they've made to see the remaining schedule.</div>
            ) : daySched ? (
              <div>
                <div>
                  Paid {prior} of 12 — <strong>{remaining} × {money(perPull)}</strong> left on the <strong>{ordinal(Number(xferDay))}</strong> of each month.
                  {' '}<strong>Nothing is collected at the link</strong> — it only saves their payment method.
                  {credit > 0 ? <> · credit {money(credit)}</> : null}
                </div>
                <div style={{ marginTop: '6px' }}>
                  First charge <strong>{fmtDate(daySched.firstChargeDate)}</strong>
                  {' · '}{daySched.payments} payment{daySched.payments === 1 ? '' : 's'} remaining
                  {' · '}last charge <strong>{fmtDate(daySched.lastChargeDate)}</strong>
                  {' · '}renewal <strong>{fmtDate(xferRenewal)}</strong>
                </div>
                {daySched.catchUpMonths > 1 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309' }}>
                    Behind: the first charge on <strong>{fmtDate(daySched.firstChargeDate)}</strong> will be{' '}
                    <strong>{money(perPull * daySched.catchUpMonths)}</strong>, covering {daySched.catchUpMonths} months
                    ({daySched.catchUpMonths - 1}-month catch-up) — the same {remaining} payments still have to fit before the renewal.
                  </div>
                )}
                {daySched.slots === 0 && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309' }}>
                    No {ordinal(Number(xferDay))} is left before the renewal, so the whole balance is due as soon as they save their method.
                  </div>
                )}
              </div>
            ) : editPlan ? (
              // Legacy pending transfer saved before charge days existed: it
              // still pays at the link until a day is picked (which the save now
              // requires), so quote the old behaviour until then.
              <div>
                <div>
                  Paid {prior} of 12 — <strong>{remaining} × {money(perPull)}</strong> left: <strong>{money(linkAmount)}</strong> at the link
                  {pullsAtLink > 1 ? ` (includes ${pullsAtLink - 1}-month catch-up)` : ''}, then {remaining - pullsAtLink} monthly
                  {', last charge '}<strong>{fmtDate(lastChargeDate)}</strong>
                  {' · '}renewal <strong>{fmtDate(xferRenewal)}</strong>
                  {credit > 0 ? <> · credit {money(credit)}</> : null}
                </div>
                {cliff && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309' }}>
                    Based on payment today. On or after <strong>{fmtDate(cliff.date)}</strong> the link collects{' '}
                    <strong>{money(cliff.pullsAtLink * perPull)}</strong> ({cliff.pullsAtLink - 1}-month catch-up) — the same {remaining} payments
                    still have to fit before the renewal.
                  </div>
                )}
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#b45309' }}>
                  Pick the day of the month they pay on to switch this plan to a save-only link — it is now required to save.
                </div>
              </div>
            ) : (
              <div style={{ color: '#b45309' }}>Pick the day of the month they currently pay on to see the remaining schedule.</div>
            )
          ) : !transferRenewalValid ? (
            <div style={{ color: '#b45309' }}>Enter their existing renewal date to see the remaining schedule.</div>
          ) : (
            <div>Nothing due now · next charge <strong>{money(roundDollar(annual))}</strong> at renewal <strong>{fmtDate(xferRenewal)}</strong></div>
          )
        ) : (
          <div>
            <strong>{frequency === 'monthly' ? `12 × ${money(perPull)}` : `1 × ${money(perPull)}`}</strong>
            {credit > 0 ? <> ({money(annual)} − {money(credit)} credit)</> : null}
            {' · '}first payment at the link
            {net === 0 && annual > 0 ? ' (fully credited — link saves their payment method only)' : ''}
            {' · '}if paid today: {frequency === 'monthly' ? <>charge day the {ordinal(previewChargeDay)}, </> : null}renewal <strong>{fmtDate(previewRenewal)}</strong>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={save} style={{ ...primaryBtn(busy), padding: '10px 22px' }}>
          {busy ? 'Saving…' : (editPlan ? 'Save changes' : isTracking ? 'Create tracking plan' : 'Create membership plan')}
        </button>
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>
          {useGc
            ? 'The credits are taken straight away and the plan is active at once — no payment link. A confirmation email to the member and the member they are connected to is drafted in Gmail.'
            : isTracking
            ? 'Tracking only — no email, no payment link and no charge. The plan shows on the Members list straight away.'
            : 'Creating the plan also emails the member their payment setup link (resend anytime from the Members list). Legacy members pay no card fee; New Model card payments add the standard processing fee.'}
        </span>
      </div>
      {msg && <div style={{ marginTop: '10px', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', color: msg.tone === 'error' ? '#b91c1c' : '#166534', border: `1px solid ${msg.tone === 'error' ? '#fecaca' : '#bbf7d0'}`, background: msg.tone === 'error' ? '#fef2f2' : '#f0fdf4' }}>{msg.text}</div>}
    </div>
  )
}

// ── Renewals: who renews in a given month ─────────────────────────────────────

// A plan is listed for a month when its renewal_date falls in it (still to come,
// or past and waiting on the sweep), or when it already renewed in it: the sweep
// moves renewal_date a year on, so a renewal is found by a later membership year's
// year_start (the first year_start is the plan's first year, not a renewal).
const RENEWAL_STATE = {
  upcoming: { label: 'Upcoming', color: '#0095ff' },
  pending: { label: 'Renewal pending', color: '#e06717' },
  not_renewing: { label: 'Auto-renew off', color: '#ef4444' },
  renewed: { label: 'Renewed', color: '#16a34a' },
}

function renewalsForMonth(plans, monthKey, today) {
  const out = []
  for (const p of plans) {
    const renewal = p.renewal_date ? String(p.renewal_date).slice(0, 10) : ''
    if (p.status === 'active' && renewal.slice(0, 7) === monthKey) {
      out.push({ plan: p, date: renewal, state: !p.auto_renew ? 'not_renewing' : renewal < today ? 'pending' : 'upcoming' })
      continue
    }
    if (p.status === 'setup_pending') continue
    const starts = [...new Set((p.schedule || []).map(r => r.year_start ? String(r.year_start).slice(0, 10) : '').filter(Boolean))].sort()
    const renewedOn = starts.slice(1).find(s => s.slice(0, 7) === monthKey)
    if (renewedOn) out.push({ plan: p, date: renewedOn, state: 'renewed' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || String(a.plan.member_name || '').localeCompare(String(b.plan.member_name || '')))
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function RenewalsSection({ plans, onOpenPlan, onRefresh }) {
  const today = todayIso()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1)
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const rows = useMemo(() => renewalsForMonth(plans, monthKey, today), [plans, monthKey, today])
  const monthLabel = `${MONTHS[month]} ${year}`
  // This year and next (renewals sit up to a year ahead), plus any year a plan
  // renewed or renews in.
  const years = useMemo(() => {
    const ty = Number(today.slice(0, 4))
    const set = new Set([ty, ty + 1])
    for (const p of plans) {
      if (p.renewal_date) set.add(Number(String(p.renewal_date).slice(0, 4)))
      for (const r of p.schedule || []) if (r.year_start) set.add(Number(String(r.year_start).slice(0, 4)))
    }
    return Array.from(set).sort((a, b) => b - a)
  }, [plans, today])
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const renewedCount = rows.filter(r => r.state === 'renewed').length

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <button type="button" onClick={onRefresh} style={{ ...sel, color: 'var(--vfo-accent-text)', fontWeight: 600 }}>Refresh</button>
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>
          {rows.length} renewal{rows.length === 1 ? '' : 's'}{renewedCount ? ` · ${renewedCount} already renewed` : ''}
        </span>
      </div>

      {rows.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No memberships renew in {monthLabel}.
        </div>
      )}
      {rows.map(({ plan, date, state }) => {
        const m = plan.member || {}
        const st = RENEWAL_STATE[state]
        const perPull = Number(plan.per_pull_amount) || 0
        const openMeeting = (plan.renewal_meetings || []).find(x => !x.completed_at)
        const noticeSent = state !== 'renewed' && plan.renewal_notice_for && String(plan.renewal_notice_for).slice(0, 10) === date
        return (
          <div key={`${plan.id}-${date}`} onClick={() => onOpenPlan(plan)} {...rowHoverProps}
            style={{ ...card, ...clickableRowStyle, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <MemberNameLink memberNumber={plan.member_number}>{plan.member_name || plan.member_number}</MemberNameLink>
                {plan.tracking_only && <StatusPill label="Old system" color="#6b7280" />}
                {plan.paid_with_gc && <StatusPill label="Growth Credits" color="#7c3aed" />}
                {noticeSent && <StatusPill label="Notice sent" color="#6b7280" />}
                {openMeeting && <StatusPill label="Meeting requested" color="#e06717" />}
                {m.membership_arrears && <StatusPill label="In arrears" color="#b45309" />}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
                {plan.member_number} · {m.member_type || '—'}
                {' · '}{plan.paid_with_gc ? `Annual (${Number(plan.gc_credits) || 0} GC/yr)` : plan.frequency === 'monthly' ? `Monthly (${money(perPull)}/mo)` : `Annual (${money(perPull)}/yr)`}
                {state !== 'renewed' && (plan.next_year_amount
                  ? ` · Next year ${money(plan.next_year_amount)}${Number(plan.next_year_credit_note) > 0 ? ` − ${money(plan.next_year_credit_note)} credit` : ''}${plan.next_year_member_type ? ` · ${plan.next_year_member_type}` : ''}`
                  : ' · Next year: same terms')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(plan.net_annual)}</div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>net / year</div>
            </div>
            <div style={{ textAlign: 'right', width: '110px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>{fmtDate(date)}</div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{state === 'renewed' ? 'renewed' : 'renewal'}</div>
            </div>
            <div style={{ width: '140px', textAlign: 'right' }}>
              <StatusPill label={st.label} color={st.color} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Overdue Payments: missed / overdue payments ───────────────────────────────

function OutstandingSection({ plans, isSuperadmin }) {
  const today = todayIso()
  const groups = plans
    .filter(p => p.status === 'active' || p.status === 'terminated')
    .map(p => {
      const overdue = (p.schedule || []).filter(r =>
        Number(r.amount_due) > 0 && (
          r.status === 'missed' || r.status === 'declined' ||
          (r.status === 'scheduled' && r.due_date < today)
        ))
      return { plan: p, overdue, total: overdue.reduce((s, r) => s + Number(r.amount_due || 0), 0) }
    })
    .filter(g => g.overdue.length > 0)

  if (groups.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
        Nothing outstanding — every expected payment is on track.
      </div>
    )
  }

  return (
    <div>
      {groups.map(({ plan, overdue, total }) => (
        <OutstandingRow key={plan.id} plan={plan} overdue={overdue} total={total} isSuperadmin={isSuperadmin} />
      ))}
    </div>
  )
}

// ── Outstanding Payment Links: setup links sent but never completed ───────────

// Prop is named `label` for readability at the call sites; renamed on the way in
// so it does not shadow the module-level `label` style.
function LinkDetail({ label: text, value }) {
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '7px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px' }}>
      <div style={{ width: '170px', flexShrink: 0, color: 'var(--vfo-muted)', fontWeight: 600 }}>{text}</div>
      <div style={{ color: 'var(--vfo-ink)' }}>{value}</div>
    </div>
  )
}

function OutstandingLinksSection({ plans, onChanged, onEdit, isSuperadmin }) {
  // Unlike the tax/holistic Outstanding Payment Links tabs, sandbox plans show
  // here (badged) — this panel is also where sandbox test runs are watched.
  const rows = plans.filter(p => p.status === 'setup_pending' && p.setup_email_sent_at)

  if (rows.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
        No outstanding payment links — everyone who was sent a setup link has completed it.
      </div>
    )
  }

  return (
    <div>
      {rows.map(p => <OutstandingLinkRow key={p.id} plan={p} onChanged={onChanged} onEdit={onEdit} isSuperadmin={isSuperadmin} />)}
    </div>
  )
}

// One outstanding setup link. Per-row busy/message state lives here because
// hooks can't be used inside the .map above.
function OutstandingLinkRow({ plan, onChanged, onEdit, isSuperadmin }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const perPull = Number(plan.per_pull_amount) || 0
  // Annual transfers charge nothing now (they renew at the renewal date), and a
  // monthly transfer with a fixed charge day has its whole year scheduled on
  // that day — either way the link only saves a payment method.
  const saveOnly = perPull <= 0 || (plan.transfer && plan.frequency === 'annual') ||
    (plan.transfer && plan.frequency === 'monthly' && Number(plan.charge_day) >= 1)

  async function sendLink() {
    setBusy(true); setMsg(null)
    try {
      const res = await callApi('membership_send_setup_link', { plan_id: plan.id })
      if (!res?.ok) { setMsg({ tone: 'error', text: res?.error || 'Action failed.' }); return }
      if (res.email_skipped) setMsg({ tone: 'amber', text: `Link ready, but the email template isn't seeded yet — send it manually: ${res.setup_link}` })
      else setMsg({ tone: 'success', text: `Setup email drafted for ${res.to_email}.` })
      onChanged?.()
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Action failed.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', width: '12px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <MemberNameLink memberNumber={plan.member_number}>{plan.member_name || plan.member_number}</MemberNameLink>
            <StatusPill label="Setup link" color="#125ecc" />
            {plan.transfer && <StatusPill label="Transferred" color={BLUE} />}
            {plan.sandbox && <StatusPill label="Sandbox" color="#e06717" />}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
            {plan.member_number} · Link sent {fmtStamp(plan.setup_email_sent_at)}
            {' · '}{plan.frequency === 'monthly' ? `Monthly (${money(perPull)}/mo)` : `Annual (${money(perPull)}/yr)`}
          </div>
        </div>
        <div style={{ width: '120px', textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: saveOnly ? 'var(--vfo-ink-2)' : 'var(--vfo-heading)' }}>
            {saveOnly ? 'Save-only' : money(perPull)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{saveOnly ? 'no charge at link' : 'due at link'}</div>
        </div>
      </div>

      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          <LinkDetail label="Annual value" value={money(plan.annual_amount)} />
          <LinkDetail label="Credit note" value={Number(plan.credit_note) > 0 ? money(plan.credit_note) : '—'} />
          {plan.transfer && <LinkDetail label="Renewal date" value={fmtDate(plan.renewal_date)} />}
          {plan.transfer && plan.frequency === 'monthly' && Number(plan.charge_day) >= 1 && (
            <LinkDetail label="Charge day" value={`${ordinal(plan.charge_day)} of each month`} />
          )}
          <LinkDetail label="Plan created" value={`${fmtStamp(plan.created_at)}${plan.created_by ? ` · ${plan.created_by}` : ''}`} />
          <LinkDetail label="Link sent" value={fmtStamp(plan.setup_email_sent_at)} />

          {isSuperadmin && (
            <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" disabled={busy} onClick={sendLink} style={primaryBtn(busy)}>
                {busy ? 'Working…' : 'Resend payment setup link'}
              </button>
              <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); onEdit?.(plan) }}
                style={{ ...ghostBtn, border: `1px solid ${BLUE}`, color: BLUE }}>
                Edit plan
              </button>
            </div>
          )}

          {msg && (
            <div style={{ marginTop: '10px', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', wordBreak: 'break-all',
              color: msg.tone === 'success' ? '#166534' : msg.tone === 'amber' ? '#b45309' : '#b91c1c',
              border: `1px solid ${msg.tone === 'success' ? '#bbf7d0' : msg.tone === 'amber' ? '#fde68a' : '#fecaca'}`,
              background: msg.tone === 'success' ? '#f0fdf4' : msg.tone === 'amber' ? '#fffbeb' : '#fef2f2' }}>{msg.text}</div>
          )}
        </div>
      )}
    </div>
  )
}

// One outstanding plan. Its own state so the reminder button can show progress
// per row (hooks can't live inside the .map above). Rows whose overdue payments
// are all still 'scheduled' (not yet swept) are rejected by the backend, so the
// reminder button is hidden for them in favour of an explanatory note.
function OutstandingRow({ plan, overdue, total, isSuperadmin }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  // Known-value substitution for the failure email (see StepEmailsChip). Only
  // the member first name is cleanly in scope here (the email's [Amount] uses a
  // per-arrears figure not available on this row), so everything else stays a
  // bracketed chip.
  const emailCtx = (() => {
    const ctx = {}
    const first = String(plan.member_name || '').trim().split(/\s+/)[0]
    if (first) ctx['First Name'] = first
    return ctx
  })()
  // The backend only emails rows already marked missed/declined. When every
  // overdue row is still 'scheduled' (awaiting tonight's automatic charge run),
  // the reminder call is guaranteed to 400 — so gate the button instead.
  const canRemind = overdue.some(r => r.status === 'missed' || r.status === 'declined')

  async function sendReminder() {
    setBusy(true); setMsg(null)
    try {
      const res = await callApi('membership_send_reminder', { plan_id: plan.id })
      if (res?.ok) setMsg({ tone: 'success', text: `Reminder email created for ${res.to_email}.` })
      else setMsg({ tone: 'error', text: res?.error || 'Could not send the reminder.' })
    } catch (e) {
      setMsg({ tone: 'error', text: e?.message || 'Could not send the reminder.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, marginBottom: '10px', padding: '14px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <MemberNameLink memberNumber={plan.member_number}>{plan.member_name || plan.member_number}</MemberNameLink>
            {plan.tracking_only && <StatusPill label="Old system" color="#6b7280" />}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
            {plan.member_number} · {overdue.length} overdue payment{overdue.length === 1 ? '' : 's'}: {overdue.map(r => r.period_label).join(', ')}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#ef4444' }}>{money(total)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>owed</div>
        </div>
        {plan.tracking_only ? (
          // Billed on the old system: nothing is charged or emailed from here.
          <span style={{ fontSize: '12px', color: 'var(--vfo-faint)', maxWidth: '240px', textAlign: 'right' }}>
            Tracked — update each payment's status on their plan card
          </span>
        ) : canRemind && isSuperadmin ? (
          <button type="button" disabled={busy} onClick={sendReminder} style={primaryBtn(busy)}>
            {busy ? 'Sending…' : 'Send reminder email'}
          </button>
        ) : canRemind ? null : (
          <span style={{ fontSize: '12px', color: 'var(--vfo-faint)', maxWidth: '220px', textAlign: 'right' }}>
            Overdue — will be charged by tonight's automatic run
          </span>
        )}
        {!plan.tracking_only && (
          <span style={{ marginLeft: '8px' }}><StepEmailsChip pipeline="MEMBER_MEMBERSHIP_FEES" title="Payment reminder email" context={emailCtx} templates={[
            { name: 'MEMBERSHIP_payment_failed', when: 'Payment failed / reminder to the member — update method and pay the arrears now' },
            { name: 'MEMBERSHIP_arrears_digest', when: 'Friday morning digest to Paul — every member currently in arrears (Gmail draft)' },
          ]} /></span>
        )}
      </div>
      {msg && (
        <div style={{ marginTop: '10px', fontSize: '12.5px', padding: '8px 12px', borderRadius: '8px', wordBreak: 'break-all',
          color: msg.tone === 'success' ? '#166534' : msg.tone === 'amber' ? '#b45309' : '#b91c1c',
          border: `1px solid ${msg.tone === 'success' ? '#bbf7d0' : msg.tone === 'amber' ? '#fde68a' : '#fecaca'}`,
          background: msg.tone === 'success' ? '#f0fdf4' : msg.tone === 'amber' ? '#fffbeb' : '#fef2f2' }}>{msg.text}</div>
      )}
    </div>
  )
}
