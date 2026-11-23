import { useState, useMemo, useLayoutEffect } from 'react'
import { CARD_FEE_COL, CARD_FEE_LABEL, CardFeeCell } from './cardFeeColumn'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { NAVY, BLUE, money, StatusPill } from './specialistRevenueShared'
import { AccountingRowsSkeleton } from '../shared/Skeleton'
import { MemberNameLink } from '../shared/personLinks'
import { useIsPhone } from '../../lib/useMediaQuery'

// Accounting > Members > Advisor / Accountant Implementation (2026-11-19, the
// "Advisor / Accountant Onboarding" pages before). Every advisor or accountant
// who came through onboarding and pays for the 6-month implementation: the fee,
// the deposit and the balance, the term and when it ends. Same look as the
// Membership Fees pages (member cards that open to their payments, sections as
// pills). Read-only: onboarding is what sets an implementation up and collects it.
// kind = 'advisor' | 'accountant'. Tier 1 (VFO Associate / Financial
// Collaborator) is monthly membership and lives under Membership Fees.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const IMPL_STATUS = {
  active: { label: 'Active', color: '#16a34a' },
  ended: { label: 'Ended', color: '#6b7280' },
  clearing: { label: 'Clearing', color: '#e06717' },
  deposit_paid: { label: 'Deposit paid', color: '#0095ff' },
  awaiting: { label: 'Awaiting payment', color: '#0095ff' },
  failed: { label: 'Payment failed', color: '#ef4444' },
  stopped: { label: 'Stopped', color: '#6b7280' },
}

const PAY_STATUS = {
  succeeded: { label: 'Paid', color: '#16a34a' },
  processing: { label: 'Clearing', color: '#e06717' },
  failed: { label: 'Failed', color: '#ef4444' },
  refunded: { label: 'Refunded', color: '#6b7280' },
}

const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)' }
const input = { padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }

function todayIso() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, day] = s.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const dt = new Date(s)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const num = v => Number(v) || 0
const depositPaid = r => r.deposit_status === 'succeeded' ? num(r.deposit_amount) : 0
const paidInFull = r => r.payment_status === 'succeeded'

// What has actually come in: the whole fee once the balance (or the one payment)
// cleared, otherwise just a cleared deposit. Card fees are on top, never in it.
function collected(r) {
  if (paidInFull(r)) return num(r.payment_amount)
  return depositPaid(r)
}

function statusOf(r, today) {
  if (paidInFull(r)) return r.renewal_date && String(r.renewal_date).slice(0, 10) < today ? 'ended' : 'active'
  if (r.payment_status === 'processing' || r.deposit_status === 'processing') return 'clearing'
  if (r.payment_status === 'failed' || r.balance_charge_status === 'failed') return 'failed'
  if (r.status === 'stopped' || r.status === 'declined') return 'stopped'
  if (depositPaid(r) > 0) return 'deposit_paid'
  return 'awaiting'
}

function programs(r) {
  return [r.selected_vfo_ft && 'VFO FT', r.selected_pft && 'PFT', r.selected_corporate && 'Corporate'].filter(Boolean).join(' + ')
}

// The Payment column's wording, as on Membership Fees: "Nov 15, 2026 · card ••9370".
function paidText(date, type, last4) {
  const how = type ? `${type === 'ach' || type === 'us_bank_account' ? 'ACH' : 'card'}${last4 ? ` ••${last4}` : ''}` : ''
  return [date ? fmtDate(date) : '', how].filter(Boolean).join(' · ')
}

function methodText(type, last4) {
  if (!type) return ''
  return `${type === 'ach' || type === 'us_bank_account' ? 'ACH' : 'Card'}${last4 ? ` ••${last4}` : ''}`
}

