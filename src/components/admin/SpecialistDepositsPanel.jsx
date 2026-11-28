import { useState, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money, RequestRow, MarkReceivedButton, DeleteRequestButton, canDeleteSpecrevRequest, StatusPill, CopyField } from './specialistRevenueShared'
import { tableStyle, headerRowStyle, totalsRowStyle, totalsLabelStyle, SPECIALIST_GRID } from './SpecialistRevenuePanel'
import { CARD_FEE_LABEL } from './cardFeeColumn'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { SpecialistNameLink } from '../shared/personLinks'
import { footnoteStyle } from './accountingTable'
import { formatDate } from '../../lib/dates'
import { cardBox } from '../shared/ProfileKit'

// Accounting > Specialists > VFO Specialist Revenue > Bank Transfer Account. The shared
// Stripe account specialists push bank transfers to, read live (specialist_revenue_deposits_load):
// what is sitting in it, every movement, and the payments waiting for money. The account
// is pooled, so a person decides what a deposit is for; "Mark payment received" collects it.

const SNAP = 'specialistdeposits:'

const NETWORK = { ach: 'ACH', domestic_wire_us: 'Wire', fednow: 'FedNow', rtp: 'Real-time payment', swift: 'SWIFT' }

const TYPE_LABEL = {
  applied_to_payment: 'Applied to a payment',
  unapplied_from_payment: 'Put back',
  refunded_from_payment: 'Refunded into the account',
  funding_reversed: 'Deposit reversed',
  return_initiated: 'Sent back to the sender',
  return_canceled: 'Return canceled',
  transferred_to_balance: 'Moved to our Stripe balance by Stripe',
  adjusted_for_overdraft: 'Overdraft adjustment',
}

