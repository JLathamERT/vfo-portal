import { useState, useEffect, useMemo } from 'react'
import { callApi } from '../../lib/api'
import { ordinal } from '../../lib/ordinal'
import { NAVY, money, StatusPill } from './specialistRevenueShared'
import { tableStyle, headerRowStyle, totalsRowStyle, totalsLabelStyle, totalsSubStyle } from './SpecialistRevenuePanel'
import { AccountingTableSkeleton } from '../shared/Skeleton'

// Accounting > Specialists > VFO Specialist License Fees. Pick year + month to see the
// $99/mo specialist license payments that cleared that period (read from the
// specialist_license_payments ledger — one row per paid monthly invoice). The
// "Setup Monthly License Fees" button reveals the continuation form inline: pick an
// existing specialist + a charge day and the portal drafts their ACH setup email.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Same column widths the SpecRev table uses for the columns the two share, so the
// date / money / status columns line up when the panels sit side by side.
const LEDGER_GRID = '1.4fr 118px 112px 178px'

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

// Status cell of a ledger row, laid out like the SpecRev table's: pill flush right.
// No method chip — every license payment is ACH, so naming it on every row says nothing.
export function LicenseStatusTag({ status }) {
  const paid = status === 'succeeded'
  return (
    <span style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
      <StatusPill label={paid ? 'Payment received' : (status || '—')} color={paid ? '#16a34a' : 'var(--vfo-muted)'} />
    </span>
  )
}

