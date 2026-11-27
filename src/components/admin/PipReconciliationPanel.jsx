import { useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { NAVY, money } from './specialistRevenueShared'
import { inPeriod } from './holisticShared'
import { clearedPipPurchases } from './pipShared'
import { PendingNote, HeldNote, heldReason, isMoneyMappingLeg } from './shareLegState'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { ClientNameLink, MemberNameLink, clientPagePath } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import { useNavigate } from 'react-router-dom'
import { emptyRowStyle, errorStyle, footnoteStyle, headerRowStyle, refreshBtnStyle, rowStyle, selectStyle, tableStyle, totalsLabelStyle, totalsRowStyle, totalsSubStyle } from './accountingTable'

// Accounting > VFO Services > Additional PIP Reconciliation. Pick a year → grouped BY
// CLIENT: each client with additional-PIP activity that year and the revenue split from
// purchases that cleared in the year (member share for revenue-share members, money-
// mapping share, Elite VFO Income).
//
// A cleared purchase does not mean its member share was paid out, so each aggregate also
// carries the portion whose payout has not fired yet and shows it as a pending sub-note.
// Elite VFO Income has no payout of its own, but it counts as pending while the payment
// itself is still clearing. Money parked behind a suspended or paused member is broken out
// of that into its own "$X held - suspended" / "$X held - paused" note, so the two notes
// partition what is owed. The aggregates themselves are the full split, unchanged — this
// stays an attribution view of the configured shares (#363).

export default function PipReconciliationPanel({ embedded = false }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  // Re-open draws the last rows at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('piprecon:')
    if (snap) { setRows(snap.rows || []); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const res = await callApi('pip_additional_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setRows(res.rows || [])
      setLastSeen('piprecon:', res)
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

  // client_id -> { clientName, memberName, member, mm, vfos } for the selected year.
  const clients = useMemo(() => {
    const map = {}
    for (const p of payments) {
      if (!inPeriod(p.clearedAt, year, -1)) continue
      const k = p.clientId
      const t = map[k] || (map[k] = { clientId: k, clientName: p.clientName, memberNumber: p.memberNumber || null, memberName: p.memberName || '—', member: 0, mm: 0, vfos: 0, memberPending: 0, mmPending: 0, vfosPending: 0, memberHeldSus: 0, memberHeldPau: 0, memberHeldArr: 0, mmHeldSus: 0, mmHeldPau: 0, mmHeldArr: 0 })
      if (!t.memberName && p.memberName) t.memberName = p.memberName
      const pending = p.memberState?.tone === 'pending'
      // The share figures stay exactly as they were — this view attributes configured
      // shares (#363) and that is unchanged. Held dollars only get pulled out of the
      // pending note into their own, so the operator can see WHY money has not moved.
      const held = heldReason(p.memberState)
      // Settled purchases bucket by what actually happened — PIP records it in the status
      // itself — and only unsettled ones follow the current decision. See isMoneyMappingLeg.
      if (isMoneyMappingLeg(p.memberState, p.decision)) {
        t.mm += p.member
        if (held === 'suspended') t.mmHeldSus += p.member
        else if (held === 'paused') t.mmHeldPau += p.member
        else if (held === 'arrears') t.mmHeldArr += p.member
        else if (pending) t.mmPending += p.member
      } else {
        t.member += p.member
        if (held === 'suspended') t.memberHeldSus += p.member
        else if (held === 'paused') t.memberHeldPau += p.member
        else if (held === 'arrears') t.memberHeldArr += p.member
        else if (pending) t.memberPending += p.member
      }
      t.vfos += p.vfos
      if (p.vfosState?.tone === 'pending') t.vfosPending += p.vfos
    }
    return Object.values(map).sort((a, b) => String(a.clientName).localeCompare(String(b.clientName)))
  }, [payments, year])

  const muted = { color: 'var(--vfo-faint)' }
  const tot = clients.reduce((s, c) => ({
    member: s.member + c.member, mm: s.mm + c.mm, vfos: s.vfos + c.vfos,
    memberPending: s.memberPending + c.memberPending, mmPending: s.mmPending + c.mmPending, vfosPending: s.vfosPending + c.vfosPending,
    memberHeld: s.memberHeld + c.memberHeldSus + c.memberHeldPau + c.memberHeldArr, mmHeld: s.mmHeld + c.mmHeldSus + c.mmHeldPau + c.mmHeldArr,
  }), { member: 0, mm: 0, vfos: 0, memberPending: 0, mmPending: 0, vfosPending: 0, memberHeld: 0, mmHeld: 0 })

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1150px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = selectStyle
  const grid = '1.4fr 1.2fr 140px 150px 150px'

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · VFO Services</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Additional PIP Reconciliation</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} style={refreshBtnStyle}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={grid} />}
      {error && <div style={errorStyle}>{error}</div>}

      {!loading && !error && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gridTemplateColumns: grid }}>
            <span>Client</span><span>Connected Member</span><span style={{ textAlign: 'right' }}>Member Revenue Share</span><span style={{ textAlign: 'right' }}>Member Money Mapping</span><span style={{ textAlign: 'right' }}>Elite VFO Income</span>
          </div>
          <div style={{ ...totalsRowStyle, gridTemplateColumns: grid }}>
            <span style={totalsLabelStyle}>Totals<span style={totalsSubStyle}>{year} · cleared payments</span></span>
            <span />
            <span style={{ textAlign: 'right', ...(tot.member ? {} : muted) }}>{tot.member ? money(tot.member) : '—'}<PendingNote amount={tot.memberPending} money={money} /><HeldNote total={tot.memberHeld} money={money} /></span>
            <span style={{ textAlign: 'right', ...(tot.mm ? {} : muted) }}>{tot.mm ? money(tot.mm) : '—'}<PendingNote amount={tot.mmPending} money={money} /><HeldNote total={tot.mmHeld} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{money(tot.vfos)}<PendingNote amount={tot.vfosPending} money={money} /></span>
          </div>
          {clients.map(c => (
            <div key={c.clientId} onClick={c.clientId ? () => navigate(clientPagePath(c.clientId, { program: 1, tab: 'pip' })) : undefined} {...(c.clientId ? rowHoverProps : {})}
              style={{ ...(c.clientId ? clickableRowStyle : null), ...rowStyle, gridTemplateColumns: grid, background: 'var(--vfo-card)' }}>
              <span><ClientNameLink clientId={c.clientId} program={1} style={{ fontWeight: 600 }}>{c.clientName}</ClientNameLink></span>
              <span style={{ color: 'var(--vfo-muted)' }}><MemberNameLink memberNumber={c.memberNumber}>{c.memberName}</MemberNameLink></span>
              <span style={{ textAlign: 'right', fontWeight: c.member ? 700 : 400, color: c.member ? 'var(--vfo-success-text-2)' : 'var(--vfo-faint)' }}>{c.member ? money(c.member) : '—'}{c.member ? <><PendingNote amount={c.memberPending} money={money} /><HeldNote suspended={c.memberHeldSus} paused={c.memberHeldPau} arrears={c.memberHeldArr} money={money} /></> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: c.mm ? 700 : 400, color: c.mm ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.mm ? money(c.mm) : '—'}{c.mm ? <><PendingNote amount={c.mmPending} money={money} /><HeldNote suspended={c.mmHeldSus} paused={c.mmHeldPau} arrears={c.mmHeldArr} money={money} /></> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: c.vfos ? 700 : 400, color: c.vfos ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{money(c.vfos)}{c.vfos ? <PendingNote amount={c.vfosPending} money={money} /> : null}</span>
            </div>
          ))}
          {clients.length === 0 && <div style={emptyRowStyle}>No additional-PIP client activity for this year.</div>}
        </div>
      )}
      <p style={footnoteStyle}>Shares are from additional-PIP purchases that cleared in the selected year. Member Money Mapping is the member share on a Money Mapping member's purchase; blank for revenue-share members.</p>
    </div>
  )
}