export default function SpecialistDepositsPanel({ embedded = false }) {
  const [data, setData] = useState(null)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    const snap = getLastSeen(SNAP)
    if (snap) { setData(snap.data); setRequests(snap.requests || []); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const [dep, rev] = await Promise.all([callApi('specialist_revenue_deposits_load'), callApi('specialist_revenue_load')])
      if (dep?.error || rev?.error) { setError(dep?.error || rev?.error); return }
      const waiting = (rev.requests || []).filter(r => r.payment_status === 'pending' && !!r.sandbox === !!dep.sandbox)
      setError('')
      setData(dep); setRequests(waiting)
      setLastSeen(SNAP, { data: dep, requests: waiting })
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const btn = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-accent-text)', fontWeight: 600, cursor: 'pointer' }
  const cardStyle = { ...cardBox, borderRadius: '14px', padding: '18px 20px', marginBottom: 0 }
  const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }
  const heading = { fontSize: '14px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '24px 0 10px' }
  const grid = '104px 1.5fr 150px 1.2fr 120px 130px'
  const row = { display: 'grid', gridTemplateColumns: grid, gap: '12px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }

  const acct = data?.account
  const movements = data?.movements || []
  const waitingTotal = requests.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0)
  const stripeUrl = acct?.stripe_account_id ? `https://dashboard.stripe.com/${acct.stripe_account_id}/${data.sandbox ? 'test/' : ''}customers/${acct.stripe_customer_id}` : null

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button onClick={() => load()} style={btn}>Refresh</button>
        {stripeUrl && (
          <a href={stripeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-accent-text)', textDecoration: 'none' }}>View account activity in Stripe ↗</a>
        )}
        {data?.sandbox && <StatusPill label="Sandbox" color="#e06717" />}
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '18px' }}>{error}</div>}
      {loading && <AccountingTableSkeleton cols={grid} />}

      {!loading && data && !acct && (
        <div style={{ ...cardStyle, textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '14px', padding: '40px' }}>The bank transfer account is set up the first time a Bank transfer payment is entered.</div>
      )}

      {!loading && acct && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(220px, 1fr) 2fr', gap: '14px' }}>
            <div style={cardStyle}>
              <div style={label}>In the account, not collected</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: data.balance > 0 ? '#e06717' : 'var(--vfo-heading)', marginTop: '6px' }}>{money(data.balance)}</div>
            </div>
            <div style={cardStyle}>
              <div style={label}>Payments waiting for money</div>
              <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--vfo-heading)', marginTop: '6px' }}>{money(waitingTotal)}</div>
              <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{requests.length} payment{requests.length === 1 ? '' : 's'}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ ...label, marginBottom: '10px' }}>Bank transfer account</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px 20px' }}>
                <CopyField label="Bank name" value={acct.bank_name} />
                <CopyField label="Routing number" value={acct.routing_number} />
                <CopyField label="Account holder" value={acct.holder_name} />
                <CopyField label="Account number" value={acct.account_number} />
              </div>
            </div>
          </div>

          <div style={heading}>Payments waiting for money</div>
          <div style={tableStyle}>
            <div style={{ ...headerRowStyle, gridTemplateColumns: SPECIALIST_GRID }}>
              <span>Specialist</span><span>Date</span><span style={{ textAlign: 'right' }}>Recipients</span><span style={{ textAlign: 'right' }}>Deals</span><span style={{ textAlign: 'right' }}>Member $</span><span style={{ textAlign: 'right' }}>ERT $</span><span style={{ textAlign: 'right' }}>VFOS $</span><span style={{ textAlign: 'right' }}>Gross</span><span style={{ textAlign: 'right' }}>{CARD_FEE_LABEL}</span><span style={{ textAlign: 'right' }}>Status</span>
            </div>
            {requests.map(r => (
              <RequestRow key={r.id} request={r} grid={SPECIALIST_GRID} actions={({ request }) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <MarkReceivedButton request={request} onDone={() => load(true)} />
                  {canDeleteSpecrevRequest(request) && <DeleteRequestButton request={request} onDone={() => load(true)} />}
                </div>
              )} />
            ))}
            {requests.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No payments are waiting for a bank transfer.</div>}
          </div>

          <div style={heading}>Account activity</div>
          <div style={tableStyle}>
            <div style={{ ...headerRowStyle, gap: '12px', gridTemplateColumns: grid }}>
              <span>Date</span><span>What</span><span>Sent by</span><span>Status</span><span style={{ textAlign: 'right' }}>Amount</span><span style={{ textAlign: 'right' }}>Account balance</span>
            </div>
            <div style={{ ...totalsRowStyle, gap: '12px', gridTemplateColumns: grid }}>
              <span style={totalsLabelStyle}>Balance</span><span /><span /><span /><span /><span style={{ textAlign: 'right' }}>{money(data.balance)}</span>
            </div>
            {movements.map(m => {
              const deposit = m.type === 'funded'
              const collected = m.type === 'applied_to_payment'
              return (
                <div key={m.id} style={row}>
                  <span style={{ color: 'var(--vfo-muted)' }}>{formatDate(m.created_at, '—')}</span>
                  <span style={{ minWidth: 0 }}>
                    {deposit
                      ? <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>Deposit from {m.sender_name || 'unknown sender'}</span>
                      : <span style={{ fontWeight: 600 }}>{TYPE_LABEL[m.type] || m.type}{collected && (m.specialist_name
                        ? <> for <SpecialistNameLink expertId={m.expert_id}>{m.specialist_name}</SpecialistNameLink></>
                        : ' in Stripe, outside Specialist Revenue')}</span>}
                    {m.reference && <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px', overflowWrap: 'anywhere' }}>{m.reference}</div>}
                  </span>
                  <span style={{ color: 'var(--vfo-muted)' }}>{deposit ? (NETWORK[m.network] || m.network || '—') : '—'}</span>
                  <span>
                    {deposit && (m.unmatched > 0
                      ? <>
                        <StatusPill label={m.unmatched < m.amount ? `${money(m.unmatched)} not collected` : 'Not collected'} color="#e06717" />
                        <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '4px', lineHeight: 1.4 }}>Stripe tries to send it back after {formatDate(m.return_after, '—')}</div>
                      </>
                      : <StatusPill label="Collected" color="#16a34a" />)}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: m.amount < 0 ? 'var(--vfo-muted)' : 'var(--vfo-heading)' }}>{m.amount < 0 ? `-${money(-m.amount)}` : money(m.amount)}</span>
                  <span style={{ textAlign: 'right', color: 'var(--vfo-muted)' }}>{money(m.ending_balance)}</span>
                </div>
              )
            })}
            {movements.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--vfo-faint)', fontSize: '14px' }}>Nothing has been paid into this account yet.</div>}
          </div>
          {data.truncated && <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '10px' }}>Showing the newest {movements.length} movements. Older ones are in Stripe.</p>}
          <p style={footnoteStyle}>Every specialist pays into this one account, so Stripe doesn't know what a deposit is for. Find the payment above and click Mark payment received, or enter it first in + New Payment as a Bank transfer with no email. When part of the balance is used, the oldest deposit counts as used first.</p>
        </>
      )}
    </div>
  )
}
