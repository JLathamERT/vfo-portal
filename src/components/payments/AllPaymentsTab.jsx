import { useState, useEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { Skeleton } from '../shared/Skeleton'
import PaymentsTable from './PaymentsTable'

// Admin GLOBAL Payments page — the top-level "Payments" tab in AdminPortal
// (Accounting-tab grant). One place to track every DB-resident payment across all clients,
// members and specialists, filterable by person type AND payment type. Backed by
// all_payments_load (accounting-tab gated). The two per-person sources that come LIVE from
// Stripe (specialist month-by-month license history; member rev-share payouts) are NOT
// shown here — they live on each person's own Payments tab; this page says so.
const wrap = { maxWidth: '1040px', margin: '0 auto', padding: '28px 24px' }
const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px' }
const titleStyle = { fontSize: '22px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0, fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }

export default function AllPaymentsTab() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Re-open draws the last list at once, refreshes behind it.
  useEffect(() => {
    const snap = getLastSeen('allpayments:')
    if (snap) { setData(snap); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError(null) }
    try {
      const d = await callApi('all_payments_load', {})
      setData(d)
      setLastSeen('allpayments:', d)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={wrap}>
        <Skeleton width={220} height={28} />
        <div style={{ ...card, marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} width="100%" height={42} />)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={wrap}>
        <h2 style={titleStyle}>Payments</h2>
        <div style={{ ...card, marginTop: '20px', background: '#fdecea', border: '1px solid #f7c4bd', color: '#b42318', fontSize: '13.5px' }}>{error}</div>
      </div>
    )
  }

  const rows = data?.rows || []

  return (
    <div style={wrap}>
      <h2 style={{ ...titleStyle, margin: '0 0 18px' }}>Payments</h2>
      <div style={card}>
        <PaymentsTable
          rows={rows}
          emptyText="No payments recorded yet."
          buckets={[
            { key: 'received', label: 'Payments received', match: r => r.category !== 'Rev-share payouts' && r.category !== 'Membership fee' },
            { key: 'membership', label: 'Membership', match: r => r.category === 'Membership fee' },
            { key: 'payouts', label: 'Revenue share payouts', match: r => r.category === 'Rev-share payouts' },
          ]}
        />
      </div>
    </div>
  )
}
