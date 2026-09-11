import { useState, useEffect, useMemo } from 'react'
import { callApi } from '../../lib/api'
import { NAVY, money, requestDate } from './specialistRevenueShared'
import { PendingNote, HeldNote } from './shareLegState'
import { AccountingTableSkeleton } from '../shared/Skeleton'

// Accounting > Specialists > VFO Specialist Member Reconciliation. Pick a year → every
// member with their yearly totals from specialist revenue: member share (revenue share
// payouts), VFOS share, ERT share, money-mapping share. Accreditation rebate + credit note
// are placeholders (not built yet → blank).
//
// ERT Income is a second house column, not a second reading of the same money: a line's
// house share is booked to ERT or to VFOS, never to both. The accreditation credit-note
// tiers below stay keyed to the VFOS share alone.
//
// A received request does not mean its member payouts went out — each line carries its
// own payout_status, so the totals also track the portion still awaiting a transfer and
// show it as a pending sub-note. Lines parked behind a suspended or paused member get
// their own "$X held - suspended" / "$X held - paused" note instead, so the two notes
// partition what is owed. The totals themselves are the full share, unchanged.

// Still owed, but for an ordinary reason. The two member-holds are owed as well and are
// counted separately, so the pending note and the held note partition the outstanding
// money instead of both claiming the same dollars.
// Both are POSITIVE lookups, so the terminal statuses fall out on their own: a line
// closed as no_payout_due (member share entered as $0) is neither pending nor held, and
// it contributes $0 to the member / money-mapping totals anyway — those are bucketed off
// line.revenue_decision, not payout_status, so nothing about this year's figures moves.
const PENDING_PAYOUT = new Set(['pending', 'awaiting_connect', 'failed'])
const HELD_REASON = { held_member_suspended: 'suspended', held_member_paused: 'paused' }

function memberName(m) {
  return m.name || `${m.first_name || ''} ${m.last_name || ''}`.trim() || '—'
}

// Annual accreditation credit note, based on the member's VFOS Income (VFOS share):
// >$100k → $18,000; $75k–$100k → $9,000; >$50k & <$75k → $6,000; otherwise none.
function creditNote(vfos) {
  const v = Number(vfos) || 0
  if (v > 100000) return 18000
  if (v >= 75000) return 9000
  if (v > 50000) return 6000
  return null
}

