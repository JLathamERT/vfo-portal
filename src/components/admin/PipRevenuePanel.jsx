import { useState, useEffect, useMemo } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { NAVY, money } from './specialistRevenueShared'
import { inPeriod } from './holisticShared'
import { clearedPipPurchases } from './pipShared'
import { ShareCell, PendingNote, SubNote, HeldNote, heldReason, isMoneyMappingLeg } from './shareLegState'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { ClientNameLink, MemberNameLink, clientPagePath } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import { useNavigate } from 'react-router-dom'

// Accounting > VFO Services > Additional PIP Revenue. Each additional-PIP purchase
// (additional PIP meetings or Tax Planning) that cleared in the chosen month/year, with
// connected member and the member vs VFOS (Elite VFO Income) revenue split.
//
// The member share is money owed, not money moved: it carries a tiny note saying whether
// the transfer has actually gone out, and an unpaid one renders dimmed. Elite VFO Income
// has no payout leg, but it is marked the same way while the payment itself is still
// clearing. The amounts and the totals are the full split either way — the pending and
// held sub-notes under each member total say how much of it is still sitting in the VFO
// balance, and which part of that is parked behind a suspended or paused member rather
// than merely not sent yet.
//
// The member's slice lands in one of two columns depending on the member's revenue
// decision, because a Money Mapping member is credited growth credits rather than paid
// cash. Same routing the Reconciliation panel uses; the other column shows a dash.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

// PIP carries its own history IN the status ('Completed - Money Mapping' vs
// 'Completed - Revenue Share'), so a settled purchase buckets by what happened; only an
// unsettled one falls back to the member's current decision. See isMoneyMappingLeg.
const isMoneyMapping = p => isMoneyMappingLeg(p.memberState, p.decision)

// Inside the Money Mapping column the leg's own 'money mapping' note only repeats the
// column header, so it reads as 'credited' there. Every other note is left alone.
const creditedNote = st => (st?.note === 'money mapping' ? { ...st, note: 'credited' } : st)

const dashCell = { textAlign: 'right', color: '#c7d0de' }

export default function PipRevenuePanel({ embedded = false }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  // Re-open draws the last rows at once, refreshes behind them.
  useEffect(() => {
    const snap = getLastSeen('piprevenue:')
    if (snap) { setRows(snap.rows || []); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('pip_additional_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setRows(res.rows || [])
      setLastSeen('piprevenue:', res)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const payments = useMemo(() => clearedPipPurchases(rows), [rows])

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    payments.forEach(p => { if (p.clearedAt) set.add(new Date(p.clearedAt).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [payments])

  const filtered = useMemo(() => payments
    .filter(p => inPeriod(p.clearedAt, year, month))
    .sort((a, b) => new Date(b.clearedAt) - new Date(a.clearedAt)),
    [payments, year, month])

  const totGross = filtered.reduce((s, p) => s + p.amount, 0)
  const totMemberRev = filtered.reduce((s, p) => s + (isMoneyMapping(p) ? 0 : p.member), 0)
  const totMM = filtered.reduce((s, p) => s + (isMoneyMapping(p) ? p.member : 0), 0)
  const totVfos = filtered.reduce((s, p) => s + p.vfos, 0)
  // A held leg is pending too, but it is parked for a knowable reason, so it comes OUT of
  // the plain pending note and gets its own — the two notes partition what is still owed.
  const pend = p => p.memberState?.tone === 'pending'
  const heldOf = p => heldReason(p.memberState)
  const sumMember = fn => filtered.reduce((s, p) => s + (fn(p) ? p.member : 0), 0)
  const pendMemberRev = sumMember(p => !isMoneyMapping(p) && pend(p) && !heldOf(p))
  const pendMM = sumMember(p => isMoneyMapping(p) && pend(p) && !heldOf(p))
  const heldMemberRev = sumMember(p => !isMoneyMapping(p) && heldOf(p))
  const heldMM = sumMember(p => isMoneyMapping(p) && heldOf(p))
  const pendVfos = filtered.reduce((s, p) => s + (p.vfosState?.tone === 'pending' ? p.vfos : 0), 0)
  const periodLabel = month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '110px 1.2fr 1.1fr 1.1fr 104px 104px 104px 110px'

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · VFO Services</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Additional PIP Revenue</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
          <option value={-1}>All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <button onClick={load} style={{ ...sel, color: '#125ecc', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={8} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Cleared</span><span>Client</span><span>Connected Member</span><span>Purchased</span><span style={{ textAlign: 'right', borderRight: '1px solid var(--vfo-border-strong)', paddingRight: '12px' }}>Received</span><span style={{ textAlign: 'right' }}>Member Revenue Share</span><span style={{ textAlign: 'right' }}>Member Money Mapping</span><span style={{ textAlign: 'right' }}>Elite VFO Income</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
            <span /><span /><span />
            <span style={{ textAlign: 'right', borderRight: '1px solid var(--vfo-border-strong)', paddingRight: '12px' }}>{money(totGross)}</span>
            <span style={{ textAlign: 'right' }}>{totMemberRev ? money(totMemberRev) : '—'}<PendingNote amount={pendMemberRev} money={money} /><HeldNote total={heldMemberRev} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{totMM ? money(totMM) : '—'}<PendingNote amount={pendMM} money={money} /><HeldNote total={heldMM} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{money(totVfos)}<PendingNote amount={pendVfos} money={money} /></span>
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No additional-PIP purchases cleared in this period.</div>
          )}
          {filtered.map(p => (
            <div key={p.id} onClick={p.clientId ? () => navigate(clientPagePath(p.clientId, { program: 1, tab: 'pip' })) : undefined} {...(p.clientId ? rowHoverProps : {})}
              style={{ ...(p.clientId ? clickableRowStyle : null), display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
              <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(p.clearedAt)}</span>
              <span style={{ fontWeight: 600 }}><ClientNameLink clientId={p.clientId} program={1} tab="home">{p.clientName}</ClientNameLink></span>
              <span>{p.memberName ? <MemberNameLink memberNumber={p.memberNumber}>{p.memberName}</MemberNameLink> : '—'}{p.memberNumber && <span style={{ color: 'var(--vfo-faint)' }}> · {p.memberNumber}</span>}</span>
              <span style={{ color: 'var(--vfo-muted)' }}>{p.kindLabel}</span>
              <span style={{ textAlign: 'right', fontWeight: 700, borderRight: '1px solid var(--vfo-tint)', paddingRight: '12px' }}>{money(p.amount)}<SubNote text={p.paymentNote} /></span>
              {isMoneyMapping(p) ? (
                <>
                  <span style={dashCell}>—</span>
                  <ShareCell value={p.member} state={creditedNote(p.memberState)} money={money} color={p.member > 0 ? 'var(--vfo-ink)' : '#c7d0de'} fontWeight={p.member > 0 ? 600 : 400} dash="—" />
                </>
              ) : (
                <>
                  <ShareCell value={p.member} state={p.memberState} money={money} color={p.member > 0 ? '#16a34a' : '#c7d0de'} fontWeight={p.member > 0 ? 600 : 400} dash="—" />
                  <span style={dashCell}>—</span>
                </>
              )}
              <ShareCell value={p.vfos} state={p.vfosState} money={money} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
