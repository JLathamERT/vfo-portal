import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { PaymentsTabSkeleton } from '../shared/Skeleton'
import PaymentsTable from './PaymentsTable'
import PaymentsHeader from './PaymentsHeader'

// Read-only Payments tab for a specialist (admin view). Shows the one-time
// background-check payment + the full monthly $99 license history. The license
// history is pulled live from Stripe by specialist_payments_load (only the latest
// month is stored locally), so it reflects the real subscription invoices.
const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px' }
const titleStyle = { fontSize: '17px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '0 0 16px', fontFamily: 'Inter, sans-serif' }

export default function SpecialistPaymentsTab({ expertId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { if (expertId) load() }, [expertId])

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await callApi('specialist_payments_load', { expert_id: expertId })
      setData(d)
    } catch (e) {
      setError(e?.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <PaymentsTabSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div style={cardStyle}>
        <h3 style={titleStyle}>Payments</h3>
        <div style={{ marginTop: '12px', padding: '14px 16px', background: '#fdecea', border: '1px solid #f7c4bd', borderRadius: '10px', color: '#b42318', fontSize: '13px' }}>{error}</div>
      </div>
    )
  }

  const rows = data?.rows || []

  return (
    <div style={cardStyle}>
      <PaymentsHeader personType="specialist" personRef={expertId} />
      {data && !data.has_onboarding && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '10px', color: 'var(--vfo-muted)', fontSize: '12.5px' }}>
          No onboarding record is linked to this specialist, so there are no background-check or license payments to show (they were likely added to the directory manually).
        </div>
      )}
      {data?.license_error && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fff7e6', border: '1px solid #f3d9a6', borderRadius: '10px', color: '#8a5200', fontSize: '12.5px' }}>
          Monthly license history could not be loaded from Stripe: {data.license_error}
        </div>
      )}
      <PaymentsTable rows={rows} emptyText="No payments recorded for this specialist yet." />
    </div>
  )
}
