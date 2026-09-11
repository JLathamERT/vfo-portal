import { useState, useEffect, useMemo } from 'react'
import { callApi, getSession } from '../../lib/api'
import { NAVY, money, requestDate, RequestRow, MarkReceivedButton, DeleteRequestButton, canDeleteSpecrevRequest, memberShareNote, shareNoteStyle, isHeldLine } from './specialistRevenueShared'
import { PENDING_COLOR } from './shareLegState'
import SpecialistPaymentInput from './SpecialistPaymentInput'
import { OnboardingListSkeleton } from '../shared/Skeleton'

// Accounting → VFO Specialist Revenue. Pick year + month to see the specialist
// payment requests for that period, expand each to see recipients and statuses.
// The "New Payment" button at the top reveals the Payment Input form inline (the
// two used to be separate tabs).
//
// Each expanded recipient line annotates its Member $ the way the three VFO Services
// revenue tabs do — "paid" once transferred, "Held - Suspended" / "Held - Paused" while
// parked behind a member hold. The status pill on the right of the same row still carries
// the full per-line vocabulary; the note only marks what the dollars themselves did.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function SpecialistRevenuePanel({ allExperts = [], allMembers = [], embedded = false }) {
  const [showInput, setShowInput] = useState(false)
  const [viewMode, setViewMode] = useState('specialist') // 'specialist' | 'member'
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11, or -1 for All

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

  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    requests.forEach(r => { const d = requestDate(r); if (d) set.add(new Date(d).getFullYear()) })
    return Array.from(set).sort((a, b) => b - a)
  }, [requests])

  const filtered = useMemo(() => requests.filter(r => {
    const d = requestDate(r); if (!d) return false
    const dt = new Date(d)
    if (dt.getFullYear() !== year) return false
    if (month >= 0 && dt.getMonth() !== month) return false
    return true
  }), [requests, year, month])

  // Money totals + the By-member rollup count only requests whose payment has been
  // received — pending/requested requests are expected money, not real revenue yet.
  // (The By-specialist list below still shows every request, incl. pending, so you can
  // mark them received.)
  const receivedFiltered = useMemo(() => filtered.filter(r => r.payment_status === 'received'), [filtered])

  // Member view: every recipient line across ALL specialists in the period, grouped
  // by recipient (so a member's deals are together no matter which specialist billed).
  const memberGroups = useMemo(() => {
    const map = {}
    for (const r of receivedFiltered) {
      const d = requestDate(r)
      for (const l of (r.lines || [])) {
        const key = l.member_number || (l.recipient_type === 'specialist' ? `spec:${l.expert_id}` : l.recipient_name) || 'unknown'
        const g = map[key] || (map[key] = { key, name: l.recipient_name || '—', sub: l.member_number || (l.recipient_type === 'specialist' ? 'Specialist' : 'Member'), decision: l.revenue_decision || 'Revenue Share', member: 0, ert: 0, vfos: 0, deals: 0, items: [] })
        g.member += Number(l.member_share) || 0
        g.ert += Number(l.ert_share) || 0
        g.vfos += Number(l.vfos_share) || 0
        g.deals += Number(l.deals) || 0
        // payout_status rides along so the deal rows below can annotate their Member $
        // the same way the By-specialist recipient rows do.
        g.items.push({ specialist: r.specialist_name || '—', date: d, member_share: l.member_share, ert_share: l.ert_share, vfos_share: l.vfos_share, deals: l.deals, payout_status: l.payout_status })
      }
    }
    return Object.values(map).sort((a, b) => b.member - a.member)
  }, [receivedFiltered])

  const memberDeals = memberGroups.reduce((s, g) => s + (Number(g.deals) || 0), 0)
  const memberHeld = memberGroups.reduce((s, g) => s + g.items.reduce((t, it) => t + (isHeldLine(it) ? Number(it.member_share) || 0 : 0), 0), 0)
  const periodGross = receivedFiltered.reduce((s, r) => s + (Number(r.gross_amount) || 0), 0)
  const periodMember = receivedFiltered.reduce((s, r) => s + (Number(r.total_member_share) || 0), 0)
  const periodErt = receivedFiltered.reduce((s, r) => s + (Number(r.total_ert_share) || 0), 0)
  const periodVfos = receivedFiltered.reduce((s, r) => s + (Number(r.total_vfos_share) || 0), 0)
  const periodLabel = month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {embedded ? <div /> : (
          <div>
            <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 6px' }}>Accounting</p>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>VFO Specialist Revenue</h2>
          </div>
        )}
        <button onClick={() => setShowInput(s => !s)}
          style={{ padding: '10px 18px', borderRadius: '8px', border: showInput ? '1px solid var(--vfo-border-strong)' : 'none', background: showInput ? 'var(--vfo-card)' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: showInput ? 'var(--vfo-muted)' : '#fff', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', boxShadow: showInput ? 'none' : '0 2px 8px rgba(18,94,204,0.28)' }}>
          {showInput ? 'Close form' : '+ New Payment'}
        </button>
      </div>

      {showInput && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', background: 'var(--vfo-input)', marginBottom: '22px', overflow: 'hidden' }}>
          <SpecialistPaymentInput allExperts={allExperts} allMembers={allMembers} onSent={load} />
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

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
        {[['specialist', 'By specialist'], ['member', 'By member']].map(([k, l]) => (
          <button key={k} onClick={() => setViewMode(k)}
            style={{ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${viewMode === k ? '#125ecc' : '#d6e0f0'}`, background: viewMode === k ? 'rgba(18,94,204,0.08)' : '#fff', color: viewMode === k ? '#125ecc' : 'var(--vfo-muted)', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            {l}
          </button>
        ))}
      </div>

      {loading && <OnboardingListSkeleton rows={3} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && viewMode === 'specialist' && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gridTemplateColumns: SPECIALIST_GRID }}>
            <span>Specialist</span><span>Date</span><span style={{ textAlign: 'right' }}>Recipients</span><span style={{ textAlign: 'right' }}>Deals</span><span style={{ textAlign: 'right' }}>Member $</span><span style={{ textAlign: 'right' }}>ERT $</span><span style={{ textAlign: 'right' }}>VFOS $</span><span style={{ textAlign: 'right' }}>Gross</span><span style={{ textAlign: 'right' }}>Status</span>
          </div>
          <div style={{ ...totalsRowStyle, gridTemplateColumns: SPECIALIST_GRID }}>
            <span style={totalsLabelStyle}>Totals<span style={totalsSubStyle}>{periodLabel} · received</span></span>
            <span /><span /><span />
            <span style={{ textAlign: 'right' }}>{money(periodMember)}</span>
            <span style={{ textAlign: 'right' }}>{money(periodErt)}</span>
            <span style={{ textAlign: 'right' }}>{money(periodVfos)}</span>
            <span style={{ textAlign: 'right' }}>{money(periodGross)}</span>
            <span />
          </div>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No specialist payments for this period.</div>
          )}
          {filtered.map(r => (
            <RequestRow key={r.id} request={r} grid={SPECIALIST_GRID} actions={({ request }) => (
              request.payment_status === 'pending' ? <MarkReceivedButton request={request} onDone={load} />
                : canDeleteSpecrevRequest(request) ? <DeleteRequestButton request={request} onDone={load} />
                  : null
            )} />
          ))}
        </div>
      )}

      {!loading && !error && viewMode === 'member' && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gridTemplateColumns: MEMBER_GRID }}>
            <span>Recipient</span><span>Decision</span><span style={{ textAlign: 'right' }}>Deals</span><span style={{ textAlign: 'right' }}>Member $</span><span style={{ textAlign: 'right' }}>ERT $</span><span style={{ textAlign: 'right' }}>VFOS $</span>
          </div>
          <div style={{ ...totalsRowStyle, gridTemplateColumns: MEMBER_GRID }}>
            <span style={totalsLabelStyle}>Totals<span style={totalsSubStyle}>{periodLabel} · received</span></span>
            <span />
            <span style={{ textAlign: 'right' }}>{memberDeals}</span>
            <span style={{ textAlign: 'right' }}>
              {money(periodMember)}
              {memberHeld > 0 && <span style={{ ...shareNoteStyle, color: PENDING_COLOR }}>{money(memberHeld)} held</span>}
            </span>
            <span style={{ textAlign: 'right' }}>{money(periodErt)}</span>
            <span style={{ textAlign: 'right' }}>{money(periodVfos)}</span>
          </div>
          {memberGroups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>No specialist payments for this period.</div>
          )}
          {memberGroups.map(g => <MemberGroupRow key={g.key} group={g} />)}
        </div>
      )}

      {/* Jake-only catch-up tool. Gated on the session's superadmin flag, NOT on the
          accounting tab grant this panel is mounted behind. */}
      {!!getSession()?.is_superadmin && <ErtCatchUpTransferSection />}
    </div>
  )
}

// ── Send funds to ERT (superadmin) ───────────────────────────────────────────
//
// A hand-run transfer out of the VFO Services Stripe balance into ERT's connected
// account, for revenue that landed on VFO Services BEFORE the ERT share column existed.
// Every request raised since routes its own ERT share, so this is a one-off catch-up
// path and nothing on the page feeds it.

const ERT_TRANSFER_MAX = 50000

function newClientRef() {
  return crypto.randomUUID().replace(/-/g, '')
}

function ErtCatchUpTransferSection() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  // Idempotency key for the transfer. Minted once per card and re-minted only after a
  // transfer actually lands, so a double-click replays the same key (the backend collapses
  // it) while a second deliberate send is a genuinely new transfer.
  const [clientRef, setClientRef] = useState(newClientRef)

  const amt = parseFloat(String(amount).replace(/[,$]/g, '')) || 0
  const memoText = memo.trim()
  const canSend = amt > 0 && amt <= ERT_TRANSFER_MAX && memoText !== '' && !sending

  async function send() {
    if (!canSend) return
    if (!window.confirm(`Send ${money(amt)} from the VFO Services Stripe balance to ERT?\n\nMemo: ${memoText}`)) return
    setSending(true); setError(''); setDone(null)
    try {
      const res = await callApi('specialist_revenue_ert_transfer', { amount: amt, memo: memoText, client_ref: clientRef })
      if (res?.error) { setError(res.error); return }
      setDone({ transfer_id: res?.transfer_id, amount: amt, sandbox: !!res?.sandbox })
      setAmount(''); setMemo(''); setClientRef(newClientRef())
    } catch (e) {
      setError(e?.message || 'Could not send the transfer.')
    } finally {
      setSending(false)
    }
  }

  const label = { fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '6px' }
  const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', fontSize: '13px', fontFamily: 'Inter, sans-serif', outline: 'none' }

  return (
    <div style={{ marginTop: '28px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', boxShadow: 'var(--vfo-shadow-card)' }}>
      <div onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', cursor: 'pointer' }}>
        <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', width: '12px' }}>{open ? '▾' : '▸'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>Send funds to ERT</div>
          <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>Superadmin only · one-off catch-up transfer</div>
        </div>
      </div>

      {open && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid var(--vfo-border-soft)' }}>
          <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.6, margin: '14px 0' }}>
            Transfers from the VFO Services Stripe balance to ERT's connected Stripe account. Use for catch-up amounts only; new requests route their ERT share automatically.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '14px', alignItems: 'start' }}>
            <div>
              <div style={label}>Amount $</div>
              <input style={input} inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div>
              <div style={label}>Memo</div>
              <input style={input} maxLength={200} placeholder="What this catch-up covers" value={memo} onChange={e => setMemo(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
            <button type="button" disabled={!canSend} onClick={send}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: canSend ? `linear-gradient(90deg, ${NAVY} 0%, #125ecc 100%)` : '#c7d2e4', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: canSend ? 'pointer' : 'not-allowed', fontFamily: 'Inter, sans-serif' }}>
              {sending ? 'Sending…' : 'Send to ERT'}
            </button>
            {amt > ERT_TRANSFER_MAX && (
              <span style={{ fontSize: '12px', color: '#b45309' }}>Maximum {money(ERT_TRANSFER_MAX)} per transfer.</span>
            )}
          </div>

          {error && (
            <div style={{ marginTop: '14px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>
          )}
          {done && (
            <div style={{ marginTop: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>
              {money(done.amount)} sent to ERT{done.sandbox ? ' (sandbox)' : ''} · transfer {done.transfer_id || '—'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Holistic Planning Revenue's table chrome, reused verbatim so the two Accounting
// surfaces read the same: bordered card, uppercase header row, Totals above the data.
// Nine columns inside the 1200px Specialists shell, so the fixed widths are trimmed
// rather than letting the ERT column push the table into a horizontal scroll.
const SPECIALIST_GRID = '1.4fr 104px 72px 56px 100px 100px 100px 100px 150px'
const MEMBER_GRID = '1.6fr 140px 66px 118px 118px 118px'
export const tableStyle = { border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }
export const headerRowStyle = { display: 'grid', gap: '8px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
export const totalsRowStyle = { display: 'grid', gap: '8px', padding: '11px 18px', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', alignItems: 'center', fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)' }
export const totalsLabelStyle = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
export const totalsSubStyle = { display: 'block', fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.4px', color: 'var(--vfo-faint)', textTransform: 'none' }

const DEAL_GRID = '1.4fr 120px 100px 100px 100px 70px'

// One recipient's deals grouped across all specialists (Member view).
function MemberGroupRow({ group }) {
  const [open, setOpen] = useState(false)
  const held = group.items.reduce((s, it) => s + (isHeldLine(it) ? Number(it.member_share) || 0 : 0), 0)
  return (
    <div>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'grid', gridTemplateColumns: MEMBER_GRID, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', cursor: 'pointer', fontSize: '13px', color: 'var(--vfo-ink)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>{open ? '▾' : '▸'}</span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.name}</span>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--vfo-faint)' }}>{group.sub} · {group.items.length} deal{group.items.length === 1 ? '' : 's'} across specialists</span>
          </span>
        </span>
        <span style={{ color: 'var(--vfo-muted)' }}>{group.decision}</span>
        <span style={{ textAlign: 'right', color: 'var(--vfo-muted)' }}>{group.deals}</span>
        <span style={{ textAlign: 'right' }}>
          {money(group.member)}
          {held > 0 && <span style={{ ...shareNoteStyle, color: PENDING_COLOR }}>{money(held)} held</span>}
        </span>
        <span style={{ textAlign: 'right' }}>{money(group.ert)}</span>
        <span style={{ textAlign: 'right' }}>{money(group.vfos)}</span>
      </div>
      {open && (
        <div style={{ background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', padding: '14px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: DEAL_GRID, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
            <div>Specialist</div><div>Date</div><div>ERT $</div><div>VFOS $</div><div>Member $</div><div>Deals</div>
          </div>
          {group.items.map((it, i) => {
            // Every group item comes from a received request, so the note always applies.
            const note = memberShareNote(it, true)
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: DEAL_GRID, gap: '10px', alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--vfo-tint)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
                <div style={{ fontWeight: 600 }}>{it.specialist}</div>
                <div style={{ color: 'var(--vfo-muted)' }}>{it.date ? new Date(it.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                <div>{money(it.ert_share)}</div>
                <div>{money(it.vfos_share)}</div>
                <div>
                  <span style={{ opacity: note && note.color === PENDING_COLOR ? 0.55 : 1 }}>{money(it.member_share)}</span>
                  {note && <span style={{ ...shareNoteStyle, color: note.color }}>{note.text}</span>}
                </div>
                <div>{it.deals || 0}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
