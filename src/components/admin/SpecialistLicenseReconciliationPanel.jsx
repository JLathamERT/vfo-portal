import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { SpecialistNameLink, specialistProfilePath } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'

// Accounting > Specialists > VFO Specialist License Fees > License Reconciliation.
// One row per specialist who has ever paid a $99/mo license invoice: what they have
// paid all-time, how many months that covers, and when the last one cleared. Rolled up
// in the browser from the same specialist_license_payments ledger the monthly view
// reads — no separate backend call, so the two tabs can never disagree.

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

export default function SpecialistLicenseReconciliationPanel({ embedded = false }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Re-open draws the last payments at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistlicenserecon:')
    if (snap) { setPayments(snap.payments || []); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('specialist_license_payments_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setPayments(res.payments || [])
      setLastSeen('specialistlicenserecon:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  // expert (or onboarding) -> all-time total, payment count, most recent cleared date.
  const rows = useMemo(() => {
    const map = {}
    for (const p of payments) {
      if (!p.paid_at) continue
      const key = String(p.expert_id || p.onboarding_id || p.specialist_name || 'unknown')
      const t = map[key] || (map[key] = { key, expertId: null, name: p.specialist_name || `Specialist #${p.expert_id || p.onboarding_id}`, total: 0, count: 0, last: null })
      if (!t.expertId && p.expert_id) t.expertId = p.expert_id
      t.total += Number(p.amount) || 0
      t.count += 1
      if (!t.last || new Date(p.paid_at) > new Date(t.last)) t.last = p.paid_at
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [payments])

  const tot = rows.reduce((s, r) => ({ total: s.total + r.total, count: s.count + r.count }), { total: 0, count: 0 })
  const lastOverall = rows.reduce((d, r) => (!d || (r.last && new Date(r.last) > new Date(d)) ? (r.last || d) : d), null)

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '1.4fr 120px 150px 150px'
  const muted = { color: 'var(--vfo-faint)' }

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>License Reconciliation</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button onClick={load} style={{ ...sel, color: '#125ecc', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={4} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Specialist</span><span style={{ textAlign: 'right' }}>Payments</span><span style={{ textAlign: 'right' }}>Total Collected</span><span style={{ textAlign: 'right' }}>Most Recent</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
            <span style={{ textAlign: 'right' }}>{tot.count}</span>
            <span style={{ textAlign: 'right' }}>{money(tot.total)}</span>
            <span style={{ textAlign: 'right' }}>{fmtDate(lastOverall)}</span>
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {rows.map(r => (
              <div key={r.key} onClick={r.expertId ? () => navigate(specialistProfilePath(r.expertId)) : undefined} {...(r.expertId ? rowHoverProps : {})} style={{ ...(r.expertId ? clickableRowStyle : null), display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                <span style={{ fontWeight: 600 }}><SpecialistNameLink expertId={r.expertId}>{r.name}</SpecialistNameLink></span>
                <span style={{ textAlign: 'right', color: 'var(--vfo-muted)' }}>{r.count}</span>
                <span style={{ textAlign: 'right', fontWeight: r.total ? 700 : 400, color: r.total ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{r.total ? money(r.total) : '—'}</span>
                <span style={{ textAlign: 'right', ...(r.last ? { color: 'var(--vfo-muted)' } : muted) }}>{fmtDate(r.last)}</span>
              </div>
            ))}
            {rows.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No license payments recorded yet.</div>}
          </div>
        </div>
      )}
      <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }}>All-time totals across every cleared $99/month license invoice. Specialists who have been sent a setup link but have not paid yet appear under Outstanding Payment Links.</p>
    </div>
  )
}
