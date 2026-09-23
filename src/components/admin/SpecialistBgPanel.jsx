import { useState, useEffect, useMemo } from 'react'
import { callApi } from '../../lib/api'
import { money, StatusPill } from './specialistRevenueShared'
import { tableStyle, headerRowStyle, totalsRowStyle, totalsLabelStyle, totalsSubStyle } from './SpecialistRevenuePanel'
import { AccountingTableSkeleton } from '../shared/Skeleton'

// Accounting > Specialists > VFO Specialist Background Checks > the first pill.
// The License Fees ledger shape: background check payments RECEIVED, filtered by
// year + month of the paid date (all-time totals are on the Reconciliation pill,
// unpaid links on the Outstanding pill), from two sources:
//   - onboarding rows: specialist_onboarding with a bg payment recorded OR the Stage 3
//     payment link sent (bg_step3_email_sent_at). Core $350 / Max $950.
//   - request rows: specialist_bg_requests, the admin-sent any-amount requests made
//     with the "Send Background Check Payment Request" form above the list.
// Both come from specialist_bg_payments_load ({ payments, requests }).

// Same columns + widths as the License Fees ledger (SpecialistLicensePanel LEDGER_GRID).
const LEDGER_GRID = '1.4fr 118px 112px 178px'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

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
  paid: { label: 'Payment received', color: '#16a34a' },
  processing: { label: 'Payment processing', color: '#e06717' },
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
      name: p.specialist_name || `Specialist #${p.expert_id || p.id}`,
      type: tier ? `Onboarding – ${tier}` : 'Onboarding – Core/Max not chosen',
      amount: tier ? (tier === 'Max' ? 950 : 350) : null,
      state: stateOf(p.bg_payment_status),
      method: p.bg_payment_method_type === 'ach' || p.bg_payment_method_type === 'card' ? p.bg_payment_method_type : null,
      last4: p.bg_acct_last4 || null,
      sentAt: p.bg_step3_email_sent_at || null,
      paidAt: p.bg_payment_status === 'succeeded' ? p.bg_payment_completed_at : null,
      onboardingStatus: p.status || null,
    }
  })
  const requests = (res?.requests || []).map(r => ({
    key: `rq-${r.id}`,
    source: 'request',
    id: r.id,
    name: r.specialist_name || `Specialist #${r.expert_id || ''}`,
    email: r.specialist_email || '',
    type: 'Request',
    amount: Number(r.amount) || 0,
    state: r.payment_status === 'requested' ? 'awaiting' : stateOf(r.payment_status),
    method: r.payment_method_type === 'ach' || r.payment_method_type === 'card' ? r.payment_method_type : null,
    last4: r.acct_last4 || null,
    sentAt: r.payment_requested_at || r.created_at || null,
    paidAt: r.payment_status === 'succeeded' ? r.payment_completed_at : null,
    reminderAt: r.reminder_sent_at || null,
    tracyAt: r.tracy_notified_at || null,
    sandbox: !!r.sandbox,
  }))
  const t = (row) => Math.max(row.sentAt ? Date.parse(row.sentAt) || 0 : 0, row.paidAt ? Date.parse(row.paidAt) || 0 : 0)
  return [...onboarding, ...requests].sort((a, b) => t(b) - t(a))
}

export default function SpecialistBgPanel({ allExperts = [], embedded = false }) {
  const [showSend, setShowSend] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('specialist_bg_payments_load')
      if (res?.error) { setError(res.error); return }
      // Like the License Fees ledger: only payments RECEIVED. Unpaid links live on
      // the Outstanding Payment Links pill.
      setRows(bgRowsFrom(res).filter(r => r.state === 'paid'))
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11, or -1 for All

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    rows.forEach(r => { if (r.paidAt) set.add(new Date(r.paidAt).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (!r.paidAt) return false
    const dt = new Date(r.paidAt)
    if (dt.getFullYear() !== year) return false
    if (month >= 0 && dt.getMonth() !== month) return false
    return true
  }), [rows, year, month])

  const paidTotal = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const periodLabel = month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {embedded ? <div /> : (
          <div>
            <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>VFO Specialist Background Checks</h2>
          </div>
        )}
        <button onClick={() => setShowSend(s => !s)}
            style={{ padding: '10px 18px', borderRadius: '8px', border: showSend ? '1px solid var(--vfo-border-strong)' : 'none', background: showSend ? 'var(--vfo-card)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: showSend ? 'var(--vfo-muted)' : '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', boxShadow: showSend ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
          {showSend ? 'Close form' : 'Send Background Check Payment Request'}
        </button>
      </div>

      {showSend && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', background: 'var(--vfo-input)', marginBottom: '22px', overflow: 'hidden' }}>
          <BgRequestForm allExperts={allExperts} onSent={load} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
          <option value={-1}>All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <button onClick={load} style={{ ...sel, color: '#125ecc', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={4} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gridTemplateColumns: LEDGER_GRID }}>
            <span>Specialist</span><span>Date</span><span style={{ textAlign: 'right' }}>Amount</span><span style={{ textAlign: 'right' }}>Status</span>
          </div>
          <div style={{ ...totalsRowStyle, gridTemplateColumns: LEDGER_GRID }}>
            <span style={totalsLabelStyle}>Totals<span style={totalsSubStyle}>{periodLabel}</span></span>
            <span />
            <span style={{ textAlign: 'right' }}>{money(paidTotal)}</span>
            <span />
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No background check payments for this period.</div>
          )}
          {filtered.map(r => {
            const pill = STATE_PILL[r.state] || { label: r.state || '—', color: 'var(--vfo-muted)' }
            return (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: LEDGER_GRID, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                <span style={{ fontWeight: 600 }}>
                  {r.name}
                  {r.last4 && <span style={{ color: 'var(--vfo-faint)', fontWeight: 400 }}> · ••••{r.last4}</span>}
                </span>
                <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(r.paidAt)}</span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.amount == null ? '—' : money(r.amount)}</span>
                <span style={{ display: 'flex', justifyContent: 'flex-end' }}><StatusPill label={pill.label} color={pill.color} /></span>
              </div>
            )
          })}
        </div>
      )}    </div>
  )
}

// Inline "Send Background Check Payment Request" form (the LicenseSetupForm pattern):
// pick a specialist with an email + an amount, and the portal drafts the payment
// request email with a secure card / bank-transfer link.
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
    <div style={{ padding: '22px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '16px' }}>Send Background Check Payment Request</div>

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
        style={{ padding: '11px 26px', borderRadius: '8px', border: 'none', background: ready ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : '#93b4e8', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif' }}>
        {sending ? 'Sending…' : 'Send'}
      </button>

      {sent && <p style={{ fontSize: '13px', color: '#1b9254', margin: '14px 0 0' }}>{sent}</p>}
      {error && <p style={{ fontSize: '13px', color: '#b91c1c', margin: '14px 0 0' }}>{error}</p>}
    </div>
  )
}
