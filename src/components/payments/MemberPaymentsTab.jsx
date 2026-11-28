import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { PaymentsTabSkeleton } from '../shared/Skeleton'
import PaymentsTable from './PaymentsTable'
import PaymentsHeader from './PaymentsHeader'
import { cardBox, ProfileCardHead, pullHead } from '../shared/ProfileKit'

// Read-only Payments tab for a member (admin view). Unifies three sources into one
// filterable, chronological list via member_payments_load:
//   • Onboarding fee        — the advisor/accountant onboarding payment that created them
//   • On behalf of clients  — MAP 1 / Tax payments they made for their clients
//   • Rev-share payouts      — money paid OUT to them via Stripe Connect
// The filter chips (in PaymentsTable) keep the three clearly separated.
const cardStyle = { ...cardBox, marginBottom: 0 }

export default function MemberPaymentsTab({ member }) {
  const memberNumber = member?.plugin_member_number
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { if (memberNumber) load() }, [memberNumber])

  async function load() {
    setLoading(true); setError(null)
    try {
      const d = await callApi('member_payments_load', { member_number: memberNumber })
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
        <ProfileCardHead icon="dollar" title="Payments" style={pullHead} />
        <div style={{ marginTop: '12px', padding: '14px 16px', background: '#fdecea', border: '1px solid #f7c4bd', borderRadius: '10px', color: '#b42318', fontSize: '13px' }}>{error}</div>
      </div>
    )
  }

  // Merge the three sections into one list (on-behalf rows are re-tagged so they
  // group under their own filter chip), then re-sort newest-first.
  const rows = [
    ...(data?.own || []),
    ...(data?.on_behalf || []).map(r => ({ ...r, category: 'On behalf of clients' })),
    ...(data?.payouts || []),
  ]
  rows.sort((a, b) => {
    const ta = a.date ? Date.parse(a.date) : -Infinity
    const tb = b.date ? Date.parse(b.date) : -Infinity
    return (isNaN(tb) ? -Infinity : tb) - (isNaN(ta) ? -Infinity : ta)
  })

  return (
    <div style={cardStyle}>
      <PaymentsHeader personType="member" personRef={memberNumber} />
      {data?.payout_error && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#fff7e6', border: '1px solid #f3d9a6', borderRadius: '10px', color: '#8a5200', fontSize: '12.5px' }}>
          Rev-share payout history could not be loaded from Stripe: {data.payout_error}
        </div>
      )}
      {/* Borrowed Connect account: the backend deliberately returns no payouts
          (they belong to the lead member's account, not this member's). */}
      {data?.payouts_linked_to && (
        <div style={{ marginBottom: '14px', padding: '10px 14px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', borderRadius: '10px', color: 'var(--vfo-muted)', fontSize: '12.5px' }}>
          Rev-share payouts are paid to {data.payouts_linked_to.name} ({data.payouts_linked_to.member_number})'s Stripe account.
        </div>
      )}
      <PaymentsTable rows={rows} emptyText="No payments recorded for this member yet." />
    </div>
  )
}
