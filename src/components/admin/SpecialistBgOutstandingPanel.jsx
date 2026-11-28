import { useState, useEffect, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { cardStyle, Detail, SectionHeader, EmptyLine, OutstandingCard } from './OutstandingLinksPanel'
import { OutstandingLinksSkeleton } from '../shared/Skeleton'
import { OutstandingEmpty } from './OutstandingLinksPanel'
import { errorStyle, refreshBtnStyle } from './accountingTable'
import { paymentStatusLabel } from '../../lib/paymentStatusLabel'
import { bgRowsFrom } from './SpecialistBgPanel'
import { formatDate } from '../../lib/dates'

// Accounting > Specialists > VFO Specialist Background Checks > Outstanding Payment Links.
// Two read-only groups from specialist_bg_payments_load:
//   1. unpaid admin-sent REQUESTS (requested / failed) — chased by the specialist sweep
//      (2-business-day reminder email, 4-business-day Tracy bell), both shown here;
//   2. unpaid ONBOARDING links (Stage 3 link sent, not paid) — chased by the onboarding
//      flow's own ladder, shown for completeness only.

// Same card shape as the License Fees Outstanding pill (LicenseLinkCard).
const BADGE = {
  awaiting: { label: 'Payment requested', color: '#0095ff' },
  failed: { label: 'Payment failed', color: '#ef4444' },
}

function LinkCard({ row }) {
  const badge = BADGE[row.state] || { label: paymentStatusLabel(row.state) || '—', color: '#6b7280' }
  return (
    <OutstandingCard
      name={row.name}
      expertId={row.expertId}
      subtitle={row.sentAt ? `Link sent ${formatDate(row.sentAt)}` : 'Link not sent yet'}
      badge={badge}
      amount={row.amount}
      caption={row.amount == null ? 'Core or Max' : 'due'}
    >
      <Detail label="Amount" value={row.amount == null ? 'Core $350 or Max $950 — not chosen yet' : money(row.amount)} />
      <Detail label="Link sent" value={formatDate(row.sentAt) || 'not yet'} />
      <Detail label="Status" value={badge.label} />
    </OutstandingCard>
  )
}
export default function SpecialistBgOutstandingPanel({ embedded = false }) {
  const [requests, setRequests] = useState([])
  const [onboarding, setOnboarding] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Re-open draws the last lists at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('specialistbgoutstanding:')
    if (snap) { apply(snap); setLoading(false) }
    load(!!snap)
  }, [])

  function apply(res) {
    const rows = bgRowsFrom(res)
    setRequests(rows.filter(r => r.source === 'request' && (r.state === 'awaiting' || r.state === 'failed')))
    // Only live onboardings — a stopped / denied one is not an outstanding link.
    setOnboarding(rows.filter(r => r.source === 'onboarding' && r.sentAt
      && (!r.onboardingStatus || r.onboardingStatus === 'active')
      && (r.state === 'awaiting' || r.state === 'failed')))
  }

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('specialist_bg_payments_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      apply(res)
      setLastSeen('specialistbgoutstanding:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = embedded
    ? { fontFamily: 'Inter, sans-serif' }
    : { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const empty = requests.length === 0 && onboarding.length === 0

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Outstanding Payment Links</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => load()} style={refreshBtnStyle}>Refresh</button>
      </div>

      {loading && <OutstandingLinksSkeleton />}
      {!loading && error && (
        <div style={errorStyle}>{error}</div>
      )}

      {!loading && !error && empty && (
        <OutstandingEmpty />
      )}

      {!loading && !error && !empty && (
        <div>
          <SectionHeader title="Background Check Payment Requests" count={requests.length} />
          {requests.length === 0 ? <EmptyLine /> : requests.map(r => <LinkCard key={r.key} row={r} />)}

          <SectionHeader title="Onboarding Background Check Links" count={onboarding.length} />
          {onboarding.length === 0 ? <EmptyLine /> : onboarding.map(r => <LinkCard key={r.key} row={r} />)}
        </div>
      )}
    </div>
  )
}