export default function SpecialistReconciliationPanel({ allMembers = [], embedded = false }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const res = await callApi('specialist_revenue_load')
      if (res?.error) { setError(res.error); return }
      setRequests(res.requests || [])
    } catch (e) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  // All line items (member recipients only) tagged with their request year.
  // Only requests whose payment has actually been received count — a pending/requested
  // request is expected money, not reconciled money.
  const memberLines = useMemo(() => {
    const out = []
    for (const r of requests) {
      if (r.payment_status !== 'received') continue
      const d = requestDate(r)
      const y = d ? new Date(d).getFullYear() : null
      for (const l of (r.lines || [])) {
        if (!l.member_number) continue // member recipients only
        out.push({ ...l, year: y })
      }
    }
    return out
  }, [requests])

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    memberLines.forEach(l => { if (l.year) set.add(l.year) })
    return Array.from(set).sort((a, b) => b - a)
  }, [memberLines])

  // member_number -> { member, vfos, mm } plus the not-yet-paid portion of each, split
  // into ordinary-pending and held, for the selected year. A line is settled at
  // revenue_share_sent (transferred) or money_mapping (credited); pending /
  // awaiting_connect / failed / held_member_* are still owed — the held pair is parked
  // behind a suspended or paused member and pays on reinstatement, which is why it is
  // broken out under its own note rather than folded into "pending".
  const totalsByMember = useMemo(() => {
    const map = {}
    for (const l of memberLines) {
      if (l.year !== year) continue
      const k = l.member_number
      const t = map[k] || (map[k] = { member: 0, vfos: 0, ert: 0, mm: 0, memberPending: 0, mmPending: 0, memberHeldSus: 0, memberHeldPau: 0, mmHeldSus: 0, mmHeldPau: 0 })
      const isMM = (l.revenue_decision || '') === 'Money Mapping'
      const ms = Number(l.member_share) || 0
      const pending = PENDING_PAYOUT.has(l.payout_status)
      const held = HELD_REASON[l.payout_status] || null
      if (isMM) {
        t.mm += ms
        if (held === 'suspended') t.mmHeldSus += ms
        else if (held === 'paused') t.mmHeldPau += ms
        else if (pending) t.mmPending += ms
      } else {
        t.member += ms
        if (held === 'suspended') t.memberHeldSus += ms
        else if (held === 'paused') t.memberHeldPau += ms
        else if (pending) t.memberPending += ms
      }
      t.vfos += Number(l.vfos_share) || 0
      t.ert += Number(l.ert_share) || 0
    }
    return map
  }, [memberLines, year])

  const memberByNo = useMemo(() => {
    const map = {}; for (const m of allMembers) map[String(m.member_number)] = m; return map
  }, [allMembers])

  // Only members with any $ this year (matches the Holistic reconciliation).
  const rows = useMemo(() => {
    return Object.entries(totalsByMember)
      .filter(([, t]) => t.member || t.vfos || t.ert || t.mm)
      .map(([mn, t]) => {
        const m = memberByNo[mn]
        const eligible = m?.credit_note_eligible !== false
        return { mn, t, m, cn: eligible ? creditNote(t.vfos) : null }
      })
      .sort((a, b) => String(a.mn).localeCompare(String(b.mn), undefined, { numeric: true }))
  }, [totalsByMember, memberByNo])

  const tot = rows.reduce((s, r) => ({
    member: s.member + r.t.member, vfos: s.vfos + r.t.vfos, ert: s.ert + r.t.ert, mm: s.mm + r.t.mm, cn: s.cn + (r.cn || 0),
    memberPending: s.memberPending + r.t.memberPending, mmPending: s.mmPending + r.t.mmPending,
    memberHeld: s.memberHeld + r.t.memberHeldSus + r.t.memberHeldPau, mmHeld: s.mmHeld + r.t.mmHeldSus + r.t.mmHeldPau,
  }), { member: 0, vfos: 0, ert: 0, mm: 0, cn: 0, memberPending: 0, mmPending: 0, memberHeld: 0, mmHeld: 0 })

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '86px 1.3fr 118px 118px 124px 124px 118px 140px'
  const muted = { color: 'var(--vfo-faint)' }

  return (
    <div style={wrap}>
      {!embedded && (
        <div style={{ marginBottom: '18px' }}>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>VFO Specialist Reconciliation</h2>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} style={{ ...sel, color: '#125ecc', fontWeight: 600 }}>Refresh</button>
      </div>

      {loading && <AccountingTableSkeleton cols={8} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Member #</span><span>Member Name</span><span style={{ textAlign: 'right' }}>Member Revenue Share</span><span style={{ textAlign: 'right' }}>Member Money Mapping</span><span style={{ textAlign: 'right' }}>VFOS Income</span><span style={{ textAlign: 'right' }}>ERT Income</span><span style={{ textAlign: 'right' }}>Accred. Rebate</span><span style={{ textAlign: 'right' }}>Accred. Credit Note</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            <span />
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Totals</span>
            <span style={{ textAlign: 'right', ...(tot.member ? {} : muted) }}>{tot.member ? money(tot.member) : '—'}<PendingNote amount={tot.memberPending} money={money} /><HeldNote total={tot.memberHeld} money={money} /></span>
            <span style={{ textAlign: 'right', ...(tot.mm ? {} : muted) }}>{tot.mm ? money(tot.mm) : '—'}<PendingNote amount={tot.mmPending} money={money} /><HeldNote total={tot.mmHeld} money={money} /></span>
            <span style={{ textAlign: 'right' }}>{money(tot.vfos)}</span>
            <span style={{ textAlign: 'right', ...(tot.ert ? {} : muted) }}>{tot.ert ? money(tot.ert) : '—'}</span>
            <span style={{ textAlign: 'right', ...muted }}>—</span>
            <span style={{ textAlign: 'right' }}>{tot.cn ? money(tot.cn) : '—'}</span>
          </div>
          <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {rows.map(({ mn, m, t, cn }) => (
              <div key={mn} style={{ display: 'grid', gridTemplateColumns: grid, gap: '8px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                <span style={{ color: 'var(--vfo-muted)' }}>{mn || '—'}</span>
                <span style={{ fontWeight: 600 }}>{m ? memberName(m) : '—'}</span>
                <span style={{ textAlign: 'right', fontWeight: t.member ? 700 : 400, color: t.member ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.member ? money(t.member) : '—'}{t.member ? <><PendingNote amount={t.memberPending} money={money} /><HeldNote suspended={t.memberHeldSus} paused={t.memberHeldPau} money={money} /></> : null}</span>
                <span style={{ textAlign: 'right', fontWeight: t.mm ? 700 : 400, color: t.mm ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.mm ? money(t.mm) : '—'}{t.mm ? <><PendingNote amount={t.mmPending} money={money} /><HeldNote suspended={t.mmHeldSus} paused={t.mmHeldPau} money={money} /></> : null}</span>
                <span style={{ textAlign: 'right', fontWeight: t.vfos ? 700 : 400, color: t.vfos ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{money(t.vfos)}</span>
                <span style={{ textAlign: 'right', fontWeight: t.ert ? 700 : 400, color: t.ert ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.ert ? money(t.ert) : '—'}</span>
                <span style={{ textAlign: 'right', ...muted }}>—</span>
                <span style={{ textAlign: 'right', fontWeight: cn ? 700 : 400, color: cn ? '#7c3aed' : 'var(--vfo-faint)' }}>{cn ? money(cn) : '—'}</span>
              </div>
            ))}
            {rows.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No member activity for this year.</div>}
          </div>
        </div>
      )}
      <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }}>Credit note is based on the member's VFOS Income and their "Eligible for Credit Note" setting (&gt;$100k → $18,000; $75k–$100k → $9,000; &gt;$50k–&lt;$75k → $6,000); ERT Income is not counted towards it. Accreditation rebate is not tracked yet — shown blank.</p>
    </div>
  )
}
