import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { cardStyle, Detail, SectionHeader, EmptyLine, OutstandingCard, fmtDate, shortDate } from './OutstandingLinksPanel'
import { OnboardingListSkeleton } from '../shared/Skeleton'
import { bgRowsFrom } from './SpecialistBgPanel'

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
  const badge = BADGE[row.state] || { label: row.state || '—', color: 'var(--vfo-muted)' }
  return (
    <OutstandingCard
      name={row.name}
      subtitle={row.sentAt ? `Link sent ${shortDate(row.sentAt)}` : 'Link not sent yet'}
      badge={badge}
      amount={row.amount}
      caption={row.amount == null ? 'Core or Max' : 'due'}
    >
      <Detail label="Amount" value={row.amount == null ? 'Core $350 or Max $950 — not chosen yet' : money(row.amount)} />
      <Detail label="Link sent" value={fmtDate(row.sentAt) || 'not yet'} />
      <Detail label="Status" value={badge.label} />
    </OutstandingCard>
  )
}
export default function SpecialistBgOutstandingPanel({ embedded = false }) {
  const [requests, setRequests] = useState([])
  const [onboarding, setOnboarding] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('specialist_bg_payments_load')
      if (res?.error) { setError(res.error); return }
      const rows = bgRowsFrom(res)
      setRequests(rows.filter(r => r.source === 'request' && (r.state === 'awaiting' || r.state === 'failed')))
      // Only live onboardings — a stopped / denied one is not an outstanding link.
      setOnboarding(rows.filter(r => r.source === 'onboarding' && r.sentAt
        && (!r.onboardingStatus || r.onboardingStatus === 'active')
        && (r.state === 'awaiting' || r.state === 'failed')))
    } catch (e) {
      setError(e?.message || 'Failed to load')
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <button type="button" onClick={() => load()}
          style={{ background: 'none', border: 'none', padding: 0, color: '#125ecc', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
          Refresh
        </button>
      </div>

      {loading && <OnboardingListSkeleton rows={3} />}
      {!loading && error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>
      )}

      {!loading && !error && empty && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No outstanding background check links - everyone who was sent one has paid.
        </div>
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