export default function SpecialistLicensePanel({ allExperts = [], embedded = false }) {
  const [showSetup, setShowSetup] = useState(false)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11, or -1 for All

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('specialist_license_payments_load')
      if (res?.error) { setError(res.error); return }
      setPayments(res.payments || [])
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    payments.forEach(p => { if (p.paid_at) set.add(new Date(p.paid_at).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [payments])

  const filtered = useMemo(() => payments.filter(p => {
    if (!p.paid_at) return false
    const dt = new Date(p.paid_at)
    if (dt.getFullYear() !== year) return false
    if (month >= 0 && dt.getMonth() !== month) return false
    return true
  }), [payments, year, month])

  const periodTotal = filtered.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const periodLabel = month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {embedded ? <div /> : (
          <div>
            <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>VFO Specialist License Fees</h2>
          </div>
        )}
        <button onClick={() => setShowSetup(s => !s)}
          style={{ padding: '10px 18px', borderRadius: '8px', border: showSetup ? '1px solid var(--vfo-border-strong)' : 'none', background: showSetup ? 'var(--vfo-card)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: showSetup ? 'var(--vfo-muted)' : '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', boxShadow: showSetup ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
          {showSetup ? 'Close form' : 'Setup Monthly License Fees'}
        </button>
      </div>

      {showSetup && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', background: 'var(--vfo-input)', marginBottom: '22px', overflow: 'hidden' }}>
          <LicenseSetupForm allExperts={allExperts} onSent={load} />
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
            <span style={{ textAlign: 'right' }}>{money(periodTotal)}</span>
            <span />
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No license payments for this period.</div>
          )}
          {filtered.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: LEDGER_GRID, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
              <span style={{ fontWeight: 600 }}>
                {p.specialist_name || `Specialist #${p.expert_id || p.onboarding_id}`}
                {p.last4 && <span style={{ color: 'var(--vfo-faint)', fontWeight: 400 }}> · ••••{p.last4}</span>}
              </span>
              <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(p.paid_at)}</span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{money(p.amount)}</span>
              <LicenseStatusTag status={p.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Moves an existing specialist onto the portal's $99/mo ACH license subscription:
// pick the specialist + the day of the month they should be charged, and the portal
// drafts their setup email. Nothing is charged here — the link only saves the bank
// details; the first collection happens on the charge day.
function LicenseSetupForm({ allExperts = [], onSent }) {
  const [expertId, setExpertId] = useState('')
  const [chargeDay, setChargeDay] = useState('')
  const [current, setCurrent] = useState(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState('')
  const [warn, setWarn] = useState('')
  const [error, setError] = useState('')

  const experts = useMemo(() => (
    [...allExperts]
      .filter(e => e && e.name)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  ), [allExperts])

  useEffect(() => {
    setCurrent(null); setSent(''); setWarn(''); setError('')
    if (!expertId) return
    let stale = false
    callApi('specialist_license_continuation_load', { expert_id: Number(expertId) })
      .then(d => { if (!stale) setCurrent(d || null) })
      .catch(() => { if (!stale) setCurrent(null) })
    return () => { stale = true }
  }, [expertId])

  // already_active is the server's own 409 condition, so the amber note below can
  // never disagree with what the start action would refuse.
  const active = !!current?.already_active
  const note = active
    ? 'This specialist already has an active license subscription.'
    : current?.link_sent_at
      ? `A setup link was already sent on ${fmtDate(current.link_sent_at)}. Sending again drafts another copy of the same link and restarts the reminder clock — delete the earlier Gmail draft if it hasn't gone out.`
      : ''

  async function send() {
    setSending(true); setSent(''); setWarn(''); setError('')
    try {
      const d = await callApi('specialist_license_continuation_start', { expert_id: Number(expertId), charge_day: Number(chargeDay) })
      setSent(`Setup email drafted to ${d.to_email}${d.sandbox ? ' (sandbox)' : ''}. It's in Gmail Drafts — review and send.`)
      setExpertId(''); setChargeDay('')
      if (onSent) await onSent()
    } catch (e) {
      const m = e?.message || 'Could not send the setup link.'
      // The 409 "already has an active subscription" answer is a state note, not a
      // failure — callApi surfaces it as a plain Error, so it reads as a warning here.
      if (/already/i.test(m)) setWarn(m); else setError(m)
    } finally {
      setSending(false)
    }
  }

  const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '6px' }
  const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const ready = !!expertId && !!chargeDay && !sending

  return (
    <div style={{ padding: '22px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', marginBottom: '16px' }}>Setup Monthly License Fees</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr', gap: '14px', alignItems: 'start', marginBottom: '14px' }}>
        <div>
          <div style={label}>Specialist</div>
          <select value={expertId} onChange={e => setExpertId(e.target.value)} style={field}>
            <option value="">Select a specialist…</option>
            {experts.map(e => (
              <option key={e.id} value={String(e.id)}>{e.email ? `${e.name} — ${e.email}` : e.name}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>Monthly charge day</div>
          <select value={chargeDay} onChange={e => setChargeDay(e.target.value)} style={field}>
            <option value="">Select a day…</option>
            {Array.from({ length: 15 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d)}>{ordinal(d)}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>Monthly license fee</div>
          <div style={{ ...field, cursor: 'default', fontWeight: 700, color: 'var(--vfo-heading)' }}>$99.00 · ACH</div>
        </div>
      </div>

      <p style={{ fontSize: '12.5px', color: 'var(--vfo-ink-3)', margin: '0 0 16px', lineHeight: 1.6 }}>
        The specialist gets an email with a secure link. Their bank details are saved once, and the first payment collects on the {chargeDay ? ordinal(Number(chargeDay)) : 'charge day'} — or right at setup if that day has already passed this month. ACH only; no card option.
      </p>

      {note && (
        <p style={{ fontSize: '12.5px', color: '#b7791f', background: 'rgba(214,158,46,0.10)', padding: '10px 14px', borderRadius: '10px', margin: '0 0 16px' }}>{note}</p>
      )}

      <button onClick={send} disabled={!ready}
        style={{ padding: '11px 26px', borderRadius: '8px', border: 'none', background: ready ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : '#93b4e8', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif' }}>
        {sending ? 'Sending…' : 'Send ACH setup link'}
      </button>

      {sent && <p style={{ fontSize: '13px', color: '#1b9254', margin: '14px 0 0' }}>{sent}</p>}
      {warn && <p style={{ fontSize: '13px', color: '#b7791f', background: 'rgba(214,158,46,0.10)', padding: '10px 14px', borderRadius: '10px', margin: '14px 0 0' }}>{warn}</p>}
      {error && <p style={{ fontSize: '13px', color: '#b91c1c', margin: '14px 0 0' }}>{error}</p>}
    </div>
  )
}
