import { useState, useEffect, useMemo } from 'react'
import { callApi } from '../../lib/api'
import { NAVY, money } from './specialistRevenueShared'
import { inPeriod } from './holisticShared'
import { clearedPipPurchases } from './pipShared'
import { PendingNote, HeldNote, heldReason, isMoneyMappingLeg } from './shareLegState'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { ClientNameLink } from '../shared/personLinks'

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
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('pip_additional_load')
      if (res?.error) { setError(res.error); return }
      setRows(res.rows || [])
    } catch (e) {
      setError(e?.message || 'Failed to load')
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
      const t = map[k] || (map[k] = { clientId: k, clientName: p.clientName, memberName: p.memberName || '—', member: 0, mm: 0, vfos: 0, memberPending: 0, mmPending: 0, vfosPending: 0, memberHeldSus: 0, memberHeldPau: 0, memberHeldArr: 0, mmHeldSus: 0, mmHeldPau: 0, mmHeldArr: 0 })
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
        else if (held === 'paused') t.mmHeldPau += p
        else if (held === 'arrears') t.mmHeldArr += p.member
        else if (pending) t.mmPending += p.member
      } else {
        t.member += p.member
        if (held === 'suspended') t.memberHeldSus += p.member
        else if (held === 'paused') t.memberHeldPau += p
        else if (held === 'arrears') t.memberHeldArr += p.member
        else if (pending) t.memberPending += p.member
      }
      t.vfos += p.vfos
      if (p.vfosState?.tone === 'pending') t.vfosPending += p.vfos
    }
    return Object.values(map).sort((a, b) => String(a.clientName).localeCompare(String(b.clientName)))
  }, [payments, year])

  const tot = clients.reduce((s, c) => ({
    member: s.member + c.member, mm: s.mm + c.mm, vfos: s.vfos + c.vfos,
    memberPending: s.memberPending + c.memberPending, mmPending: s.mmPending + c.mmPending, vfosPending: s.vfosPending + c.vfosPending,
    memberHeld: s.memberHeld + c.memberHeldSus + c.memberHeldPau + c.memberHeldArr, mmHeld: s.mmHeld + c.mmHeldSus + c.mmHeldPau + c.mmHeldArr,
  }), { member: 0, mm: 0, vfos: 0, memberPending: 0, mmPending: 0, vfosPending: 0, memberHeld: 0, mmHeld: 0 })

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1150px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
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
        <button onClick={load} style={{ ...sel, color: '#125ecc', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={5} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Client</span><span>Connected Member</span><span style={{ textAlign: 'right' }}>Member Revenue Share</span><span style={{ textAlign: 'right' }}>Member Money Mapping</span><span style={{ textAlign: 'right' }}>Elite VFO Income</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
            <span />
            <span style={{ textAlign: 'right' }}>{tot.member ? money(tot.member) : '—'}<PendingNote amount={tot.memberPending} money={money} /><HeldNote total={tot.memberHeld} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{tot.mm ? money(tot.mm) : '—'}<PendingNote amount={tot.mmPending} money={money} /><HeldNote total={tot.mmHeld} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{money(tot.vfos)}<PendingNote amount={tot.vfosPending} money={money} /></span>
          </div>
          {clients.map(c => (
            <div key={c.clientId} style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
              <span><ClientNameLink clientId={c.clientId} tab="pip" style={{ fontWeight: 600 }}>{c.clientName}</ClientNameLink></span>
              <span style={{ color: 'var(--vfo-muted)' }}>{c.memberName}</span>
              <span style={{ textAlign: 'right', fontWeight: c.member ? 700 : 400, color: c.member ? '#16a34a' : 'var(--vfo-faint)' }}>{c.member ? money(c.member) : '—'}{c.member ? <><PendingNote amount={c.memberPending} money={money} /><HeldNote suspended={c.memberHeldSus} paused={c.memberHeldPau} arrears={c.memberHeldArr} money={money} /></> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: c.mm ? 700 : 400, color: c.mm ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.mm ? money(c.mm) : '—'}{c.mm ? <><PendingNote amount={c.mmPending} money={money} /><HeldNote suspended={c.mmHeldSus} paused={c.mmHeldPau} arrears={c.mmHeldArr} money={money} /></> : null}</span>
              <span style={{ textAlign: 'right', fontWeight: c.vfos ? 700 : 400, color: c.vfos ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{money(c.vfos)}{c.vfos ? <PendingNote amount={c.vfosPending} money={money} /> : null}</span>
            </div>
          ))}
          {clients.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No additional-PIP client activity for this year.</div>}
        </div>
      )}
    </div>
  )
}
