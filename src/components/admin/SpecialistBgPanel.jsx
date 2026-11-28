import { useState, useMemo, useLayoutEffect } from 'react'
import { CARD_FEE_COL, CARD_FEE_LABEL, CardFeeCell } from './cardFeeColumn'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money, StatusPill } from './specialistRevenueShared'
import { AccountingRowsSkeleton } from '../shared/Skeleton'
import { SpecialistNameLink } from '../shared/personLinks'
import { errorStyle, innerTotalsStyle, refreshBtnStyle } from './accountingTable'
import ExpandChevron from '../shared/ExpandChevron'
import { formatDate } from '../../lib/dates'
import { cardFrame, ProfileCard } from '../shared/ProfileKit'
import { btnPrimary, btnState } from '../shared/buttonStyles'

// Accounting > Specialists > VFO Specialist Background Checks, laid out like License
// Fees (Jake 2026-11-28): Specialists (one card per specialist, below), Request
// Payment (BgRequestSection) and Outstanding Payment Links. Rows come from two sources:
//   - onboarding rows: specialist_onboarding with a bg payment recorded OR the Stage 3
//     payment link sent (bg_step3_email_sent_at). Core $350 / Max $950.
//   - request rows: specialist_bg_requests, the any-amount requests sent from the
//     Request Payment pill.
// Both come from specialist_bg_payments_load ({ payments, requests }).


// Onboarding status → the four display states. A link that was sent with no payment
// recorded yet (bg_payment_status NULL or 'pending') reads as Awaiting payment.
function stateOf(status) {
  if (status === 'succeeded') return 'paid'
  if (status === 'processing') return 'processing'
  if (status === 'failed') return 'failed'
  return 'awaiting'
}

const STATE_PILL = {
  // Same labels + colours as the SpecRev / License Fees pills.
  paid: { label: 'Cleared', color: '#16a34a' },
  processing: { label: 'Bank payment clearing', color: '#e06717' },
  awaiting: { label: 'Payment requested', color: '#0095ff' },
  failed: { label: 'Payment failed', color: '#ef4444' },
}

// Normalises the loader's two arrays into one row shape, newest first. Exported so
// the Outstanding Payment Links pill reads exactly the same rows.
export function bgRowsFrom(res) {
  const onboarding = (res?.payments || []).map(p => {
    const tier = p.background_check_type === 'Max' ? 'Max' : p.background_check_type === 'Core' ? 'Core' : null
    return {
      key: `ob-${p.id}`,
      source: 'onboarding',
      id: p.id,
      expertId: p.expert_id || null,
      name: p.specialist_name || `Specialist #${p.expert_id || p.id}`,
      type: tier ? `Onboarding – ${tier}` : 'Onboarding – Core/Max not chosen',
      amount: tier ? (tier === 'Max' ? 950 : 350) : null,
      state: stateOf(p.bg_payment_status),
      method: p.bg_payment_method_type === 'ach' || p.bg_payment_method_type === 'card' ? p.bg_payment_method_type : null,
      last4: p.bg_acct_last4 || null,
      sentAt: p.bg_step3_email_sent_at || null,
      paidAt: p.bg_payment_status === 'succeeded' ? p.bg_payment_completed_at : null,
      fee: Number(p.bg_card_processing_fee) || 0,
      onboardingStatus: p.status || null,
    }
  })
  const requests = (res?.requests || []).map(r => ({
    key: `rq-${r.id}`,
    source: 'request',
    id: r.id,
    expertId: r.expert_id || null,
    name: r.specialist_name || `Specialist #${r.expert_id || ''}`,
    email: r.specialist_email || '',
    type: 'Request',
    amount: Number(r.amount) || 0,
    state: r.payment_status === 'requested' ? 'awaiting' : stateOf(r.payment_status),
    method: r.payment_method_type === 'ach' || r.payment_method_type === 'card' ? r.payment_method_type : null,
    last4: r.acct_last4 || null,
    sentAt: r.payment_requested_at || r.created_at || null,
    paidAt: r.payment_status === 'succeeded' ? r.payment_completed_at : null,
    fee: Number(r.card_processing_fee) || 0,
    reminderAt: r.reminder_sent_at || null,
    tracyAt: r.tracy_notified_at || null,
    sandbox: !!r.sandbox,
  }))
  const t = (row) => Math.max(row.sentAt ? Date.parse(row.sentAt) || 0 : 0, row.paidAt ? Date.parse(row.paidAt) || 0 : 0)
  return [...onboarding, ...requests].sort((a, b) => t(b) - t(a))
}

// The Specialists pill, a copy of License Fees' (Jake 2026-11-28): one card per
// specialist who has had a background check (onboarding or request), which opens
// to every check with its date, amount, card fee and status. It replaced the
// monthly ledger and the Reconciliation pill: the card carries both.
const STATE_ORDER = ['failed', 'processing', 'awaiting', 'paid']
// License Fees' own toolbar field and card, so the two pages match exactly.
const bgField = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', color: 'var(--vfo-ink)', fontFamily: 'Inter, sans-serif', outline: 'none' }
const bgCard = { ...cardFrame, borderRadius: '14px' }

