import { useState, useEffect, useMemo } from 'react'
import { callApi } from '../../lib/api'
import { NAVY, money } from './specialistRevenueShared'
import { inPeriod } from './holisticShared'
import { clearedTaxPayments } from './taxShared'
import { PendingNote, HeldNote, heldReason, isMoneyMappingLeg } from './shareLegState'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { MemberNameLink } from '../shared/personLinks'

// Accounting > VFO Services > Tax Planning Reconciliation. Pick a year → each member
// with Tax activity that year and their revenue split from payments that CLEARED in the
// year: member share (revenue-share members), money-mapping share, tax planner share,
// VFOS share. ERT shares aren't tracked → blank. Covers Tax Priorities + Tax Planning.
//
// A cleared payment does not mean its shares were paid out, so each aggregate also
// carries the portion whose payout leg has not fired yet and shows it as a pending
// sub-note. Elite VFO Income has no payout leg, but it counts as pending while the
// payment itself is still clearing. Money parked behind a suspended or paused member is
// broken out of that into its own "$X held - suspended" / "$X held - paused" note, so the
// two notes partition what is owed. The aggregates themselves are the full split,
// unchanged — this stays an attribution view of the configured shares (#363).

export default function TaxReconciliationPanel({ embedded = false }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

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

  const members = useMemo(() => {
    const map = {}
    for (const p of payments) {
      if (!p.memberNumber) continue
      if (!inPeriod(p.clearedAt, year, -1)) continue
      const k = p.memberNumber
      const t = map[k] || (map[k] = { memberNumber: k, name: p.memberName || '—', member: 0, mm: 0, planner: 0, vfos: 0, strategic: 0, memberPending: 0, mmPending: 0, plannerPending: 0, strategicPending: 0, vfosPending: 0, memberHeldSus: 0, memberHeldPau: 0, memberHeldArr: 0, mmHeldSus: 0, mmHeldPau: 0, mmHeldArr: 0 })
      if (!t.name && p.memberName) t.name = p.memberName
      const pend = st => st?.tone === 'pending'
      // The share figures stay exactly as they were — this view attributes configured
      // shares (#363) and that is unchanged. Held dollars only get pulled out of the
      // pending note into their own, so the operator can see WHY money has not moved.
      const held = heldReason(p.memberState)
      // Settled legs bucket by what actually happened, not by the member's decision
      // today; only the unsettled ones follow the current decision. See isMoneyMappingLeg.
      if (isMoneyMappingLeg(p.memberState, p.decision)) {
        t.mm += p.member
        if (held === 'suspended') t.mmHeldSus += p.member
        else if (held === 'paused') t.mmHeldPau += p
        else if (held === 'arrears') t.mmHeldArr += p.member
        else if (pend(p.memberState)) t.mmPending += p.member
      } else {
        t.member += p.member
        if (held === 'suspended') t.memberHeldSus += p.member
        else if (held === 'paused') t.memberHeldPau += p
        else if (held === 'arrears') t.memberHeldArr += p.member
        else if (pend(p.memberState)) t.memberPending += p.member
      }
      t.planner += p.planner || 0
      if (pend(p.plannerState)) t.plannerPending += p.planner || 0
      t.vfos += p.vfos
      if (pend(p.vfosState)) t.vfosPending += p.vfos
      t.strategic += p.strategic || 0
      if (pend(p.strategicState)) t.strategicPending += p.strategic || 0
    }
    return Object.values(map).sort((a, b) => String(a.memberNumber).localeCompare(String(b.memberNumber), undefined, { numeric: true }))
  }, [payments, year])

  const tot = members.reduce((s, m) => ({
    member: s.member + m.member, mm: s.mm + m.mm, planner: s.planner + m.planner, vfos: s.vfos + m.vfos, strategic: s.strategic + m.strategic,
    memberPending: s.memberPending + m.memberPending, mmPending: s.mmPending + m.mmPending, plannerPending: s.plannerPending + m.plannerPending, strategicPending: s.strategicPending + m.strategicPending, vfosPending: s.vfosPending + m.vfosPending,
    memberHeld: s.memberHeld + m.memberHeldSus + m.memberHeldPau + m.memberHeldArr, mmHeld: s.mmHeld + m.mmHeldSus + m.mmHeldPau + m.mmHeldArr,
  }), { member: 0, mm: 0, planner: 0, vfos: 0, strategic: 0, memberPending: 0, mmPending: 0, plannerPending: 0, strategicPending: 0, vfosPending: 0, memberHeld: 0, mmHeld: 0 })

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1150px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '90px 1.4fr 125px 130px 125px 125px 115px'
  const muted = { color: 'var(--vfo-faint)' }

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting · VFO Services</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Tax Planning Reconciliation</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} style={{ ...sel, color: '#125ecc', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={7} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}
      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Member #</span><span>Member Name</span><span style={{ textAlign: 'right' }}>Member Revenue Share</span><span style={{ textAlign: 'right' }}>Member Money Mapping</span><span style={{ textAlign: 'right' }}>Tax Planner Share</span><span style={{ textAlign: 'right' }}>Elite VFO Income</span><span style={{ textAlign: 'right' }}>Strategic Partner Revenue Share</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
            <span style={{ textAlign: 'right', ...(tot.member ? {} : muted) }}>{tot.member ? money(tot.member) : '—'}<PendingNote amount={tot.memberPending} money={money} /><HeldNote total={tot.memberHeld} money={money} /></span>
            <span style={{ textAlign: 'right', ...(tot.mm ? {} : muted) }}>{tot.mm ? money(tot.mm) : '—'}<PendingNote amount={tot.mmPending} money={money} /><HeldNote total={tot.mmHeld} money={money} /></span>
            <span style={{ textAlign: 'right', ...(tot.planner ? {} : muted) }}>{tot.planner ? money(tot.planner) : '—'}<PendingNote amount={tot.plannerPending} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{money(tot.vfos)}<PendingNote amount={tot.vfosPending} money={money} /></span>
            <span style={{ textAlign: 'right', ...(tot.strategic ? {} : muted) }}>{tot.strategic ? money(tot.strategic) : '—'}<PendingNote amount={tot.strategicPending} money={money} /></span>
          </div>
          {members.map(m => (
            <div key={m.memberNumber} style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
              <span style={{ color: 'var(--vfo-muted)' }}>{m.memberNumber}</span>
              <span><MemberNameLink memberNumber={m.memberNumber} style={{ fontWeight: 600 }}>{m.name}</MemberNameLink></span>
              <span style={{ textAlign: 'right', fontWeight: m.member ? 700 : 400, color: m.member ? '#16a34a' : 'var(--vfo-faint)' }}>{m.member ? money(m.member) : '—'}{m.member ? <><PendingNote amount={m.memberPending} money={money} /><HeldNote suspended={m.memberHeldSus} paused={m.memberHeldPau} arrears={m.memberHeldArr} money={money} /></> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: m.mm ? 700 : 400, color: m.mm ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{m.mm ? money(m.mm) : '—'}{m.mm ? <><PendingNote amount={m.mmPending} money={money} /><HeldNote suspended={m.mmHeldSus} paused={m.mmHeldPau} arrears={m.mmHeldArr} money={money} /></> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: m.planner ? 700 : 400, color: m.planner ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{m.planner ? money(m.planner) : '—'}{m.planner ? <PendingNote amount={m.plannerPending} money={money} /> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: m.vfos ? 700 : 400, color: m.vfos ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{money(m.vfos)}{m.vfos ? <PendingNote amount={m.vfosPending} money={money} /> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: m.strategic ? 700 : 400, color: m.strategic ? '#8b5cf6' : 'var(--vfo-faint)' }}>{m.strategic ? money(m.strategic) : '—'}{m.strategic ? <PendingNote amount={m.strategicPending} money={money} /> : null}</span>
            </div>
          ))}
          {members.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No Tax member activity for this year.</div>}
        </div>
      )}
      <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }}>Shares are from Tax payments (retainer + implementation) that cleared in the selected year. Tax Planner Share is the planner's prorated cut of each payment, which Elite VFO Income no longer includes; blank where no planner share is set. Strategic Partner Revenue Share is the partner-company cut on strategic members' deals; blank for non-strategic members.</p>
    </div>
  )
}