const nameOf = r => `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || '—'

export default function ImplementationPanel({ kind = 'advisor', title }) {
  const [section, setSection] = useState('members')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const snapKey = `implementation:${kind}`

  useLayoutEffect(() => {
    const snap = getLastSeen(snapKey)
    if (snap) { setRows(snap.implementations || []); setError(''); setLoading(false) }
    load(!!snap)
  }, [kind])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('member_onboarding_payments_load', { kind, implementation: true })
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setRows(res.implementations || [])
      setLastSeen(snapKey, res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const pills = [
    { key: 'members', label: 'Members' },
    { key: 'outstanding_links', label: 'Outstanding Payment Links' },
    { key: 'ending', label: 'Implementation Ending' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1050px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · Members</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>{title || (kind === 'accountant' ? 'Accountant Implementation' : 'Advisor Implementation')}</h2>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {pills.map(p => (
          <button key={p.key} type="button" onClick={() => setSection(p.key)}
            style={{ padding: '8px 16px', borderRadius: '99px', border: '1px solid ' + (section === p.key ? 'transparent' : 'var(--vfo-border-strong)'), background: section === p.key ? `linear-gradient(90deg, ${NAVY} 0%, ${BLUE} 100%)` : 'var(--vfo-card)', color: section === p.key ? '#fff' : 'var(--vfo-ink-2)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {p.label}
          </button>
        ))}
      </div>

      {loading && <AccountingRowsSkeleton />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && section === 'members' && <MembersSection rows={rows} />}
      {!loading && !error && section === 'outstanding_links' && <OutstandingLinksSection rows={rows} />}
      {!loading && !error && section === 'ending' && <EndingSection rows={rows} onRefresh={() => load(true)} />}
    </div>
  )
}

// ── Members: one card per implementation ──────────────────────────────────────

function MembersSection({ rows }) {
  const today = todayIso()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [year, setYear] = useState('all')
  const [month, setMonth] = useState(-1)

  const years = useMemo(() => {
    const set = new Set()
    rows.forEach(r => { const d = r.payment_completed_at || r.deposit_completed_at; if (d) set.add(new Date(d).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])

  const filtered = rows.filter(r => {
    if (statusFilter !== 'all' && statusOf(r, today) !== statusFilter) return false
    if (year !== 'all') {
      const d = r.payment_completed_at || r.deposit_completed_at
      if (!d) return false
      const dt = new Date(d)
      if (dt.getFullYear() !== Number(year)) return false
      if (month >= 0 && dt.getMonth() !== month) return false
    }
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return nameOf(r).toLowerCase().includes(q) || String(r.member_number || '').toLowerCase().includes(q)
  })
  const total = filtered.reduce((s, r) => s + collected(r), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or number…"
          style={{ ...input, width: '240px' }} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...input, width: '190px' }}>
          <option value="all">All statuses</option>
          {Object.entries(IMPL_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={year} onChange={e => { setYear(e.target.value); if (e.target.value === 'all') setMonth(-1) }} style={{ ...input, width: '170px' }}>
          <option value="all">Paid: any time</option>
          {years.map(y => <option key={y} value={y}>Paid in {y}</option>)}
        </select>
        {year !== 'all' && (
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ ...input, width: '140px' }}>
            <option value={-1}>All months</option>
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
        )}
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>
          {filtered.length} implementation{filtered.length === 1 ? '' : 's'} · {money(total)} collected
        </span>
      </div>

      {filtered.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No implementations match.
        </div>
      )}
      {filtered.map(r => <ImplementationCard key={r.id} r={r} today={today} />)}
    </div>
  )
}

function ImplementationCard({ r, today }) {
  const [open, setOpen] = useState(false)
  const isPhone = useIsPhone()
  const st = IMPL_STATUS[statusOf(r, today)]
  const dep = num(r.deposit_amount)
  const hasDeposit = dep > 0 && !!r.deposit_status
  const fee = num(r.payment_amount)
  const balance = hasDeposit ? Math.max(0, fee - dep) : fee
  const term = num(r.engagement_term_months) || 6
  const started = r.payment_completed_at || null
  const sub = [
    r.member_number || 'No member number yet',
    r.member_type || r.onboarding_type || null,
    programs(r) || null,
    `${term}-month implementation`,
    methodText(r.payment_method_type || r.deposit_method_type, r.acct_last4 || null) || null,
  ].filter(Boolean).join(' · ')

  const payRows = []
  if (hasDeposit) {
    payRows.push({ key: 'dep', label: 'Deposit', amount: dep, fee: num(r.deposit_card_fee), date: r.deposit_completed_at, status: r.deposit_status, type: r.deposit_method_type, last4: r.deposit_acct_last4 })
    if (fee > dep || r.balance_charge_status) {
      payRows.push({ key: 'bal', label: 'Balance', amount: balance, fee: num(r.card_processing_fee), date: r.balance_charge_date || (paidInFull(r) ? r.payment_completed_at : null), status: r.balance_charge_status || (paidInFull(r) ? 'succeeded' : null), type: r.payment_method_type, last4: r.acct_last4 })
    }
  } else {
    payRows.push({ key: 'full', label: 'Payment in full', amount: fee, fee: num(r.card_processing_fee), date: r.payment_completed_at, status: r.payment_status, type: r.payment_method_type, last4: r.acct_last4 })
  }
  const paidCount = payRows.filter(p => p.status === 'succeeded').length
  // Same columns as a Membership Fees plan card, less Credit.
  const grid = isPhone ? '1fr 90px 90px' : `1.2fr 110px 110px ${CARD_FEE_COL} 120px 1.4fr`
  const paidFee = p => (p.status === 'succeeded' || p.status === 'processing' ? p.fee : 0)

  return (
    <div style={{ ...card, marginBottom: '10px', overflow: 'hidden', opacity: st === IMPL_STATUS.stopped ? 0.7 : 1 }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer', flexWrap: isPhone ? 'wrap' : 'nowrap' }}>
        <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', width: '12px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1, minWidth: isPhone ? 'calc(100% - 30px)' : 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {r.member_number ? <MemberNameLink memberNumber={r.member_number}>{nameOf(r)}</MemberNameLink> : nameOf(r)}
            {hasDeposit && <StatusPill label="Deposit + Balance" color={BLUE} />}
            {r.deposit_refund_status && <StatusPill label="Deposit refunded" color="#6b7280" />}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{sub}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(fee)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>implementation fee</div>
        </div>
        <div style={{ textAlign: 'right', width: '110px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>{r.renewal_date ? fmtDate(String(r.renewal_date).slice(0, 10)) : '—'}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{st === IMPL_STATUS.ended ? 'ended' : 'ends'}</div>
        </div>
        <div style={{ textAlign: 'right', width: '70px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: st === IMPL_STATUS.failed ? '#ef4444' : 'var(--vfo-ink-2)' }}>{paidCount}/{payRows.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>paid</div>
        </div>
        <div style={{ width: isPhone ? 'auto' : '150px', textAlign: 'right' }}>
          <StatusPill label={st.label} color={st.color} />
        </div>
      </div>

      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
            <div>Payment</div>{!isPhone && <div>Date</div>}<div>Amount</div>{!isPhone && <div>{CARD_FEE_LABEL}</div>}<div>Status</div>{!isPhone && <div style={{ textAlign: 'right' }}>Payment</div>}
          </div>
          {payRows.map(p => {
            const meta = PAY_STATUS[p.status] || { label: p.status ? p.status : 'Not paid', color: '#6b7280' }
            const bg = p.status === 'succeeded' ? 'rgba(22,163,74,0.07)' : p.status === 'failed' ? 'rgba(239,68,68,0.07)' : 'transparent'
            return (
              <div key={p.key} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)', background: bg, borderRadius: '6px' }}>
                <div style={{ fontWeight: 600 }}>{p.label}{isPhone && p.date ? <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--vfo-faint)' }}>{fmtDate(p.date)}</div> : null}</div>
                {!isPhone && <div>{fmtDate(p.date)}</div>}
                <div style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{money(p.amount)}</div>
                {!isPhone && <div><CardFeeCell fee={paidFee(p)} /></div>}
                <div><StatusPill label={meta.label} color={meta.color} /></div>
                {!isPhone && <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)', wordBreak: 'break-all' }}>{p.status === 'succeeded' || p.status === 'processing' ? (paidText(p.date, p.type, p.last4) || '—') : '—'}</div>}
              </div>
            )
          })}
          <div style={{ marginTop: '12px' }}>
            <Detail label="Agreement signed" value={fmtDate(r.signed_at)} />
            <Detail label="Implementation" value={started ? `${fmtDate(started)} → ${r.renewal_date ? fmtDate(String(r.renewal_date).slice(0, 10)) : '—'} (${term} months)` : 'Starts when the fee is paid'} />
            {r.deposit_refund_status && <Detail label="Deposit refund" value={`${money(r.deposit_refund_amount)} · ${r.deposit_refund_status}`} />}
            <Detail label="Invoice / receipt" value={[r.invoice_number, r.receipt_number].filter(Boolean).join(' · ') || '—'} />
          </div>
        </div>
      )}
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '7px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px' }}>
      <div style={{ width: '170px', flexShrink: 0, color: 'var(--vfo-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ color: 'var(--vfo-ink)', minWidth: 0, wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}

// ── Outstanding Payment Links: signed, payment link sent, nothing paid ────────

function OutstandingLinksSection({ rows }) {
  const today = todayIso()
  const shown = rows.filter(r => r.payment_link_sent_at && ['awaiting', 'deposit_paid', 'failed'].includes(statusOf(r, today)))
  if (shown.length === 0) {
    return (
      <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
        No outstanding payment links — everyone who signed has paid.
      </div>
    )
  }
  return (
    <div>
      {shown.map(r => {
        const st = IMPL_STATUS[statusOf(r, today)]
        const due = num(r.payment_amount) - depositPaid(r)
        return (
          <div key={r.id} style={{ ...card, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>
                {r.member_number ? <MemberNameLink memberNumber={r.member_number}>{nameOf(r)}</MemberNameLink> : nameOf(r)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
                {[r.email, programs(r), `Link sent ${fmtDate(r.payment_link_sent_at)}`, r.payment_reminder_sent_at ? `reminded ${fmtDate(r.payment_reminder_sent_at)}` : null].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(due)}</div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{depositPaid(r) > 0 ? 'balance due' : 'due'}</div>
            </div>
            <div style={{ width: '150px', textAlign: 'right' }}><StatusPill label={st.label} color={st.color} /></div>
          </div>
        )
      })}
      <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }}>The payment link and its reminders are sent from the onboarding pipeline (Automation &amp; Config).</p>
    </div>
  )
}

// ── Implementation Ending: by month, like Membership Fees' Renewals ───────────

function EndingSection({ rows, onRefresh }) {
  const today = todayIso()
  const [year, setYear] = useState(Number(today.slice(0, 4)))
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1)
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`
  const years = useMemo(() => {
    const ty = Number(today.slice(0, 4))
    const set = new Set([ty, ty + 1])
    rows.forEach(r => { if (r.renewal_date) set.add(Number(String(r.renewal_date).slice(0, 4))) })
    return Array.from(set).sort((a, b) => b - a)
  }, [rows, today])
  const shown = rows.filter(r => paidInFull(r) && r.renewal_date && String(r.renewal_date).slice(0, 7) === monthKey)
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }

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
        <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{shown.length} ending</span>
      </div>
      {shown.length === 0 && (
        <div style={{ ...card, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No implementations end in {MONTHS[month]} {year}.
        </div>
      )}
      {shown.map(r => {
        const ended = String(r.renewal_date).slice(0, 10) < today
        return (
          <div key={r.id} style={{ ...card, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>
                {r.member_number ? <MemberNameLink memberNumber={r.member_number}>{nameOf(r)}</MemberNameLink> : nameOf(r)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
                {[r.member_number, r.member_type, programs(r), `started ${fmtDate(r.payment_completed_at)}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)' }}>{money(r.payment_amount)}</div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>implementation fee</div>
            </div>
            <div style={{ textAlign: 'right', width: '110px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>{fmtDate(String(r.renewal_date).slice(0, 10))}</div>
              <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{ended ? 'ended' : 'ends'}</div>
            </div>
            <div style={{ width: '140px', textAlign: 'right' }}>
              <StatusPill label={ended ? 'Ended' : 'Ending'} color={ended ? '#6b7280' : '#e06717'} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