// A specialist's card shows the state that needs looking at first.
function personState(rows) {
  for (const s of STATE_ORDER) if (rows.some(r => r.state === s)) return s
  return 'paid'
}

function methodWord(m) {
  if (m === 'ach') return 'ACH'
  if (m === 'card') return 'Card'
  return ''
}

export default function SpecialistBgPanel({ embedded = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Re-open draws the last rows at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistbg:')
    if (snap) { setRows(bgRowsFrom(snap)); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('specialist_bg_payments_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setRows(bgRowsFrom(res))
      setLastSeen('specialistbg:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const people = useMemo(() => {
    const map = new Map()
    for (const r of rows) {
      const k = r.expertId ? `x${r.expertId}` : `n${r.name}`
      if (!map.has(k)) map.set(k, { key: k, expertId: r.expertId, name: r.name, rows: [] })
      map.get(k).rows.push(r)
    }
    return [...map.values()].map(p => ({ ...p, state: personState(p.rows) }))
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return people
      .filter(p => statusFilter === 'all' || p.state === statusFilter)
      .filter(p => !q || (p.name || '').toLowerCase().includes(q))
      .sort((a, b) => (STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state)) || (a.name || '').localeCompare(b.name || ''))
  }, [people, query, statusFilter])

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={wrap}>
      {loading && <AccountingRowsSkeleton search={260} boxes={[210]} blocks={[110, 110, 80]} pill={150} />}
      {error && <div style={errorStyle}>{error}</div>}

      {!loading && !error && (
        <div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="search" name="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name…"
              style={{ ...bgField, width: '260px' }} />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...bgField, width: '210px', cursor: 'pointer' }}>
              <option value="all">All statuses</option>
              {STATE_ORDER.map(k => <option key={k} value={k}>{STATE_PILL[k].label}</option>)}
            </select>
            <button type="button" onClick={() => load()} style={refreshBtnStyle}>Refresh</button>
            <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{filtered.length} specialist{filtered.length === 1 ? '' : 's'}</span>
          </div>

          {filtered.length === 0 && (
            <div style={{ ...bgCard, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
              No background checks match — send one under Request Payment.
            </div>
          )}
          {filtered.map(p => <BgCard key={p.key} person={p} />)}
        </div>
      )}
    </div>
  )
}

function BgCard({ person }) {
  const [open, setOpen] = useState(false)
  const meta = STATE_PILL[person.state] || STATE_PILL.paid
  const paid = person.rows.filter(r => r.state === 'paid')
  const paidTotal = paid.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const feeTotal = paid.reduce((s, r) => s + (Number(r.fee) || 0), 0)
  const lastPaid = paid.map(r => r.paidAt).filter(Boolean).sort().pop() || null
  const grid = `1.3fr 110px 110px ${CARD_FEE_COL} 170px 1.2fr`
  const latest = person.rows[0]
  const sub = [
    [...new Set(person.rows.map(r => r.type))].join(', '),
    latest?.method ? `${methodWord(latest.method)}${latest.last4 ? ` ••${latest.last4}` : ''}` : '',
    latest?.sentAt ? `Link sent ${formatDate(latest.sentAt, '—')}` : '',
  ].filter(Boolean).join(' · ')

  return (
    <div style={{ ...bgCard, marginBottom: '10px', overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', cursor: 'pointer' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>
            {person.expertId ? <SpecialistNameLink expertId={person.expertId}>{person.name}</SpecialistNameLink> : person.name}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{sub}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-heading)', fontVariantNumeric: 'tabular-nums' }}>{money(paidTotal)}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>collected</div>
        </div>
        <div style={{ textAlign: 'right', width: '110px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink-2)' }}>{formatDate(lastPaid, '—')}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>last payment</div>
        </div>
        <div style={{ textAlign: 'right', width: '80px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: person.state === 'failed' ? '#ef4444' : 'var(--vfo-ink-2)' }}>{paid.length}</div>
          <div style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>paid</div>
        </div>
        <div style={{ width: '190px', textAlign: 'right' }}>
          <StatusPill label={meta.label} color={meta.color} />
        </div>
        <ExpandChevron open={open} />
      </div>

      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
            <div>Check</div><div>Date</div><div style={{ textAlign: 'right' }}>Amount</div><div style={{ textAlign: 'right' }}>{CARD_FEE_LABEL}</div><div>Status</div><div style={{ textAlign: 'right' }}>Payment</div>
          </div>
          <div style={{ ...innerTotalsStyle, gridTemplateColumns: grid, padding: '8px 6px', margin: '0 -6px', borderBottom: '2px solid var(--vfo-border)' }}>
            <div>Totals</div>
            <div />
            <div style={{ textAlign: 'right' }}>{money(paidTotal)}</div>
            <div style={{ textAlign: 'right' }}>{feeTotal > 0 ? money(feeTotal) : '—'}</div>
            <div style={{ color: 'var(--vfo-success-text-2)' }}>{paid.length} cleared</div>
            <div />
          </div>
          {person.rows.map(r => {
            const m = STATE_PILL[r.state] || STATE_PILL.awaiting
            return (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ fontWeight: 600 }}>{r.type}</div>
                <div>{formatDate(r.paidAt || r.sentAt, '—')}</div>
                <div style={{ fontWeight: 600, color: 'var(--vfo-ink)', textAlign: 'right' }}>{r.amount != null ? money(r.amount) : '—'}</div>
                <div style={{ textAlign: 'right' }}><CardFeeCell fee={r.state === 'paid' ? r.fee : null} /></div>
                <div><StatusPill label={m.label} color={m.color} /></div>
                <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>
                  {r.method ? `${methodWord(r.method)}${r.last4 ? ` ••${r.last4}` : ''}` : '—'}
                </div>
              </div>
            )
          })}
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--vfo-faint)' }}>
            A check not paid yet is also on Outstanding Payment Links. A card payment carries its processing fee; a bank payment none.
          </div>
        </div>
      )}
    </div>
  )
}

