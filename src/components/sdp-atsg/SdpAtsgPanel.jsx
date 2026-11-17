import { useEffect, useMemo, useState } from 'react'
import { callApi } from '../../lib/api'
import { ListHeader, PhaseBadge, TrackHero, noMultiClickSelect } from '../shared/TrackKit'
import { DirectoryListSkeleton } from '../shared/Skeleton'
import { money, StatusPill } from '../admin/specialistRevenueShared'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import { useIsPhone } from '../../lib/useMediaQuery'

// SDP - Advanced Tax Strategy Governance (Jake, 2026-11-17). One screen for both
// the planner portal tab (SDP's planners + team members) and the admin
// More > SDP ATSG tab: the client list, + Add Client, and one case's track —
// the retainer input, the automated steps, the payment table (the membership
// fee table's look) and the separate Strategy Impact Fees.
// Kept apart from our own clients on purpose: nothing here reads clients or plans.

const SDP_ORANGE = '#fd681d'
const GREEN = '#1b9254'
const SPLIT_NOTE = '47.5% SDP / 47.5% member / 5% VFO Services (locked)'

const FREQS = [
  ['annual', 'Annual', '1 payment'],
  ['quarterly', 'Quarterly', '4 payments'],
  ['monthly', 'Monthly', '12 payments'],
]
const FREQ_COUNT = { annual: 1, quarterly: 4, monthly: 12 }

// The membership fee table's statuses (MembershipFeesPanel SCHED_STATUS), plus
// "Awaiting payment" for a link that has gone out and not been paid yet.
const PAY_STATUS = {
  scheduled: { label: 'Scheduled', color: '#6b7280' },
  requested: { label: 'Awaiting payment', color: '#0095ff' },
  processing: { label: 'Processing', color: '#e06717' },
  paid: { label: 'Paid', color: '#16a34a' },
  missed: { label: 'Missed', color: '#ef4444' },
  declined: { label: 'Declined', color: '#ef4444' },
  canceled: { label: 'Canceled', color: '#6b7280' },
}
const CASE_STATUS = {
  new: { label: 'Set up', color: '#6b7280' },
  agreement_sent: { label: 'Agreement sent', color: '#0095ff' },
  client_signed: { label: 'Awaiting countersign', color: '#0095ff' },
  awaiting_payment: { label: 'Awaiting first payment', color: '#0095ff' },
  active: { label: 'Active', color: '#16a34a' },
  completed: { label: 'Completed', color: '#16a34a' },
  stopped: { label: 'Stopped', color: '#ef4444' },
}
const LEG_STATUS = {
  paid: { label: 'paid', color: '#16a34a' },
  awaiting_connect: { label: 'held - no payout account', color: '#b45309' },
  held_suspended: { label: 'held - member suspended', color: '#b45309' },
  held_paused: { label: 'held - member paused', color: '#b45309' },
  held_arrears: { label: 'held - member in arrears', color: '#b45309' },
  failed: { label: 'failed - retried daily', color: '#ef4444' },
}

const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)' }
const primaryBtn = (busy) => ({ padding: '8px 18px', borderRadius: '8px', background: busy ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: busy ? 'none' : '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })
const ghostBtn = (color = '#0095ff') => ({ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: `1px solid ${color}66`, background: `${color}1f`, color, fontWeight: 600, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13.5px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }
const labelStyle = { display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', marginBottom: '5px' }
const sectionTitle = { fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }

function fmtDate(d) {
  if (!d) return '—'
  const s = String(d)
  const dt = new Date(s.length <= 10 ? `${s}T12:00:00Z` : s)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: s.length <= 10 ? 'UTC' : undefined })
}
const methodWord = t => (t === 'ach' ? 'bank' : t === 'card' ? 'card' : '')
const freqLabel = f => (FREQS.find(x => x[0] === f) || [])[1] || '—'

function chip(color, text) {
  return <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: `${color}26`, color, fontWeight: 600, border: `1px solid ${color}4d`, whiteSpace: 'nowrap' }}>{text}</span>
}
const neutralChip = text => <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', fontWeight: 600, border: '1px solid var(--vfo-border-chip)', whiteSpace: 'nowrap' }}>{text}</span>

function readCaseFromUrl() {
  try { const v = new URLSearchParams(window.location.search).get('case'); return v ? Number(v) : null } catch { return null }
}

// The open case survives a refresh (per browser tab, like the portals' own tab memory).
const OPEN_CASE_KEY = 'sdpAtsgOpenCase'
function readStoredCase() {
  try { const v = Number(sessionStorage.getItem(OPEN_CASE_KEY)); return v > 0 ? v : null } catch { return null }
}

export default function SdpAtsgPanel({ mode = 'planner', initialCaseId = null }) {
  const [caseId, setCaseIdState] = useState(() => initialCaseId || readCaseFromUrl() || readStoredCase())
  const setCaseId = id => {
    try { if (id) sessionStorage.setItem(OPEN_CASE_KEY, String(id)); else sessionStorage.removeItem(OPEN_CASE_KEY) } catch { /* storage off */ }
    setCaseIdState(id)
  }
  useEffect(() => { if (caseId) { try { sessionStorage.setItem(OPEN_CASE_KEY, String(caseId)) } catch { /* storage off */ } } }, [])
  const [adding, setAdding] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const isPhone = useIsPhone()
  const wrap = { maxWidth: '1180px', margin: '0 auto', padding: isPhone ? '18px 14px' : '28px 24px' }

  return (
    <div style={wrap}>
      {caseId ? (
        <CaseView caseId={caseId} mode={mode} onBack={() => { setCaseId(null); setRefreshKey(k => k + 1) }} />
      ) : adding ? (
        <AddClientCard onCancel={() => setAdding(false)} onCreated={id => { setAdding(false); setCaseId(id) }} />
      ) : (
        <CaseList key={refreshKey} mode={mode} onOpen={setCaseId} onAdd={() => setAdding(true)} />
      )}
    </div>
  )
}

