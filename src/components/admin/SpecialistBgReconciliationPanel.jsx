import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { SpecialistNameLink, specialistProfilePath } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import { bgRowsFrom } from './SpecialistBgPanel'
import { emptyRowStyle, errorStyle, footnoteStyle, headerRowStyle, refreshBtnStyle, rowStyle, selectStyle, tableStyle, totalsLabelStyle, totalsRowStyle, totalsSubStyle } from './accountingTable'

// Accounting > Specialists > VFO Specialist Background Checks > Background Check
// Reconciliation. The License Reconciliation shape: one row per specialist who has
// ever paid a background check (onboarding Core/Max OR an admin-sent request),
// all-time total, payment count, most recent paid date. Rolled up in the browser from
// the same specialist_bg_payments_load the monthly view reads, so the two tabs can
// never disagree.

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

export default function SpecialistBgReconciliationPanel({ embedded = false }) {
  const [paid, setPaid] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  // Re-open draws the last rows at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistbgrecon:')
    if (snap) { apply(snap); setLoading(false) }
    load(!!snap)
  }, [])

  function apply(res) { setPaid(bgRowsFrom(res).filter(r => r.state === 'paid' && r.paidAt)) }

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('specialist_bg_payments_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      apply(res)
      setLastSeen('specialistbgrecon:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  // specialist -> all-time total, payment count, most recent paid date.
  const rows = useMemo(() => {
    const map = {}
    for (const p of paid) {
      const key = String(p.name || 'unknown').toLowerCase()
      const t = map[key] || (map[key] = { key, expertId: null, name: p.name, total: 0, count: 0, last: null })
      if (!t.expertId && p.expertId) t.expertId = p.expertId
      t.total += Number(p.amount) || 0
      t.count += 1
      if (!t.last || new Date(p.paidAt) > new Date(t.last)) t.last = p.paidAt
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [paid])

  const tot = rows.reduce((s, r) => ({ total: s.total + r.total, count: s.count + r.count }), { total: 0, count: 0 })
  const lastOverall = rows.reduce((d, r) => (!d || (r.last && new Date(r.last) > new Date(d)) ? (r.last || d) : d), null)

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = selectStyle
  const grid = '1.4fr 120px 150px 150px'
  const muted = { color: 'var(--vfo-faint)' }

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Background Check Reconciliation</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button onClick={load} style={refreshBtnStyle}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={grid} />}
      {error && <div style={errorStyle}>{error}</div>}

      {!loading && !error && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gridTemplateColumns: grid }}>
            <span>Specialist</span><span style={{ textAlign: 'right' }}>Payments</span><span style={{ textAlign: 'right' }}>Total Collected</span><span style={{ textAlign: 'right' }}>Most Recent</span>
          </div>
          <div style={{ ...totalsRowStyle, gridTemplateColumns: grid }}>
            <span style={totalsLabelStyle}>Totals<span style={totalsSubStyle}>all time · paid checks</span></span>
            <span style={{ textAlign: 'right' }}>{tot.count}</span>
            <span style={{ textAlign: 'right' }}>{money(tot.total)}</span>
            <span style={{ textAlign: 'right' }}>{fmtDate(lastOverall)}</span>
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {rows.map(r => (
              <div key={r.key} onClick={r.expertId ? () => navigate(specialistProfilePath(r.expertId)) : undefined} {...(r.expertId ? rowHoverProps : {})} style={{ ...(r.expertId ? clickableRowStyle : null), ...rowStyle, gridTemplateColumns: grid }}>
                <span style={{ fontWeight: 600 }}><SpecialistNameLink expertId={r.expertId}>{r.name}</SpecialistNameLink></span>
                <span style={{ textAlign: 'right', color: 'var(--vfo-muted)' }}>{r.count}</span>
                <span style={{ textAlign: 'right', fontWeight: r.total ? 700 : 400, color: r.total ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{r.total ? money(r.total) : '—'}</span>
                <span style={{ textAlign: 'right', ...(r.last ? { color: 'var(--vfo-muted)' } : muted) }}>{fmtDate(r.last)}</span>
              </div>
            ))}
            {rows.length === 0 && <div style={emptyRowStyle}>No background check payments recorded yet.</div>}
          </div>
        </div>
      )}
      <p style={footnoteStyle}>All-time totals across every paid background check — onboarding Core/Max payments and payment requests sent from this tab. Specialists who have been sent a link but have not paid yet appear under Outstanding Payment Links.</p>
    </div>
  )
}
