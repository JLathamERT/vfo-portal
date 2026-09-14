import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { ordinal } from '../../lib/ordinal'
import { money } from './specialistRevenueShared'
import { cardStyle, Detail, SectionHeader, EmptyLine, OutstandingCard, fmtDate, shortDate } from './OutstandingLinksPanel'
import { OnboardingListSkeleton } from '../shared/Skeleton'

// Accounting > Specialists > VFO Specialist License Fees > Outstanding Payment Links.
// The same surface the SpecRev pill row carries, for license setup links: every
// specialist who was emailed a $99/mo ACH setup link and has not cleared a payment yet.
// Read-only — the ledger tab owns the sending.

// Where a specialist sits before their first license payment clears. Vocabulary is
// borrowed rather than invented: setup_pending from the Specialist Recurring panel,
// scheduled from Membership Fees, processing/past due/failed from the SpecRev statuses.
const PENDING_STATUS = {
  setup_pending: { label: 'Setup pending', color: '#0095ff' },
  scheduled: { label: 'Awaiting first payment', color: '#0095ff' },
  awaiting_verification: { label: 'Awaiting bank verification', color: '#e06717' },
  processing: { label: 'Payment processing', color: '#e06717' },
  past_due: { label: 'Past due', color: '#ef4444' },
  failed: { label: 'Payment failed', color: '#ef4444' },
}

function LicenseLinkCard({ item }) {
  const badge = PENDING_STATUS[item.state] || { label: item.state || '—', color: 'var(--vfo-muted)' }
  const parts = []
  parts.push(item.link_sent_at ? `Link sent ${shortDate(item.link_sent_at)}` : 'Link not sent yet')
  if (item.charge_day) parts.push(`charge day ${ordinal(item.charge_day)}`)
  return (
    <OutstandingCard
      name={item.specialist_name}
      subtitle={parts.join(' · ')}
      badge={badge}
      amount={99}
      caption="per month"
    >
      <Detail label="Monthly amount" value={money(99)} />
      <Detail label="Charge day" value={item.charge_day ? `${ordinal(item.charge_day)} of the month` : 'not set'} />
      <Detail label="Link sent" value={fmtDate(item.link_sent_at) || 'not yet'} />
      <Detail label="Status" value={badge.label} />
      <Detail label="Payment method" value={item.method === 'ach' ? 'Bank transfer (ACH)' : (item.method || 'not saved yet')} />
    </OutstandingCard>
  )
}

export default function SpecialistLicenseOutstandingPanel({ embedded = false }) {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('specialist_license_payments_load')
      if (res?.error) { setError(res.error); return }
      setPending(res.pending || [])
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = embedded
    ? { fontFamily: 'Inter, sans-serif' }
    : { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }

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

      {!loading && !error && pending.length === 0 && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
          No outstanding license links - everyone who was sent a link has completed it.
        </div>
      )}

      {!loading && !error && pending.length > 0 && (
        <div>
          <SectionHeader title="License Fees - Awaiting First Payment" count={pending.length} />
          {pending.length === 0 ? <EmptyLine /> : pending.map((it, i) => (
            <LicenseLinkCard key={it.onboarding_id ?? `${it.expert_id}-${i}`} item={it} />
          ))}
        </div>
      )}
    </div>
  )
}
