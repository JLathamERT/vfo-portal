import { useState, useMemo, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { MemberNameLink } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'

// Accounting > SDP ATSG > SDP ATSG Revenue (2026-11-19). Each SDP - Advanced Tax
// Strategy Governance payment that cleared in the chosen month/year and how it
// split: SDP's share, the member's share, and the 5% VFO Services keeps. A share
// that has not paid out yet carries a small note (held legs are listed, with
// their reason, under the Held Payouts sub-tab). Same look as Holistic Planning
// Revenue. A row opens the case on the SDP ATSG tab.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

// Where a payout leg stands, as a small note under its amount.
function legNote(status) {
  if (!status || status === 'paid' || status === 'none_due') return null
  if (status === 'awaiting_connect') return 'held - no payout account'
  if (String(status).startsWith('held_')) return `held - member ${String(status).slice(5)}`
  if (status === 'failed') return 'failed - retried daily'
  return String(status)
}

function Share({ value, status, color }) {
  const note = legNote(status)
  if (value == null) return <span style={{ textAlign: 'right', color: '#c7d0de' }}>—</span>
  return (
    <span style={{ textAlign: 'right', fontWeight: 600, color: note ? 'var(--vfo-faint)' : (value > 0 ? color : '#c7d0de') }}>
      {value > 0 ? money(value) : '—'}
      {note && value > 0 && <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#b45309' }}>{note}</div>}
    </span>
  )
}

export default function SdpAtsgRevenuePanel({ embedded = false }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  useLayoutEffect(() => {
    const snap = getLastSeen('sdpatsgrevenue:')
    if (snap) { setRows(snap.payments || []); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('sdp_atsg_revenue_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setRows(res.payments || [])
      setLastSeen('sdpatsgrevenue:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    rows.forEach(p => { if (p.paid_at) set.add(new Date(p.paid_at).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])

  const filtered = useMemo(() => rows.filter(p => {
    const d = new Date(p.paid_at)
    if (d.getFullYear() !== year) return false
    return month < 0 || d.getMonth() === month
  }), [rows, year, month])

  const sum = k => filtered.reduce((s, p) => s + (Number(p[k]) || 0), 0)
  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1150px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '104px 1.3fr 1.1fr 1fr 104px 104px 104px 104px'

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
          <option value={-1}>All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <button onClick={() => load()} style={{ ...sel, color: 'var(--vfo-accent-text)', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={8} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'auto', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ minWidth: '880px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
              <span>Cleared</span><span>Client</span><span>Connected Member</span><span>Payment</span>
              <span style={{ textAlign: 'right', borderRight: '1px solid var(--vfo-border-strong)', paddingRight: '12px' }}>Received</span>
              <span style={{ textAlign: 'right' }}>SDP Share</span><span style={{ textAlign: 'right' }}>Member Share</span><span style={{ textAlign: 'right' }}>VFO Services</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
              <span /><span /><span />
              <span style={{ textAlign: 'right', borderRight: '1px solid var(--vfo-border-strong)', paddingRight: '12px' }}>{money(sum('amount'))}</span>
              <span style={{ textAlign: 'right' }}>{money(sum('sdp_share'))}</span>
              <span style={{ textAlign: 'right' }}>{money(sum('member_share'))}</span>
              <span style={{ textAlign: 'right' }}>{money(sum('vfos_share'))}</span>
            </div>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No SDP ATSG payments cleared in this period.</div>
            )}
            {filtered.map(p => (
              <div key={p.id} onClick={() => navigate(`/admin?tab=sdp_atsg&case=${p.case_id}`)} {...rowHoverProps}
                style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(p.paid_at)}</span>
                <span style={{ fontWeight: 600 }}>
                  {p.client_name || '—'}{p.client_ref && <span style={{ color: 'var(--vfo-faint)', fontWeight: 400 }}> · {p.client_ref}</span>}
                  {p.sandbox && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: 'rgba(224,103,23,0.14)', color: '#e06717' }}>Sandbox</span>}
                </span>
                <span>{p.member_name ? <MemberNameLink memberNumber={p.member_number}>{p.member_name}</MemberNameLink> : (p.member_number || '—')}{p.member_name && <span style={{ color: 'var(--vfo-faint)' }}> · {p.member_number}</span>}</span>
                <span style={{ color: 'var(--vfo-ink-2)' }}>
                  {p.period_label || (p.kind === 'retainer' ? 'Retainer' : 'Impact fee')}
                  {p.strategy_name && <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{p.strategy_name}</div>}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700, borderRight: '1px solid var(--vfo-tint)', paddingRight: '12px' }}>
                  {money(p.amount)}
                  {p.card_fee > 0 && <div style={{ fontSize: '10.5px', fontWeight: 500, color: 'var(--vfo-faint)' }}>+ {money(p.card_fee)} card fee</div>}
                </span>
                <Share value={p.sdp_share} status={p.sdp_payout_status} color="#e06717" />
                <Share value={p.member_share} status={p.member_payout_status} color="#16a34a" />
                <Share value={p.vfos_share} status="paid" color="var(--vfo-ink)" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
