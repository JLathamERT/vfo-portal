import { useState, useEffect, useMemo } from 'react'
import { callApi } from '../../lib/api'
import { NAVY, money } from './specialistRevenueShared'
import { inPeriod } from './holisticShared'
import { clearedTaxPayments } from './taxShared'
import { ShareCell, PendingNote, SubNote, HeldNote, heldReason, isMoneyMappingLeg } from './shareLegState'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { ClientNameLink, MemberNameLink } from '../shared/personLinks'

// Accounting > VFO Services > Tax Planning Revenue. Each tax payment (retainer or
// implementation) that cleared in the chosen month/year — connected member, program
// (Tax Priorities / Tax Planning), and the member vs tax planner vs VFOS revenue split.
// No scheduled payments, no outbound revenue-share payouts.
//
// A split slice is money owed, not money moved: each of the three payout legs carries a
// tiny note saying whether it has actually paid out, and an unpaid one renders dimmed.
// Elite VFO Income has no payout leg, but it is marked the same way while the payment
// itself is still clearing. The amounts and the totals are the full split either way —
// the pending and held sub-notes under each member total say how much of it is still
// sitting in the VFO balance, and which part of that is parked behind a suspended or
// paused member rather than merely not sent yet.
//
// The member's slice lands in one of two columns depending on the member's revenue
// decision, because a Money Mapping member is credited growth credits rather than paid
// cash. Same routing the Reconciliation panel uses; the other column shows a dash.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function fmtDate(s) {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) } catch { return String(s) }
}

// A settled leg buckets by what actually happened; only an unsettled one falls back to
// the member's current decision. See isMoneyMappingLeg.
const isMoneyMapping = p => isMoneyMappingLeg(p.memberState, p.decision)

// Inside the Money Mapping column the leg's own 'money mapping' note only repeats the
// column header, so it reads as 'credited' there. Every other note is left alone.
const creditedNote = st => (st?.note === 'money mapping' ? { ...st, note: 'credited' } : st)

const dashCell = { textAlign: 'right', color: '#c7d0de' }

// Two payments of ONE collection (a 3-payment plan's initial + final retainer) share a
// faint tint and a tie bar down their left edge; the divider between them softens to a
// dashed hairline so the block reads as one and the rows either side stay separate.
// Only ever applied to those pairs — every other row keeps the plain style.
function bandRow(band) {
  return {
    background: 'rgba(18,94,204,0.035)',
    borderLeft: '3px solid rgba(18,94,204,0.22)',
    paddingLeft: '15px',
    ...(band === 'mid' ? { borderBottom: '1px dashed var(--vfo-border-chip)' } : null),
  }
}

function ProgramTag({ label }) {
  const planning = label === 'Tax Planning'
  const c = planning ? { bg: 'rgba(147,51,234,0.12)', fg: '#7c3aed' } : { bg: 'rgba(18,94,204,0.10)', fg: '#125ecc' }
  return <span style={{ padding: '3px 10px', borderRadius: '20px', background: c.bg, color: c.fg, fontSize: '11px', fontWeight: 700 }}>{label}</span>
}