// The Request Payment sub-tab (Issue #661 part 6b, Jake 2026-11-28: a sub-tab like
// License's Set Up License, not a button that opens a form on the ledger). A sent
// request is unpaid, so it shows on Outstanding Payment Links, not on the ledger.
export function BgRequestSection({ allExperts = [] }) {
  return (
    <ProfileCard icon="shield" title="Send Background Check Payment Request">
      <BgRequestForm allExperts={allExperts} />
    </ProfileCard>
  )
}

function BgRequestForm({ allExperts = [], onSent }) {
  const [expertId, setExpertId] = useState('')
  const [amount, setAmount] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  const experts = useMemo(() => (
    [...allExperts]
      .filter(e => e && e.name && e.email)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [allExperts])

  const cleaned = String(amount).replace(/[,$\s]/g, '')
  const amountValid = /^\d+(\.\d{1,2})?$/.test(cleaned) && Number(cleaned) > 0 && Number(cleaned) <= 10000
  const amountHint = amount === '' ? '' : !amountValid ? 'Enter an amount above $0 with at most 2 decimal places (max $10,000).' : ''
  const ready = !!expertId && amountValid && !sending

  async function send() {
    setSending(true); setSent(''); setError('')
    try {
      const d = await callApi('specialist_bg_request_send', { expert_id: Number(expertId), amount: cleaned })
      if (d?.error) { setError(d.error); return }
      setSent(`Payment request drafted to ${d.to_email}${d.sandbox ? ' (sandbox)' : ''} — review & send it from Gmail drafts.`)
      setExpertId(''); setAmount('')
      if (onSent) await onSent()
    } catch (e) {
      setError(e?.message || 'Could not send the payment request.')
    } finally {
      setSending(false)
    }
  }

  const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '6px' }
  const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: '14px', alignItems: 'start', marginBottom: '14px' }}>
        <div>
          <div style={label}>Specialist</div>
          <select value={expertId} onChange={e => { setExpertId(e.target.value); setSent(''); setError('') }} style={{ ...field, cursor: 'pointer' }}>
            <option value="">Select a specialist…</option>
            {experts.map(e => (
              <option key={e.id} value={String(e.id)}>{`${e.name} — ${e.email}`}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>$ Amount</div>
          <input type="text" inputMode="decimal" value={amount} placeholder="0.00"
            onChange={e => { setAmount(e.target.value); setSent(''); setError('') }} style={field} />
        </div>
      </div>

      <p style={{ fontSize: '12.5px', color: 'var(--vfo-ink-3)', margin: '0 0 16px', lineHeight: 1.6 }}>
        The specialist gets an email with a secure link and pays by bank transfer (no fee) or by card (a 2.9% + $0.30 processing fee is added at checkout). The email lands in Gmail Drafts for review. If it isn't paid, a reminder is drafted after 2 business days and Tracy is notified after 4.
      </p>

      {amountHint && <p style={{ fontSize: '12.5px', color: '#b91c1c', margin: '0 0 12px' }}>{amountHint}</p>}

      <button onClick={send} disabled={!ready}
        style={btnState(btnPrimary, !(ready))}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      {sent && <p style={{ fontSize: '13px', color: 'var(--vfo-success-text)', margin: '14px 0 0' }}>{sent}</p>}
      {error && <p style={{ fontSize: '13px', color: '#b91c1c', margin: '14px 0 0' }}>{error}</p>}
    </div>
  )
}