// ─── The client list ───────────────────────────────────────────────────────
function CaseList({ mode, onOpen, onAdd }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const isPhone = useIsPhone()
  useEffect(() => {
    callApi('sdp_atsg_cases_load').then(d => setRows(d.cases || [])).catch(e => setErr(e.message || 'Could not load clients'))
  }, [])
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows || []
    return (rows || []).filter(r => [r.client_name, r.client_ref, r.client_email, r.member_name, r.member_number].some(v => String(v || '').toLowerCase().includes(q)))
  }, [rows, search])

  return (
    <>
      <div style={{ marginBottom: '6px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>
          <span style={{ color: SDP_ORANGE }}>SDP</span> &amp; VFO Services
        </p>
      </div>
      <ListHeader
        title={mode === 'admin' ? 'SDP ATSG' : 'Advanced Tax Strategy Governance'}
        count={rows ? rows.length : undefined}
        action={<button type="button" onClick={onAdd} style={primaryBtn(false)}>+ Add Client</button>}
      />
      {err && <div style={{ ...card, padding: '14px 18px', color: '#ef4444', fontSize: '13px' }}>{err}</div>}
      {!rows && !err && <DirectoryListSkeleton />}
      {rows && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients, refs or members" style={{ ...inputStyle, maxWidth: '360px', marginBottom: '14px' }} />
          {shown.length === 0 && (
            <div style={{ ...card, padding: '28px', textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '13.5px' }}>
              {rows.length === 0 ? 'No clients yet. Press + Add Client to start a new case.' : 'No clients match your search.'}
            </div>
          )}
          {shown.length > 0 && (
            <div style={{ ...card, overflow: 'hidden' }}>
              {!isPhone && (
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1.1fr 90px 90px 170px', gap: '12px', padding: '10px 18px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)', borderBottom: '1px solid var(--vfo-border-soft)' }}>
                  <div>Client</div><div>Member</div><div>Advisory retainer</div><div>Paid</div><div>Impact fees</div><div style={{ textAlign: 'right' }}>Status</div>
                </div>
              )}
              {shown.map(r => {
                const meta = CASE_STATUS[r.status] || { label: r.status, color: '#6b7280' }
                const statusNode = <StatusPill label={r.retainer_problem && r.status === 'active' ? 'Payment missed' : meta.label} color={r.retainer_problem && r.status === 'active' ? '#ef4444' : meta.color} />
                return isPhone ? (
                  <div key={r.id} onClick={() => onOpen(r.id)} {...rowHoverProps} style={{ ...clickableRowStyle, padding: '12px 14px', borderTop: '1px solid var(--vfo-border-soft)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--vfo-ink)' }}>{r.client_name}</span>
                      {statusNode}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px' }}>{r.client_ref} · {r.member_name || r.member_number}</div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>
                      {r.retainer_amount != null ? `${money(r.retainer_amount)} / yr · ${freqLabel(r.frequency)}` : 'Retainer not set'} · {r.retainer_count ? `${r.retainer_paid}/${r.retainer_count} paid` : '—'}
                    </div>
                  </div>
                ) : (
                  <div key={r.id} onClick={() => onOpen(r.id)} {...rowHoverProps} style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: '1.6fr 1.4fr 1.1fr 90px 90px 170px', gap: '12px', alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--vfo-border-soft)', fontSize: '13px', color: 'var(--vfo-ink-2)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: 'var(--vfo-ink)' }}>{r.client_name}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{r.client_ref}{mode === 'admin' && r.group_name ? ` · ${r.group_name}` : ''}{r.sandbox ? ' · Sandbox' : ''}</div>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div>{r.member_name || '—'}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{r.member_number}{r.member_business ? ` · ${r.member_business}` : ''}</div>
                    </div>
                    <div>{r.retainer_amount != null ? <>{money(r.retainer_amount)}<div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{freqLabel(r.frequency)}</div></> : <span style={{ color: 'var(--vfo-faint)' }}>Not set</span>}</div>
                    <div style={{ fontWeight: 600, color: r.retainer_problem ? '#ef4444' : 'var(--vfo-ink-2)' }}>{r.retainer_count ? `${r.retainer_paid}/${r.retainer_count}` : '—'}</div>
                    <div>{r.impact_fee_count ? `${r.impact_fee_paid}/${r.impact_fee_count}` : '—'}</div>
                    <div style={{ textAlign: 'right' }}>{statusNode}</div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </>
  )
}

// ─── + Add Client ──────────────────────────────────────────────────────────
function AddClientCard({ onCancel, onCreated }) {
  const [members, setMembers] = useState(null)
  const [groups, setGroups] = useState([])
  const [memberQuery, setMemberQuery] = useState('')
  const [member, setMember] = useState(null)
  const [groupId, setGroupId] = useState('')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    callApi('sdp_atsg_members_load').then(d => { setMembers(d.members || []); setGroups(d.groups || []) }).catch(e => setErr(e.message || 'Could not load members'))
  }, [])
  const matches = useMemo(() => {
    const q = memberQuery.trim().toLowerCase()
    if (!q || member) return []
    return (members || []).filter(m => [m.name, m.member_number, m.business].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 8)
  }, [members, memberQuery, member])

  async function save() {
    setErr('')
    if (!member) return setErr('Pick a member')
    if (!first.trim() || !last.trim() || !email.trim()) return setErr('First name, last name and email are all required')
    if (groups.length > 1 && !groupId) return setErr('Pick the SDP group')
    setBusy(true)
    try {
      const d = await callApi('sdp_atsg_case_create', { member_number: member.member_number, first_name: first, last_name: last, email, group_id: groupId ? Number(groupId) : undefined })
      onCreated(d.case_id)
    } catch (e) {
      setErr(e.message || 'Could not add the client')
      setBusy(false)
    }
  }

  return (
    <div style={{ ...card, padding: '22px 24px', maxWidth: '640px' }}>
      <div style={{ ...sectionTitle, color: 'var(--vfo-heading)', marginBottom: '4px' }}>Add Client</div>
      <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 18px' }}>Pick the member this client is connected to, then the client's details. The client reference is the member number with -SDP001, -SDP002 and so on.</p>

      <label style={labelStyle}>Member</label>
      {member ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)' }}>
          <span style={{ flex: 1, fontSize: '13.5px', color: 'var(--vfo-ink)' }}><b>{member.name}</b> ({member.member_number}){member.business ? ` · ${member.business}` : ''}</span>
          {!member.has_payout_account && chip('#b45309', 'No payout account')}
          <button type="button" onClick={() => { setMember(null); setMemberQuery('') }} style={ghostBtn('#6b7280')}>Change</button>
        </div>
      ) : (
        <div style={{ position: 'relative', marginBottom: '14px' }}>
          <input value={memberQuery} onChange={e => setMemberQuery(e.target.value)} placeholder={members ? 'Type a member name or number' : 'Loading members…'} disabled={!members} style={inputStyle} />
          {matches.length > 0 && (
            <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: '4px', ...card, maxHeight: '280px', overflowY: 'auto' }}>
              {matches.map(m => (
                <div key={m.member_number} onClick={() => setMember(m)} style={{ padding: '9px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--vfo-border-soft)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--vfo-tint)' }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                  <b>{m.name}</b> <span style={{ color: 'var(--vfo-muted)' }}>({m.member_number}){m.business ? ` · ${m.business}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {groups.length > 1 && (
        <>
          <label style={labelStyle}>SDP group</label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)} style={{ ...inputStyle, marginBottom: '14px' }}>
            <option value="">Pick a group</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
        <div><label style={labelStyle}>Client first name</label><input value={first} onChange={e => setFirst(e.target.value)} style={inputStyle} /></div>
        <div><label style={labelStyle}>Client last name</label><input value={last} onChange={e => setLast(e.target.value)} style={inputStyle} /></div>
      </div>
      <label style={labelStyle}>Client email</label>
      <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />

      {err && <div style={{ color: '#ef4444', fontSize: '12.5px', marginBottom: '12px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="button" onClick={save} disabled={busy} style={primaryBtn(busy)}>{busy ? 'Adding…' : 'Add Client'}</button>
        <button type="button" onClick={onCancel} disabled={busy} style={{ ...ghostBtn('#6b7280'), padding: '8px 16px' }}>Cancel</button>
      </div>
    </div>
  )
}

// ─── One case: the tax track's look (TaxPrioritiesTab TaxPlanTrackView) ────
// Hero, the Pricing & revenue split card (tax/PricingSplitCard's look), then
// numbered phase cards whose steps are 8px-dot rows with an owner chip, a status
// chip and an MM/DD date; inputs open in the tinted form box, the automated steps
// in the tinted cascade box (Tax 3's), exactly as on a tax plan.

const OWNER = {
  SDP: ['rgba(224,103,23,0.12)', '#e06717'],
  Automated: ['var(--vfo-tint)', 'var(--vfo-muted)'],
  Client: ['rgba(111,66,193,0.12)', '#6f42c1'],
}
function OwnerChip({ label }) {
  const c = OWNER[label] || OWNER.Automated
  return <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '999px', background: c[0], color: c[1], fontWeight: 600, marginLeft: '8px', verticalAlign: 'middle', whiteSpace: 'nowrap', display: 'inline-block' }}>{label}</span>
}
// The last agreement came back unsigned (BoldSign Declined / Expired / Revoked)
// and has not been sent again.
const declinedEvent = c => (c.agreement_declined_at && !c.agreement_sent_at ? (c.agreement_declined_event || 'Declined') : null)
const declinedNoticeStyle = { background: 'rgba(180,83,9,0.08)', border: '1px solid rgba(180,83,9,0.35)', borderRadius: '10px', padding: '10px 14px', margin: '4px 0 12px', fontSize: '13px', lineHeight: 1.5, color: '#b45309' }
const chipStyle = hex => ({ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: `${hex}26`, color: hex, fontWeight: 600, border: `1px solid ${hex}4d`, whiteSpace: 'nowrap' })
const neutralChipStyle = { fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', fontWeight: 600, border: '1px solid var(--vfo-border-chip)', whiteSpace: 'nowrap' }
const mmdd = d => {
  if (!d) return ''
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00Z` : d)
  if (Number.isNaN(dt.getTime())) return ''
  return `${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${String(dt.getUTCDate()).padStart(2, '0')}`
}
const STEP_DATE = { fontSize: '11px', color: 'var(--vfo-muted)', display: 'inline-block', width: '55px', textAlign: 'left', flexShrink: 0 }
const formBox = { marginLeft: '18px', marginTop: '8px', marginBottom: '8px', padding: '14px 16px', background: 'var(--vfo-tint)', borderRadius: '10px', border: '1px solid var(--vfo-tint-deep)', fontFamily: 'Inter, sans-serif' }
const formTitle = { fontSize: '11px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }
const formSection = { background: 'var(--vfo-tint)', borderRadius: '8px', padding: '14px', marginBottom: '10px', border: '1px solid var(--vfo-border-chip)' }
const formSectionTitle = { fontSize: '12px', color: '#0095ff', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }
const fInput = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
const fLabel = { fontSize: '11px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }
const submitBtn = busy => ({ padding: '8px 18px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: busy ? 'not-allowed' : 'pointer', border: 'none', background: busy ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', fontFamily: 'Inter, sans-serif' })
const cancelBtn = { padding: '8px 16px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif' }
const smallBtn = (color = '#0095ff') => ({ padding: '4px 12px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: `1px solid ${color}66`, background: `${color}1f`, color, fontWeight: 600, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })

function splitOf(amount) {
  const sdp = Math.round(amount * 0.475 * 100) / 100
  const member = Math.round(amount * 0.475 * 100) / 100
  return { sdp, member, vfos: Math.round((amount - sdp - member) * 100) / 100 }
}
function paymentsFor(annual, freq) {
  const n = FREQ_COUNT[freq] || 0
  if (!n || !(annual > 0)) return []
  const each = Math.floor((annual / n) * 100) / 100
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? Math.round((annual - each * (n - 1)) * 100) / 100 : each))
}

// A step row: 8px dot, name + owner chip, status chip, MM/DD (the tax row).
function StepRow({ done, name, owner, status, date, right, children, expandable, open, onToggle }) {
  return (
    <div style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <div onClick={expandable ? onToggle : undefined} style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', cursor: expandable ? 'pointer' : 'default' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: done ? GREEN : 'transparent', flexShrink: 0, border: `1.5px solid ${done ? GREEN : 'var(--vfo-border-mid)'}` }} />
        <span style={{ fontSize: '13px', color: done ? 'var(--vfo-muted)' : 'var(--vfo-ink)', flex: 1, minWidth: '160px' }}>{name}{owner && <OwnerChip label={owner} />}</span>
        {right}
        {status}
        <span style={STEP_DATE}>{mmdd(date)}</span>
        {expandable && <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>}
      </div>
      {children}
    </div>
  )
}

// Tax 3's automated sub-step: 6px dot, 12px label, Done chip + MM/DD.
function AutoStep({ label, done, pending, at, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid var(--vfo-border-soft)', flexWrap: 'wrap' }}>
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: done ? GREEN : pending ? '#e06717' : 'transparent', flexShrink: 0, border: `1px solid ${done ? GREEN : pending ? '#e06717' : 'var(--vfo-border-mid)'}` }} />
      <span style={{ fontSize: '12px', color: 'var(--vfo-ink)' }}>{label}</span>
      <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
        {action}
        {done && <span style={chipStyle(GREEN)}>Done</span>}
        {!done && pending && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(224,103,23,0.15)', border: '1px solid rgba(224,103,23,0.3)', color: '#e06717' }}>{typeof pending === 'string' ? pending : 'Pending — ACH clearing'}</span>}
        {done && at && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', flexShrink: 0 }}>{mmdd(at)}</span>}
      </span>
    </div>
  )
}

function CaseView({ caseId, mode, onBack }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [expanded, setExpanded] = useState({})
  const isPhone = useIsPhone()

  async function load() {
    try { setD(await callApi('sdp_atsg_case_load', { case_id: caseId })) } catch (e) { setErr(e.message || 'Could not load this client') }
  }
  useEffect(() => { load() }, [caseId])

  async function act(action, payload = {}, okText = '', confirmText = '') {
    if (confirmText && !window.confirm(confirmText)) return null
    setBusy(action); setMsg(null)
    try {
      const res = await callApi(action, { case_id: caseId, ...payload })
      if (res?.email_sent === false) setMsg({ tone: 'amber', text: `Done, but the email failed: ${res.email_error || 'unknown error'}` })
      else if (res?.already_sent_at) setMsg({ tone: 'amber', text: `A payout setup email already went to ${res.to_email} on ${fmtDate(res.already_sent_at)}.` })
      else if (okText) setMsg({ tone: 'success', text: okText })
      await load()
      return res || {}
    } catch (e) {
      setMsg({ tone: 'error', text: e.message || 'Something went wrong' })
      return null
    } finally { setBusy('') }
  }

  const back = <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#0095ff', fontWeight: 500, fontSize: '13px', cursor: 'pointer', marginBottom: '16px', padding: 0, fontFamily: 'Inter, sans-serif' }}>← Back to clients</button>
  if (err) return <div>{back}<div style={{ ...card, padding: '14px 18px', color: '#ef4444', fontSize: '13px' }}>{err}</div></div>
  if (!d) return <div>{back}<DirectoryListSkeleton /></div>

  const c = d.case
  const payments = d.payments || []
  const retainer = payments.filter(p => p.kind === 'retainer').sort((a, b) => a.seq - b.seq)
  const fees = payments.filter(p => p.kind === 'impact_fee')
  const first = retainer.find(p => p.seq === 1)
  const firstPaid = first?.status === 'paid'
  const stopped = c.status === 'stopped'
  const sent = !!c.agreement_sent_at && !!c.boldsign_doc_id
  const retainerSaved = Number(c.retainer_amount) > 0 && !!c.frequency

  const autoSteps = [
    { key: 'sent', label: 'Engagement agreement created and sent for signing', done: sent, at: c.agreement_sent_at },
    { key: 'signed', label: 'Engagement agreement signed by the client', done: !!c.client_signed_at, at: c.client_signed_at },
    { key: 'ceoemail', label: 'Countersign email sent to Steven Cox', done: !!c.ceo_email_sent_at || !!c.ceo_signed_at, at: c.ceo_email_sent_at },
    { key: 'ceo', label: 'Engagement agreement countersigned by Steven Cox', done: !!c.ceo_signed_at, at: c.ceo_signed_at },
    { key: 'payemail', label: 'Payment link sent (ACH or Card choice)', done: !!c.payment_email_sent_at, at: c.payment_email_sent_at },
    { key: 'paid', label: 'First advisory retainer payment collected', done: firstPaid, at: first?.paid_at, pending: first?.status === 'processing' ? true : first?.status === 'declined' ? 'Declined — pay link still open' : false },
    { key: 'docs', label: 'Invoice and receipt created and emailed to client', done: !!first?.docs_sent_at, at: first?.docs_sent_at },
  ]
  const autoDone = autoSteps.every(s => s.done)
  const paidCount = retainer.filter(r => r.status === 'paid').length
  const s1Steps = [retainerSaved && sent, autoDone, retainer.length > 0 && paidCount === retainer.length]
  const s1Done = s1Steps.every(Boolean)
  const s1State = s1Done ? 'done' : 'active'
  const s2State = !firstPaid ? 'pending' : fees.length && fees.every(f => f.status === 'paid' || f.status === 'canceled') ? 'done' : 'active'
  const heroDone = [retainerSaved && sent, ...autoSteps.map(s => s.done), retainer.length > 0 && paidCount === retainer.length].filter(Boolean).length
  const heroTotal = 1 + autoSteps.length + 1

  const isOpen = (k, dflt) => (expanded[k] !== undefined ? expanded[k] : dflt)
  const toggle = (k, dflt) => setExpanded(p => ({ ...p, [k]: !isOpen(k, dflt) }))

  const phaseCard = (key, number, title, state, dflt, pill, body) => {
    const open = isOpen(key, dflt)
    const borderColor = state === 'done' ? 'rgba(27,146,84,0.3)' : state === 'active' ? 'rgba(0,149,255,0.4)' : 'var(--vfo-border)'
    const titleColor = state === 'active' ? 'var(--vfo-primary)' : 'var(--vfo-heading)'
    return (
      <div style={{ background: 'var(--vfo-card)', border: `1px solid ${borderColor}`, borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', marginBottom: '10px', overflow: 'hidden' }}>
        <div onClick={() => toggle(key, dflt)} onMouseDown={noMultiClickSelect} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <PhaseBadge number={number} state={state} />
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12.5px', fontWeight: 800, color: titleColor, textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {pill}
            <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
          </div>
        </div>
        {open && <div style={{ borderTop: `1px solid ${borderColor}`, padding: isPhone ? '12px 14px' : '12px 18px' }}>{body}</div>}
      </div>
    )
  }
  const statePill = (state, done, total) => state === 'done'
    ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(27,146,84,0.15)', color: 'var(--vfo-success-text)', fontWeight: 600, border: '1px solid rgba(27,146,84,0.3)' }}>Done</span>
    : state === 'active'
      ? <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'rgba(0,149,255,0.15)', color: '#0095ff', fontWeight: 600, border: '1px solid rgba(0,149,255,0.3)' }}>In progress{total ? ` · ${done}/${total}` : ''}</span>
      : <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{firstPaid ? 'Not started' : 'Locked'}</span>

  return (
    <div className="vfo-track">
      {back}
      <TrackHero
        eyebrow="SDP - Advanced Tax Strategy Governance"
        title={`${c.client_first} ${c.client_last}`}
        meta={<>
          <span>Started {fmtDate(c.created_at)}</span>
          <span>·</span><span>{c.client_ref}</span>
          <span>·</span><span>Member: {d.member ? `${d.member.name} (${d.member.member_number})` : c.member_number}</span>
          {c.sandbox && <><span>·</span><span>Sandbox</span></>}
        </>}
        completed={heroDone}
        total={heroTotal}
        steps={[{ label: 'ATSG Advisory Retainer', state: s1State }, { label: 'Strategy Impact Fees', state: s2State }]}
        action={(
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: '600' }}>{stopped ? 'Stopped' : c.status === 'completed' ? 'Completed' : 'Live'}</span>
            <div title={stopped ? 'Stopped — nothing further is charged' : 'Stop this engagement'}
              onClick={() => { if (!stopped && c.status !== 'completed' && !busy) act('sdp_atsg_stop', {}, 'Stopped. Nothing further will be charged.', `Stop ${c.client_first} ${c.client_last}'s engagement?\n\nEvery scheduled or missed advisory retainer payment is cancelled and any unpaid Strategy Impact Fee link closes. Payments already made stay as they are. This cannot be undone.`) }}
              style={{ width: '44px', height: '24px', borderRadius: '12px', background: stopped ? '#e74c3c' : '#1b9254', cursor: stopped || c.status === 'completed' ? 'default' : 'pointer', position: 'relative', opacity: busy === 'sdp_atsg_stop' ? 0.5 : 1 }}>
              <div style={{ position: 'absolute', top: '2px', left: stopped ? '2px' : '22px', width: '20px', height: '20px', borderRadius: '50%', background: 'var(--vfo-card)', transition: 'left 0.2s' }} />
            </div>
          </div>
        )}
      />

      {msg && <div style={{ ...card, padding: '11px 16px', marginBottom: '10px', fontSize: '13px', color: msg.tone === 'error' ? '#ef4444' : msg.tone === 'amber' ? '#b45309' : 'var(--vfo-success-text)' }}>{msg.text}</div>}

      <PricingSplit c={c} d={d} retainer={retainer} fees={fees} busy={busy} act={act} open={isOpen('split', false)} onToggle={() => toggle('split', false)} />

      {phaseCard('s1', 1, 'ATSG Advisory Retainer', s1State, !s1Done, statePill(s1State, s1Steps.filter(Boolean).length, 3), (
        <>
          <StepRow
            done={retainerSaved && sent}
            name="ATSG Advisory Retainer and agreement"
            owner="SDP"
            status={retainerSaved && sent ? <span style={chipStyle(GREEN)}>Sent</span> : declinedEvent(c) ? <span style={chipStyle('#e06717')}>{declinedEvent(c)}</span> : <span style={neutralChipStyle}>Not started</span>}
            date={c.agreement_sent_at}
            expandable={sent}
            open={isOpen('pricing', !sent)}
            onToggle={() => toggle('pricing', !sent)}
          >
            {(!sent || isOpen('pricing', !sent)) && (
              <RetainerForm c={c} caseId={caseId} locked={sent || stopped} busy={busy} act={act} />
            )}
          </StepRow>

          <div style={{ padding: '7px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: autoDone ? GREEN : 'transparent', flexShrink: 0, border: `1.5px solid ${autoDone ? GREEN : 'var(--vfo-border-mid)'}` }} />
              <span style={{ fontSize: '13px', color: 'var(--vfo-ink)', flex: 1 }}>Automated steps<OwnerChip label="Automated" /></span>
            </div>
            <div style={{ marginLeft: isPhone ? 0 : '18px', padding: isPhone ? '8px 10px' : '8px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)' }}>
              {autoSteps.map(s => (
                <AutoStep key={s.key} label={s.label} done={s.done} pending={s.pending} at={s.at}
                  action={s.key === 'payemail' && c.ceo_signed_at && !firstPaid && first?.status !== 'processing' && !stopped
                    ? <button type="button" disabled={!!busy} onClick={() => act('sdp_atsg_resend_payment_email', {}, 'Payment email sent again.', 'Send the payment email to the client again?')} style={smallBtn('#6b7280')}>{busy === 'sdp_atsg_resend_payment_email' ? 'Sending…' : 'Resend'}</button>
                    : null} />
              ))}
            </div>
          </div>

          <StepRow
            done={retainer.length > 0 && paidCount === retainer.length}
            name="Advisory retainer payments"
            owner="Client"
            status={retainer.length ? <span style={paidCount === retainer.length ? chipStyle(GREEN) : retainer.some(r => r.status === 'missed' || r.status === 'declined') ? chipStyle('#ef4444') : neutralChipStyle}>{paidCount}/{retainer.length} paid</span> : <span style={neutralChipStyle}>Not started</span>}
            date={retainer.filter(r => r.paid_at).slice(-1)[0]?.paid_at}
            right={c.default_payment_method_id && c.status === 'active'
              ? <button type="button" disabled={!!busy} onClick={() => act('sdp_atsg_send_update_link', {}, 'Update payment method email sent to the client.', `Email ${c.client_first} ${c.client_last} a link to update the card or bank on file? Nothing is charged.`)} style={smallBtn()}>{busy === 'sdp_atsg_send_update_link' ? 'Sending…' : 'Send update payment method link'}</button>
              : null}
          >
            {retainer.length > 0 && <PaymentTable c={c} rows={retainer} isPhone={isPhone} />}
          </StepRow>
        </>
      ))}

      {phaseCard('s2', 2, 'Strategy Impact Fees', s2State, firstPaid, statePill(s2State, fees.filter(f => f.status === 'paid').length, fees.length), (
        <ImpactFees c={c} fees={fees} strategies={d.strategies || []} unlocked={firstPaid && !stopped} busy={busy} act={act} isPhone={isPhone} />
      ))}
    </div>
  )
}

// The tax PricingSplitCard's look: a plan-tool header row, the figures, and the
// "Pays out to" table. The split is locked, so there is no Edit.
function PricingSplit({ c, d, retainer, fees, busy, act, open, onToggle }) {
  const annual = Number(c.retainer_amount) || 0
  const feeTotal = fees.filter(f => f.status !== 'canceled').reduce((s, f) => s + Number(f.amount || 0), 0)
  const m = d.member
  const memberReady = !!m?.payout_ready
  const sdpReady = !!d.group?.payout_ready
  const ret = splitOf(annual)
  const imp = splitOf(feeTotal)
  const legNote = (rows, leg) => {
    const paid = rows.filter(r => r.status === 'paid')
    if (!paid.length) return ''
    const done = paid.filter(r => r[`${leg}_payout_status`] === 'paid').length
    const held = paid.some(r => String(r[`${leg}_payout_status`] || '').startsWith('held_') || r[`${leg}_payout_status`] === 'awaiting_connect')
    const failed = paid.some(r => r[`${leg}_payout_status`] === 'failed')
    return failed ? 'failed — retrying' : held ? 'held — awaiting payout setup' : `paid on ${done} of ${paid.length} payment${paid.length === 1 ? '' : 's'}`
  }
  const noteColor = t => (t.startsWith('paid') ? GREEN : t ? '#b9451d' : 'var(--vfo-muted)')
  const th = { textAlign: 'right', padding: '6px 8px', color: 'var(--vfo-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--vfo-border-soft)' }
  const td = { padding: '7px 8px', textAlign: 'right', color: 'var(--vfo-ink)', borderBottom: '1px solid var(--vfo-border-soft)' }
  const label = { fontSize: '11px', color: 'var(--vfo-muted)' }
  const value = { fontSize: '13px', color: 'var(--vfo-ink)', fontWeight: 600 }
  const rows = [
    { key: 'vfos', name: 'VFO Services · 5%', r: ret.vfos, i: imp.vfos, rn: '', in: '' },
    { key: 'member', name: `Member${m ? ` — ${m.name} (${m.member_number})` : ''} · 47.5%`, r: ret.member, i: imp.member, rn: legNote(retainer, 'member'), in: legNote(fees, 'member') },
    { key: 'sdp', name: 'SDP Personalized Planning · 47.5%', r: ret.sdp, i: imp.sdp, rn: legNote(retainer, 'sdp'), in: legNote(fees, 'sdp') },
  ]
  return (
    <div style={{ background: 'var(--vfo-plan-tool-bg)', border: '1px solid var(--vfo-plan-tool-border)', borderRadius: '14px', boxShadow: '0 3px 12px rgba(20,45,95,0.05)', padding: '14px 18px', marginBottom: '10px', fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-heading)', textTransform: 'uppercase', letterSpacing: '1px' }}>Pricing &amp; revenue split</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{annual > 0 ? `${money(annual)} / year · SDP 47.5 / Member 47.5 / VFOS 5` : 'No pricing entered yet'}</span>
        <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
      </div>

      {/* Outside the fold on purpose — a share with nowhere to go is money that stops. */}
      {(!memberReady || !sdpReady) && (
        <div style={{ marginTop: '9px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(185,69,29,0.08)', border: '1px solid rgba(185,69,29,0.25)', fontSize: '11px', color: '#b9451d', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ flex: 1, minWidth: '200px' }}>
            {!sdpReady && 'SDP Personalized Planning has no active Stripe payout account. '}
            {!memberReady && m && `${m.name} has no active Stripe payout account — their 47.5% is held until they finish setup, then paid automatically.${m.setup_email_sent_at ? ` Setup email sent ${fmtDate(m.setup_email_sent_at)}.` : ''}`}
          </span>
          {!memberReady && m && (
            <button type="button" disabled={!!busy} onClick={e => { e.stopPropagation(); act('sdp_atsg_member_payout_request', { force: !!m.setup_email_sent_at }, `Payout setup email sent to ${m.name}.`, m.setup_email_sent_at ? `${m.name} was already sent a payout setup email on ${fmtDate(m.setup_email_sent_at)}. Send it again?` : `Email ${m.name} their Stripe payout setup link?`) }} style={smallBtn('#b9451d')}>
              {busy === 'sdp_atsg_member_payout_request' ? 'Sending…' : m.setup_email_sent_at ? 'Send setup request again' : 'Send payout setup request'}
            </button>
          )}
        </div>
      )}

      {open && annual <= 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '10px' }}>No pricing entered for this client yet.</div>}
      {open && annual > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 20px', marginBottom: '14px' }}>
            <div><div style={label}>Advisory retainer</div><div style={value}>{money(annual)}</div><div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>per year</div></div>
            <div><div style={label}>Billed</div><div style={value}>{freqLabel(c.frequency)}</div><div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>{retainer.length} payment{retainer.length === 1 ? '' : 's'} · {retainer.filter(r => r.status === 'paid').length} paid</div></div>
            <div><div style={label}>Strategy Impact Fees</div><div style={value}>{money(feeTotal)}</div><div style={{ fontSize: '10px', color: 'var(--vfo-muted)' }}>{fees.length} sent · {fees.filter(f => f.status === 'paid').length} paid</div></div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '420px' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Pays out to</th>
                  <th style={th}>Advisory retainer {money(annual)}</th>
                  <th style={th}>Strategy Impact Fees {money(feeTotal)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.key}>
                    <td style={{ ...td, textAlign: 'left' }}>{r.name}</td>
                    <td style={td}>{money(r.r)}{r.rn && <div style={{ fontSize: '10px', color: noteColor(r.rn) }}>{r.rn}</div>}</td>
                    <td style={td}>{feeTotal > 0 ? money(r.i) : '—'}{r.in && <div style={{ fontSize: '10px', color: noteColor(r.in) }}>{r.in}</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Section 1's input, the "Complete pricing & send agreement" form of Client tax
// planning decision — already open (no Yes / No / Undecided first).
function RetainerForm({ c, caseId, locked, busy, act }) {
  const [amount, setAmount] = useState(c.retainer_amount != null ? String(c.retainer_amount) : '')
  const [freq, setFreq] = useState(c.frequency || '')
  const [previewing, setPreviewing] = useState(false)
  const [err, setErr] = useState('')
  const n = Number(amount)
  const plan = paymentsFor(n, freq)
  const per = plan[0] || 0
  const perSplit = splitOf(per)
  const readOnlyInput = { ...fInput, opacity: 0.6, pointerEvents: 'none' }

  async function saveFirst() {
    setErr('')
    if (!(n > 0)) { setErr('Please enter the ATSG Advisory Retainer.'); return false }
    if (!freq) { setErr('Please select how the client pays.'); return false }
    if (Number(c.retainer_amount) === n && c.frequency === freq) return true
    const res = await act('sdp_atsg_save_retainer', { retainer_amount: n, frequency: freq })
    return !!res
  }
  // The schedule writes itself: once there is an amount and a billing choice the
  // retainer is saved (after a short pause in typing), so the payment rows below
  // appear without a click. Editable until the agreement is sent.
  useEffect(() => {
    if (locked || !(n > 0) || !freq) return
    if (Number(c.retainer_amount) === n && c.frequency === freq) return
    const t = setTimeout(() => { act('sdp_atsg_save_retainer', { retainer_amount: n, frequency: freq }) }, 700)
    return () => clearTimeout(t)
  }, [amount, freq])

  async function preview() {
    setErr('')
    if (!(n > 0)) return setErr('Please enter the ATSG Advisory Retainer.')
    if (!freq) return setErr('Please select how the client pays.')
    // Open the tab inside the click, or the browser blocks it as a pop-up once the
    // PDF has taken a few seconds to render; the PDF is loaded into it after.
    const win = window.open('', '_blank')
    if (win) win.document.write('<p style="font-family:Arial,sans-serif;color:#5b6b8c;padding:24px">Preparing the agreement…</p>')
    setPreviewing(true)
    try {
      if (!(await saveFirst())) { win?.close(); return }
      const dd = await callApi('sdp_atsg_agreement_preview', { case_id: caseId })
      const bytes = Uint8Array.from(atob(dd.pdf_b64), ch => ch.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      if (win) win.location.href = url
      else window.open(url, '_blank')
    } catch (e) { win?.close(); setErr(e.message || 'Preview failed') } finally { setPreviewing(false) }
  }
  async function submit() {
    if (!(await saveFirst())) return
    await act('sdp_atsg_send_agreement', {}, 'Pricing saved and the agreement sent to the client.',
      `Send the Advanced Tax Strategy Governance agreement to ${c.client_first} ${c.client_last} (${c.client_email})?\n\n${money(n)} for the 12-month engagement, ${freq === 'annual' ? 'paid in full' : `billed ${freqLabel(freq).toLowerCase()}`}. The pricing cannot be changed once it is sent.`)
  }

  return (
    <div style={formBox}>
      <div style={formTitle}>{locked ? 'Pricing sent with the agreement' : 'Complete pricing & send agreement'}</div>
      {!locked && declinedEvent(c) && (
        <div style={declinedNoticeStyle}>
          {declinedEvent(c) === 'Expired' ? 'The agreement expired unsigned' : declinedEvent(c) === 'Revoked' ? 'The agreement was revoked' : 'The client declined the agreement'} on {fmtDate(c.agreement_declined_at)}. Check the pricing and send it again.
        </div>
      )}
      <div style={formSection}>
        <div style={formSectionTitle}>Fee details</div>
        <label style={fLabel}>ATSG Advisory Retainer (per year)</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" readOnly={locked} style={{ ...(locked ? readOnlyInput : fInput), paddingLeft: '28px' }} />
        </div>
        <div style={{ marginTop: '10px' }}>
          <label style={fLabel}>Paid by the client</label>
          <select value={freq} disabled={locked} onChange={e => setFreq(e.target.value)} style={{ ...(locked ? readOnlyInput : fInput), background: 'var(--vfo-card)' }}>
            <option value="">-- Select --</option>
            {FREQS.map(([k, l, sub]) => <option key={k} value={k}>{l} ({sub})</option>)}
          </select>
        </div>
        {plan.length > 0 && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--vfo-muted)', lineHeight: 1.6 }}>
            {plan.length === 1
              ? <>One payment of <b style={{ color: 'var(--vfo-ink)' }}>{money(per)}</b>, collected once the agreement is countersigned.</>
              : <><b style={{ color: 'var(--vfo-ink)' }}>{plan.length} payments of {money(per)}</b>{plan[plan.length - 1] !== per ? ` (final payment ${money(plan[plan.length - 1])})` : ''}: the first once the agreement is countersigned, then every {freq === 'quarterly' ? '3 months' : 'month'} from the card or bank account it is paid with.</>}
          </div>
        )}
      </div>

      <div style={formSection}>
        <div style={formSectionTitle}>Revenue split</div>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: per > 0 ? '10px' : 0 }}>Locked for every SDP payment: 47.5% SDP Personalized Planning / 47.5% member / 5% VFO Services. Any card fee stays with VFO Services.</div>
        {per > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            {[['SDP Personalized Planning', perSplit.sdp], ['Member', perSplit.member], ['VFO Services', perSplit.vfos]].map(([l, v]) => (
              <div key={l}>
                <label style={fLabel}>{l} {plan.length > 1 ? 'per payment' : ''}</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                  <input value={fmtMoney(v)} readOnly style={{ ...readOnlyInput, paddingLeft: '28px' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {err && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>{err}</div>}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" onClick={preview} disabled={previewing || !!busy} style={cancelBtn}>{previewing ? 'Preparing…' : 'Preview agreement'}</button>
        {!locked && <button type="button" disabled={!!busy} onClick={submit} style={submitBtn(!!busy)}>{busy === 'sdp_atsg_send_agreement' ? 'Sending…' : busy === 'sdp_atsg_save_retainer' ? 'Saving…' : 'Submit Pricing & Send Agreement'}</button>}
      </div>
    </div>
  )
}

const fmtMoney = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Payments 2+ are dated from the day payment 1 is made, so until then each row
// says how far after it falls; once payment 1 is in, the real dates show.
function dueLabel(c, r) {
  if (r.due_date) return fmtDate(r.due_date)
  if (r.seq === 1) return 'On countersign'
  const months = (c.frequency === 'quarterly' ? 3 : 1) * (r.seq - 1)
  return `${months} month${months === 1 ? '' : 's'} after payment 1`
}

// The membership fee table's look, inside the tinted box under its step.
function PaymentTable({ c, rows, isPhone }) {
  const grid = '1.3fr 180px 110px 100px 140px 1.4fr'
  const total = rows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const paidTotal = rows.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount || 0), 0)
  return (
    <div style={{ marginLeft: isPhone ? 0 : '18px', marginTop: '8px', padding: isPhone ? '8px 10px' : '10px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)', overflowX: 'auto' }}>
      <div style={{ minWidth: isPhone ? '760px' : 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
          <div>Period</div><div>Due date</div><div>Amount</div><div>Card fee</div><div>Status</div><div style={{ textAlign: 'right' }}>Payment</div>
        </div>
        {rows.map(r => <PaymentRow key={r.id} r={r} grid={grid} label={r.period_label} due={dueLabel(c, r)} />)}
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '10px 6px 2px', borderTop: '2px solid var(--vfo-border)', marginTop: '4px', fontSize: '13px', fontWeight: 700, color: 'var(--vfo-heading)' }}>
          <div>Totals</div><div />
          <div>{money(total)}</div>
          <div>{money(rows.reduce((s, r) => s + (r.status === 'paid' ? Number(r.card_fee || 0) : 0), 0))}</div>
          <div style={{ color: 'var(--vfo-success-text-2)' }}>{money(paidTotal)} paid</div>
          <div />
        </div>
      </div>
    </div>
  )
}

function PaymentRow({ r, grid, label, due, actions }) {
  const sMeta = PAY_STATUS[r.status] || { label: r.status, color: '#6b7280' }
  const rowBg = r.status === 'paid' ? 'rgba(22,163,74,0.07)' : (r.status === 'missed' || r.status === 'declined') ? 'rgba(239,68,68,0.07)' : 'transparent'
  const legs = r.status === 'paid' ? [['SDP', r.sdp_payout_status], ['Member', r.member_payout_status]] : []
  return (
    <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', alignItems: 'center', padding: '9px 6px', margin: '0 -6px', borderTop: '1px solid var(--vfo-border-soft)', fontSize: '13px', color: 'var(--vfo-ink-2)', background: rowBg, borderRadius: '6px' }}>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ whiteSpace: 'nowrap' }}>{due}</div>
      <div style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{money(r.amount)}</div>
      <div style={{ color: 'var(--vfo-faint)' }}>{Number(r.card_fee) > 0 && (r.status === 'paid' || r.status === 'processing') ? money(r.card_fee) : '—'}</div>
      <div><StatusPill label={sMeta.label} color={sMeta.color} /></div>
      <div style={{ textAlign: 'right', fontSize: '11.5px', color: 'var(--vfo-muted)', wordBreak: 'break-word' }}>
        {r.status === 'paid' || r.status === 'processing'
          ? [r.paid_at ? fmtDate(r.paid_at) : '', r.payment_method_type ? `${methodWord(r.payment_method_type)}${r.acct_last4 ? ` ••${r.acct_last4}` : ''}` : ''].filter(Boolean).join(' · ') || '—'
          : (r.failure_reason || '—')}
        {r.receipt_number && <div>{r.receipt_number}</div>}
        {legs.length > 0 && (
          <div style={{ marginTop: '2px' }}>
            {legs.map(([who, st]) => {
              const lm = LEG_STATUS[st] || { label: st || 'pending', color: '#6b7280' }
              return <span key={who} style={{ marginLeft: '6px', color: lm.color }}>{who} {lm.label}</span>
            })}
          </div>
        )}
        {actions}
      </div>
    </div>
  )
}

// Section 2: Strategy Impact Fees — its own phase, locked until the first
// retainer payment is paid. Strategy names are shared across every case.
function ImpactFees({ c, fees, strategies, unlocked, busy, act, isPhone }) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [strategy, setStrategy] = useState('')
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [err, setErr] = useState('')
  const grid = '1.4fr 110px 110px 100px 140px 1.5fr'
  const name = adding ? newName.trim() : strategy
  const n = Number(amount)
  const sp = splitOf(n > 0 ? n : 0)

  async function send() {
    setErr('')
    if (!(n > 0)) return setErr('Please enter the fee amount.')
    if (!date) return setErr('Please enter the meeting date.')
    if (!name) return setErr('Please pick or add a strategy name.')
    const res = await act('sdp_atsg_impact_fee_create', { amount: n, meeting_date: date, strategy_name: name }, 'Strategy Impact Fee sent to the client.',
      `Email ${c.client_first} ${c.client_last} a Strategy Impact Fee of ${money(n)} for ${name}?`)
    if (res) { setAmount(''); setDate(''); setStrategy(''); setNewName(''); setAdding(false) }
  }

  if (!unlocked) {
    return (
      <StepRow done={false} name="Strategy Impact Fee" owner="SDP"
        status={<span style={neutralChipStyle}>{c.status === 'stopped' ? 'Stopped' : 'Locked until payment 1 is paid'}</span>} />
    )
  }

  return (
    <>
      <StepRow done={false} name="Send a Strategy Impact Fee" owner="SDP" status={<span style={neutralChipStyle}>Any time</span>}>
        <div style={formBox}>
          <div style={formTitle}>Strategy Impact Fee &amp; payment request</div>
          <div style={formSection}>
            <div style={formSectionTitle}>Fee details</div>
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={fLabel}>Amount</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--vfo-muted)', fontSize: '14px' }}>$</span>
                  <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" style={{ ...fInput, paddingLeft: '28px' }} />
                </div>
              </div>
              <div>
                <label style={fLabel}>Meeting date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fInput} />
              </div>
            </div>
            <label style={fLabel}>Strategy name</label>
            {adding ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New strategy name" style={fInput} autoFocus />
                <button type="button" onClick={() => { setAdding(false); setNewName('') }} style={cancelBtn}>Pick from list</button>
              </div>
            ) : (
              <select value={strategy} onChange={e => { if (e.target.value === '__new') { setAdding(true); setStrategy('') } else setStrategy(e.target.value) }} style={{ ...fInput, background: 'var(--vfo-card)' }}>
                <option value="">-- Select --</option>
                {strategies.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="__new">+ Add a new strategy</option>
              </select>
            )}
          </div>
          <div style={formSection}>
            <div style={formSectionTitle}>Revenue split</div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>
              Locked: 47.5% SDP Personalized Planning{n > 0 ? ` (${money(sp.sdp)})` : ''} / 47.5% member{n > 0 ? ` (${money(sp.member)})` : ''} / 5% VFO Services{n > 0 ? ` (${money(sp.vfos)})` : ''}.
            </div>
          </div>
          {err && <div style={{ color: '#e74c3c', fontWeight: 500, fontSize: '13px', marginBottom: '8px' }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" disabled={!!busy} onClick={send} style={submitBtn(!!busy)}>{busy === 'sdp_atsg_impact_fee_create' ? 'Sending…' : 'Submit & Send Payment Request'}</button>
          </div>
        </div>
      </StepRow>

      {fees.length > 0 && (
        <StepRow done={fees.every(f => f.status === 'paid' || f.status === 'canceled')} name="Strategy Impact Fees sent" owner="Client"
          status={<span style={fees.every(f => f.status === 'paid' || f.status === 'canceled') ? chipStyle(GREEN) : neutralChipStyle}>{fees.filter(f => f.status === 'paid').length}/{fees.filter(f => f.status !== 'canceled').length} paid</span>}
          date={fees.filter(f => f.paid_at).slice(-1)[0]?.paid_at}>
          <div style={{ marginLeft: isPhone ? 0 : '18px', marginTop: '8px', padding: isPhone ? '8px 10px' : '10px 14px', background: 'var(--vfo-tint)', borderRadius: '8px', border: '1px solid var(--vfo-border-chip)', overflowX: 'auto' }}>
            <div style={{ minWidth: isPhone ? '760px' : 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '0 0 8px', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
                <div>Strategy</div><div>Meeting</div><div>Amount</div><div>Card fee</div><div>Status</div><div style={{ textAlign: 'right' }}>Payment</div>
              </div>
              {fees.map(f => (
                <PaymentRow key={f.id} r={f} grid={grid} label={f.strategy_name} due={fmtDate(f.meeting_date)} />
              ))}
            </div>
          </div>
        </StepRow>
      )}
    </>
  )
}