export default function TaxRevenuePanel({ embedded = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('tax_planning_load')
      if (res?.error) { setError(res.error); return }
      setRows(res.rows || [])
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const payments = useMemo(() => clearedTaxPayments(rows), [rows])

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    payments.forEach(p => { if (p.clearedAt) set.add(new Date(p.clearedAt).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [payments])

  // Newest-first, except that the two payments of a 3-payment retainer are ONE collection
  // and must read as one: any other client's payment could otherwise land between them by
  // date. The pair is pulled together at the newer one's position and banded (band: 'mid'
  // for every row but the last of the block) so the tie is visible. A block with only one
  // of its two rows inside the period is left completely alone.
  const filtered = useMemo(() => {
    const list = payments
      .filter(p => inPeriod(p.clearedAt, year, month))
      .sort((a, b) => new Date(b.clearedAt) - new Date(a.clearedAt))
    const blockSize = {}
    for (const p of list) if (p.retainerBlock) blockSize[p.retainerBlock] = (blockSize[p.retainerBlock] || 0) + 1
    const out = []
    const placed = new Set()
    for (const p of list) {
      if (placed.has(p.id)) continue
      if (!p.retainerBlock || blockSize[p.retainerBlock] < 2) { placed.add(p.id); out.push(p); continue }
      const block = list.filter(q => q.retainerBlock === p.retainerBlock)
      block.forEach((q, i) => { placed.add(q.id); out.push({ ...q, band: i === block.length - 1 ? 'end' : 'mid' }) })
    }
    return out
  }, [payments, year, month])

  const totGross = filtered.reduce((s, p) => s + p.amount, 0)
  const totMemberRev = filtered.reduce((s, p) => s + (isMoneyMapping(p) ? 0 : p.member), 0)
  const totMM = filtered.reduce((s, p) => s + (isMoneyMapping(p) ? p.member : 0), 0)
  const totVfos = filtered.reduce((s, p) => s + p.vfos, 0)
  const totPlanner = filtered.reduce((s, p) => s + (p.planner || 0), 0)
  const totStrategic = filtered.reduce((s, p) => s + (p.strategic || 0), 0)
  const pend = st => st?.tone === 'pending'
  // A held leg is pending too, but it is parked for a knowable reason, so it comes OUT of
  // the plain pending note and gets its own — the two notes partition what is still owed.
  const heldOf = p => heldReason(p.memberState)
  const sumMember = fn => filtered.reduce((s, p) => s + (fn(p) ? p.member : 0), 0)
  const pendMemberRev = sumMember(p => !isMoneyMapping(p) && pend(p.memberState) && !heldOf(p))
  const pendMM = sumMember(p => isMoneyMapping(p) && pend(p.memberState) && !heldOf(p))
  const heldMemberRev = sumMember(p => !isMoneyMapping(p) && heldOf(p))
  const heldMM = sumMember(p => isMoneyMapping(p) && heldOf(p))
  const pendPlanner = filtered.reduce((s, p) => s + (pend(p.plannerState) ? (p.planner || 0) : 0), 0)
  const pendStrategic = filtered.reduce((s, p) => s + (pend(p.strategicState) ? (p.strategic || 0) : 0), 0)
  const pendVfos = filtered.reduce((s, p) => s + (pend(p.vfosState) ? p.vfos : 0), 0)
  const periodLabel = month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1100px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '92px 1.2fr 1.1fr 92px 96px 96px 96px 92px 100px 88px'

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · VFO Services</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Tax Planning Revenue</h2>
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

      {loading && <AccountingTableSkeleton cols={10} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Cleared</span><span>Client</span><span>Connected Member</span><span>Program</span><span style={{ textAlign: 'right', borderRight: '1px solid var(--vfo-border-strong)', paddingRight: '12px' }}>Received</span><span style={{ textAlign: 'right' }}>Member Revenue Share</span><span style={{ textAlign: 'right' }}>Member Money Mapping</span><span style={{ textAlign: 'right' }}>Tax Planner</span><span style={{ textAlign: 'right' }}>Elite VFO Income</span><span style={{ textAlign: 'right' }}>Strategic Partner Revenue Share</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
            <span /><span /><span />
            <span style={{ textAlign: 'right', borderRight: '1px solid var(--vfo-border-strong)', paddingRight: '12px' }}>{money(totGross)}</span>
            <span style={{ textAlign: 'right' }}>{totMemberRev ? money(totMemberRev) : '—'}<PendingNote amount={pendMemberRev} money={money} /><HeldNote total={heldMemberRev} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{totMM ? money(totMM) : '—'}<PendingNote amount={pendMM} money={money} /><HeldNote total={heldMM} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{totPlanner ? money(totPlanner) : '—'}<PendingNote amount={pendPlanner} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{money(totVfos)}<PendingNote amount={pendVfos} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{totStrategic ? money(totStrategic) : '—'}<PendingNote amount={pendStrategic} money={money} /></span>
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No Tax payments cleared in this period.</div>
          )}
          {filtered.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', ...(p.band ? bandRow(p.band) : null) }}>
              <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(p.clearedAt)}</span>
              <span style={{ fontWeight: 600 }}><ClientNameLink clientId={p.clientId} tab="tax">{p.clientName}</ClientNameLink><span style={{ color: 'var(--vfo-faint)', fontWeight: 400 }}> · {p.kind}</span></span>
              <span>{p.memberName ? <MemberNameLink memberNumber={p.memberNumber}>{p.memberName}</MemberNameLink> : '—'}{p.memberNumber && <span style={{ color: 'var(--vfo-faint)' }}> · {p.memberNumber}</span>}</span>
              <span><ProgramTag label={p.tier} /></span>
              <span style={{ textAlign: 'right', fontWeight: 700, borderRight: '1px solid var(--vfo-tint)', paddingRight: '12px' }}>{money(p.amount)}<SubNote text={p.paymentNote} /><SubNote text={p.licence > 0 ? `${money(p.licence)} to VFO Portal (client portal licence)` : null} /></span>
              {/* A 3-payment plan's INITIAL retainer moves no share at all — every leg
                  fires later, on the full retainer, when the final payment settles. Its
                  slices are zero, so the cells keep their dashes and carry the leg note
                  (noteOnZero) saying what they are still waiting on. */}
              {isMoneyMapping(p) ? (
                <>
                  <span style={dashCell}>—</span>
                  <ShareCell value={p.member} state={creditedNote(p.memberState)} money={money} color={p.member > 0 ? 'var(--vfo-ink)' : '#c7d0de'} fontWeight={p.member > 0 ? 600 : 400} dash="—" noteOnZero={p.sharesDeferred} />
                </>
              ) : (
                <>
                  <ShareCell value={p.member} state={p.memberState} money={money} color={p.member > 0 ? '#16a34a' : '#c7d0de'} fontWeight={p.member > 0 ? 600 : 400} dash="—" noteOnZero={p.sharesDeferred} />
                  <span style={dashCell}>—</span>
                </>
              )}
              <ShareCell value={p.planner} state={p.plannerState} money={money} color={p.planner > 0 ? 'var(--vfo-ink)' : '#c7d0de'} fontWeight={p.planner > 0 ? 600 : 400} dash="—" noteOnZero={p.sharesDeferred} />
              {/* Elite VFO Income normally prints $0.00 rather than a dash; a deferred
                  row has no income to book YET, so it reads as a dash like its siblings.
                  Every other row keeps the $0.00. */}
              <ShareCell value={p.vfos} state={p.vfosState} money={money} noteOnZero={p.sharesDeferred} dash={p.sharesDeferred ? '—' : undefined} />
              <ShareCell value={p.strategic} state={p.strategicState} money={money} color={p.strategic > 0 ? '#8b5cf6' : '#c7d0de'} dash="—" noteOnZero={p.sharesDeferred} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
