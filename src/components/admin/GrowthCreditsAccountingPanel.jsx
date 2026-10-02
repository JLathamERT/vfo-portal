import { useState, useEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { Skeleton, TableSkeleton } from '../shared/Skeleton'
import { MemberNameLink, useOpenMember } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'

// Accounting > Members > Growth Credits. Program-wide totals plus the full
// transaction ledger and every member's current balance. Read-only.

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

// `type` is "purchased" for BOTH a Stripe sale and an admin grant (gc_add_credits), so
// the label is derived from the Stripe session id instead — the thing only a real
// payment leaves behind. Mirrors GCMarketplaceViews.jsx, which shows the member the
// same word, and load-accounting.ts, which splits the totals on the same test (#465).
function TypeTag({ type, sessionId }) {
  const granted = type === 'purchased' && !sessionId
  const label = granted ? 'added' : (type || '—')
  const tone = granted
    ? { bg: 'rgba(0,149,255,0.16)', fg: '#0095ff' }
    : type === 'purchased'
    ? { bg: 'rgba(22,163,74,0.14)', fg: '#16a34a' }
    : type === 'refunded'
    ? { bg: 'rgba(0,149,255,0.16)', fg: '#0095ff' }
    : { bg: 'rgba(217,48,37,0.14)', fg: '#d93025' }
  return <span style={{ padding: '3px 10px', borderRadius: '20px', background: tone.bg, color: tone.fg, fontSize: '11.5px', fontWeight: 700 }}>{label}</span>
}

export default function GrowthCreditsAccountingPanel() {
  const openMember = useOpenMember()
  // Every row here is one member's, so a row click opens that member.
  const memberRow = mn => (mn ? { onClick: () => openMember(mn), ...rowHoverProps } : {})
  const memberRowStyle = mn => (mn ? { ...clickableRowStyle, background: 'var(--vfo-card)' } : null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Re-open draws the last figures at once, refreshes behind them.
  useEffect(() => {
    const snap = getLastSeen('gcaccounting:')
    if (snap) { setData(snap); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('gc_load_accounting')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setData(res)
      setLastSeen('gcaccounting:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const wrap = { padding: '24px', maxWidth: '1050px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const totals = data?.totals || {}
  const cards = [
    { label: 'Credits Sold', value: totals.credits_purchased ?? 0 },
    // Comped credits used to be counted as Sold. They are still real issued credits a
    // member can spend, so they get their own tile rather than disappearing.
    { label: 'Credits Granted', value: totals.credits_granted ?? 0 },
    { label: 'Credits Spent', value: totals.credits_spent ?? 0 },
    { label: 'Credits Refunded', value: totals.credits_refunded ?? 0 },
    { label: 'Revenue', value: money(totals.revenue_usd || 0) },
    { label: 'Outstanding Balance', value: totals.outstanding_credits ?? 0 },
  ]

  const tableWrap = { border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '22px' }
  const txCols = '150px 1.3fr 120px 90px 110px 1.4fr'
  const balCols = '1fr 120px'

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · Members</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Growth Credits</h2>
      </div>

      {loading && (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '22px' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ flex: 1, minWidth: '160px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px 16px', textAlign: 'center' }}>
                <Skeleton width={64} height={26} style={{ margin: '0 auto' }} />
                <Skeleton width={90} height={10} style={{ margin: '10px auto 0' }} />
              </div>
            ))}
          </div>
          <div style={{ marginBottom: '22px' }}>
            <TableSkeleton cols={[1.2, 1.3, 1, 0.8, 1, 1.4]} rows={4} />
          </div>
          <Skeleton width={130} height={13} style={{ margin: '4px 2px 10px' }} />
          <TableSkeleton cols={[3, 1]} rows={3} />
        </>
      )}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '22px' }}>
            {cards.map(c => (
              <div key={c.label} style={{ flex: 1, minWidth: '160px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '18px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-heading)' }}>{c.value}</div>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginTop: '6px' }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={tableWrap}>
            <div style={{ display: 'grid', gridTemplateColumns: txCols, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
              <span>Date</span><span>Member</span><span>Type</span><span style={{ textAlign: 'right' }}>Credits</span><span style={{ textAlign: 'right' }}>Amount</span><span>Description</span>
            </div>
            {(data.transactions || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No transactions yet.</div>
            )}
            {(data.transactions || []).map(t => (
              <div key={t.id} {...memberRow(t.member_number)} style={{ ...memberRowStyle(t.member_number), display: 'grid', gridTemplateColumns: txCols, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(t.created_at)}</span>
                <span><MemberNameLink memberNumber={t.member_number} style={{ fontWeight: 600 }}>{t.member_name}</MemberNameLink></span>
                <span><TypeTag type={t.type} sessionId={t.stripe_session_id} /></span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: (t.amount || 0) < 0 ? '#d93025' : '#16a34a' }}>{(t.amount || 0) > 0 ? '+' : ''}{t.amount}</span>
                <span style={{ textAlign: 'right' }}>{t.amount_usd != null ? money(t.amount_usd) : '—'}</span>
                <span style={{ color: 'var(--vfo-muted)' }}>{t.description || '—'}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '4px 2px 10px' }}>Member Balances</div>
          <div style={tableWrap}>
            <div style={{ display: 'grid', gridTemplateColumns: balCols, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
              <span>Member</span><span style={{ textAlign: 'right' }}>Balance</span>
            </div>
            {(data.balances || []).length === 0 && (
              <div style={{ textAlign: 'center', padding: '36px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No balances yet.</div>
            )}
            {(data.balances || []).map(b => (
              <div key={b.member_number} {...memberRow(b.member_number)} style={{ ...memberRowStyle(b.member_number), display: 'grid', gridTemplateColumns: balCols, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                <span><MemberNameLink memberNumber={b.member_number} style={{ fontWeight: 600 }}>{b.member_name}</MemberNameLink></span>
                <span style={{ textAlign: 'right', fontWeight: 700 }}>{b.balance}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
