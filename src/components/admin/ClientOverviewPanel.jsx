import { useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'
import { ClientOverviewSkeleton } from '../shared/skeletons/admin'
import { MemberNameLink } from '../shared/personLinks'
import { taxDisplayName } from '../shared/taxDisplayNames'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import AddClientForm from '../shared/AddClientForm'
import { useIsPhone } from '../../lib/useMediaQuery'
import { STATUS_COLORS, statusPillStyle } from '../shared/statusColors'

// Client Overview — a mirror of Member Overview, but oriented around clients and
// their program tracks. Four sub-tabs, each lazily loaded from the backend
// `client_overview_load` engine and cached in component state. One row per TRACK
// (a client with three Regular Priorities is three rows), each carrying who owes
// the next action.

const SECTIONS = [
  { key: 'map1', label: 'MAP 1' },
  { key: 'regular', label: 'Regular Priorities' },
  { key: 'tax_planning', label: 'Tax Planning' },
  { key: 'pft', label: 'Partnership Fast Track' },
  // Clients in NO program (a CIQ-created client starts here). One row per client,
  // no tracks; the admin row's dropdown adds the client to one of its member's
  // programs (msm_link_existing_client). Members see their own, read-only.
  // Every client with a CIQ (2026-10-16) - one row per client, its CIQ state.
  // Members see their own clients only.
  { key: 'ciq', label: 'CIQ' },
  { key: 'unassigned', label: 'Unassigned' },
]

// The member portal's tab (2026-10-19): two plain lists instead of the admin's
// program pills - one row per client, every client in or out of a program, with
// its programs and how many CIQs it has. Accountants = the Partnership Fast Track
// (-PFT) clients. The row and the name both open the profile.
const MEMBER_SECTIONS = [
  { key: 'clients', label: 'Clients' },
  { key: 'accountants', label: 'Accountants' },
]
const LIST_SECTIONS = ['clients', 'accountants']
const programLabel = (name) => String(name || '').replace(/^VFO /, '')

// The CIQ pill's state chip: the furthest any of the client's CIQs has got.
const CIQ_STATE = {
  plan_done: { label: 'One Page Plan complete', rank: 2, bg: 'rgba(27,146,84,0.13)', color: 'var(--vfo-success-text)' },
  completed: { label: 'Questionnaire complete', rank: 1, bg: 'var(--vfo-accent-tint)', color: 'var(--vfo-accent-text)' },
  draft: { label: 'In progress', rank: 0, bg: 'rgba(224,103,23,0.14)', color: '#e06717' },
}
function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = String(iso).slice(0, 10).split('-')
  return `${m}/${d}/${y}`
}

// The second column exists only where a row needs its own identity: a Regular
// priority has a title, and the Tax Planning tab merges both tax programs' plans
// so its rows carry a program pill to tell them apart. MAP 1 and PFT rows are
// one-per-client, so the column would only ever repeat the tab name.
const SECOND_COL = { regular: 'Priority', tax_planning: 'Plan' }

const CLIENT_SORT_OPTIONS = [
  { value: 'ref_asc', label: 'Client Ref: A to Z' },
  { value: 'ref_desc', label: 'Client Ref: Z to A' },
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
]

// Client (member beneath) · [Priority/Plan] · Status · PF · [Service level] · [Phase] · Next action · Owner
const GRID_BY_SECTION = {
  map1: '1.1fr 96px 130px 1fr 1.9fr 1.1fr',
  regular: '1.1fr 1.7fr 96px 130px 1.9fr 1.1fr',
  tax_planning: '1.1fr 170px 96px 130px 90px 1.9fr 1.1fr',
  pft: '1.1fr 96px 130px 1.9fr 1.1fr',
  unassigned: '1.4fr 96px 160px 260px',
  // Same column slots as MAP 1: CIQ sits where Service level is, Last updated
  // where Next action is, CIQs where Owner is - so the columns line up pill to pill.
  ciq: '1.1fr 96px 130px 1fr 1.9fr 1.1fr',
}
const MIN_WIDTH_BY_SECTION = { map1: '980px', regular: '1000px', tax_planning: '1040px', pft: '860px', unassigned: '760px', ciq: '980px' }
// The member portal's Client Overview (mode='member', L5 phase 2): the same table
// minus the Next action and Owner columns (decision 27). Fixed widths shared by
// every pill (Name 280 · Priority/Plan 260 · Status 110 · PF 180 · Service level /
// Phase 180) so the columns line up from tab to tab; the trailing 1fr track
// takes the spare width instead of stretching the columns apart.
const MEMBER_GRID_BY_SECTION = {
  map1: '280px 110px 180px 180px 1fr',
  regular: '280px 260px 110px 180px 1fr',
  tax_planning: '280px 260px 110px 180px 180px 1fr',
  pft: '280px 110px 180px 1fr',
  unassigned: '280px 110px 180px 1fr',
  ciq: '280px 110px 180px 180px 180px 1fr',
  clients: '280px 110px 180px 1fr 80px',
  accountants: '280px 110px 180px 1fr 80px',
}
const MEMBER_MIN_WIDTH_BY_SECTION = { map1: '820px', regular: '900px', tax_planning: '1080px', pft: '640px', unassigned: '640px', ciq: '1000px', clients: '820px', accountants: '820px' }

// A stopped / declined / otherwise closed track always sinks below the live ones
// in the dropdown orderings; a clicked column header sorts purely by that column.
const isClosedTrack = (t) => t.state === 'closed'

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function clientStatusColors(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active') return { bg: 'rgba(27,146,84,0.13)', color: 'var(--vfo-success-text)' }
  if (s === 'lost') return { bg: 'rgba(231,76,60,0.13)', color: '#e74c3c' }
  if (s === 'pending') return { bg: 'rgba(224,103,23,0.14)', color: '#e06717' }
  return { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)' }
}

const dot = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: color, display: 'inline-block' })

// The phone card's status pill (statusPillStyle takes a hex).
const STATUS_HEX = { active: '#1b9254', pending: '#e06717', lost: '#e74c3c', removed: STATUS_COLORS.Removed }

// Member mode on a phone (2026-10-28): the Clients / Accountants lists as the
// phone list card - name, then ref + status on the left, the programs (one per
// line) on the right, chevron at the far right, the whole card opening the
// profile. No PF or CIQ count on a phone (Jake: simpler, squeeze less in).
function MemberClientCard({ c, onOpen }) {
  const programs = c.programs || []
  return (
    <div onClick={onOpen} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '12px 14px', marginBottom: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '14px', alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.3 }}>{c.name || '—'}</div>
          {c.mirrored_from && <div style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 600, marginTop: '2px' }}>Mirrored from {c.mirrored_from}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '3px' }}>
            {c.client_ref && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{c.client_ref}</span>}
            {c.status && <span style={statusPillStyle(STATUS_HEX[String(c.status).toLowerCase()])}>{capitalize(c.status)}</span>}
          </div>
        </div>
        <div style={{ minWidth: 0, fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.45, paddingTop: '1px' }}>
          {programs.length
            ? programs.map(p => <div key={p.id}>{programLabel(p.name)}</div>)
            : <div style={{ color: 'var(--vfo-faint)' }}>No program yet</div>}
        </div>
      </div>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>
    </div>
  )
}

// Both multi-line cells (Next action / Owner) use this line box so a two-way fork
// reads across as two aligned pairs.
const line = { lineHeight: '17px', padding: '1px 0' }

function ProgramPill({ label, direct = false }) {
  const isPlanning = label === 'Tax Planning'
  // A Direct case is one pill, not two: the same Tax Planning pill turned orange.
  const bg = direct ? 'rgba(224,103,23,0.12)' : isPlanning ? 'var(--vfo-accent-tint)' : 'var(--vfo-tint)'
  const color = direct ? '#e06717' : isPlanning ? 'var(--vfo-accent-text)' : 'var(--vfo-chip-text)'
  return (
    <span title={direct ? 'Direct: the member runs this case and is the Planning Facilitator' : undefined}
      style={{ fontSize: '10px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', whiteSpace: 'nowrap', background: bg, color, border: '1px solid var(--vfo-border-chip)' }}>{direct ? `${label} - Direct` : label}</span>
  )
}


// The active pill survives a trip into a client and back (Back re-mounts the
// admin portal), so the admin lands on the list they left. Opening Client
// Overview from the nav is a fresh visit: AdminPortal.selectClientOverview
// clears the key, so it starts on MAP 1.
export const CLIENT_OVERVIEW_SECTION_KEY = 'clientOverviewSection'
const MEMBER_SECTION_KEY = 'memberClientOverviewSection'
function readSection(key, sections) {
  const fallback = sections[0].key
  try {
    const v = sessionStorage.getItem(key)
    return sections.some(s => s.key === v) ? v : fallback
  } catch { return fallback }
}

// canAddClient (member mode): the "+ Add Client" button on the Clients list, on
// the member's tax_intake switch ("Members add clients").
export default function ClientOverviewPanel({ mode = 'admin', onOpenCiq, canAddClient = false }) {
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const memberMode = mode === 'member'
  const sections = memberMode ? MEMBER_SECTIONS : SECTIONS
  const sectionKey = memberMode ? MEMBER_SECTION_KEY : CLIENT_OVERVIEW_SECTION_KEY
  const loadAction = memberMode ? 'member_client_overview_load' : 'client_overview_load'
  const clientBase = memberMode ? '/member/client' : '/admin/client'

  const [activeSection, setActiveSectionState] = useState(() => readSection(sectionKey, sections))
  const [showAddClient, setShowAddClient] = useState(false)
  const [addedMessage, setAddedMessage] = useState('')
  const [reloadTick, setReloadTick] = useState(0)
  function setActiveSection(key) {
    setActiveSectionState(key)
    try { sessionStorage.setItem(sectionKey, key) } catch { /* private mode */ }
  }
  const [dataBySection, setDataBySection] = useState({})   // section -> clients[] (success only)
  const [allPrograms, setAllPrograms] = useState([])       // Unassigned pill's dropdown (admin)
  const [loadingSection, setLoadingSection] = useState(null)
  const [errorBySection, setErrorBySection] = useState({}) // section -> message
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState({ status: ['Active', 'Pending'] })
  const [listSort, setListSort] = useState('ref_asc')
  // One header-sort state for this table instance; kept across sub-tab switches
  // (the client columns are identical in every section).
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort()

  // Sections fetched fresh during this mount (a snapshot alone does not count).
  const freshSections = useRef({})

  // Lazily load each section on first visit; a cached section never refetches, a
  // failed one retries when the admin returns to it.
  // Re-opened in the same session (nav click or Back re-mounts this panel): draw
  // the section's last list at once from the snapshot, refresh behind it.
  useLayoutEffect(() => {
    if (freshSections.current[activeSection]) return
    const snapKey = `${memberMode ? 'memberclientoverview' : 'clientoverview'}:${activeSection}`
    let quiet = !!dataBySection[activeSection]
    if (!quiet) {
      const snap = getLastSeen(snapKey)
      if (snap) {
        setDataBySection(d => ({ ...d, [activeSection]: snap.clients || [] }))
        if (snap.all_programs) setAllPrograms(snap.all_programs)
        quiet = true
      }
    }
    let alive = true
    setLoadingSection(activeSection)
    setErrorBySection(e => ({ ...e, [activeSection]: '' }))
    callApi(loadAction, { section: activeSection })
      .then(res => {
        setLastSeen(snapKey, res)
        if (!alive) return
        freshSections.current[activeSection] = true
        setDataBySection(d => ({ ...d, [activeSection]: res.clients || [] }))
        if (res.all_programs) setAllPrograms(res.all_programs)
      })
      .catch(err => {
        if (quiet) { console.error(err); return }
        if (alive) setErrorBySection(e => ({ ...e, [activeSection]: err.message }))
      })
      .finally(() => { if (alive) setLoadingSection(ls => (ls === activeSection ? null : ls)) })
    return () => { alive = false }
  }, [activeSection, reloadTick])

  async function addClient(fields) {
    const res = await callApi('member_add_client', fields)
    setShowAddClient(false)
    setAddedMessage(`${res?.client?.first_name || fields.first_name} ${res?.client?.last_name || fields.last_name} has been added.`)
    freshSections.current.clients = false
    if (activeSection === 'clients') setReloadTick(t => t + 1)
    else setActiveSection('clients')
  }

  const clients = dataBySection[activeSection] || []
  const isLoading = loadingSection === activeSection && !dataBySection[activeSection]
  const error = errorBySection[activeSection]

  const pfOptions = useMemo(() => [...new Set(clients.map(c => c.assigned_pf).filter(Boolean))].sort(), [clients])
  const programOptions = useMemo(() => {
    const s = new Set()
    clients.forEach(c => (c.programs || []).forEach(p => s.add(p.name)))
    return [...s].sort()
  }, [clients])

  const filterGroups = [
    { key: 'status', label: 'Status', options: ['Active', 'Pending', 'Lost', 'Removed'], get: c => capitalize(c.status) || 'Active' },
    ...(pfOptions.length ? [{ key: 'pf', label: 'PF', options: pfOptions, get: c => c.assigned_pf || '(none)' }] : []),
    ...(programOptions.length ? [{ key: 'programs', label: 'Programs', options: programOptions, get: c => (c.programs || []).map(p => p.name) }] : []),
  ]

  const q = search.trim().toLowerCase()
  const searched = q
    ? clients.filter(c => c.name?.toLowerCase().includes(q) || c.client_ref?.toLowerCase().includes(q) || String(c.member_number || '').toLowerCase().includes(q) || c.member_name?.toLowerCase().includes(q))
    : clients
  const filtered = searched.filter(c => matchesFilter(c, filterGroups, listFilter))
  // Baseline = the dropdown ordering; a clicked column header overrides it.
  const sorted = useMemo(() => {
    const list = [...filtered]
    const refOf = c => c.client_ref || ''
    const nameOf = c => (c.name || '').toLowerCase()
    switch (listSort) {
      case 'ref_desc': return list.sort((a, b) => refOf(b).localeCompare(refOf(a)))
      case 'az': return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
      case 'za': return list.sort((a, b) => nameOf(b).localeCompare(nameOf(a)))
      case 'ref_asc':
      default: return list.sort((a, b) => refOf(a).localeCompare(refOf(b)))
    }
  }, [filtered, listSort])

  // Flatten to one row per track; the client order above survives inside each
  // header sort because sortByColumn is stable. Closed tracks go last (stable,
  // so the dropdown order holds inside each half).
  const isUnassigned = activeSection === 'unassigned'
  const isCiq = activeSection === 'ciq'
  const isList = LIST_SECTIONS.includes(activeSection)
  const flatRows = isUnassigned || isCiq || isList
    ? sorted.map(c => ({ client: c, track: {} }))
    : sorted.flatMap(c => (c.tracks || []).map(t => ({ client: c, track: t })))
  const liveFirst = [...flatRows.filter(r => !isClosedTrack(r.track)), ...flatRows.filter(r => isClosedTrack(r.track))]
  const sortColumns = {
    name: { type: 'text', get: r => r.client.name },
    member_name: { type: 'text', get: r => r.client.member_name },
    status: { type: 'text', get: r => capitalize(r.client.status) || 'Active' },
    pf: { type: 'text', get: r => r.client.assigned_pf },
    phase: { type: 'number', get: r => r.track.phase_rank },
    ciq: { type: 'number', get: r => CIQ_STATE[r.client.ciq?.state]?.rank ?? -1 },
    ciq_at: { type: 'text', get: r => r.client.ciq?.last_at || '' },
    ciq_count: { type: 'number', get: r => r.client.ciq_count ?? -1 },
  }
  const rows = sortByColumn(liveFirst, colSort, sortColumns)

  const isMap1 = activeSection === 'map1'
  const isTax = activeSection === 'tax_planning'
  const secondCol = SECOND_COL[activeSection]
  const grid = (memberMode ? MEMBER_GRID_BY_SECTION : GRID_BY_SECTION)[activeSection]

  function openTrack(client, t) {
    const l = t.link || {}
    const url = `${clientBase}/${client.id}?program=${l.program}&tab=${l.tab}` + (l.track ? `&track=${l.track}` : '') + (l.plan ? `&plan=${l.plan}` : '')
    navigate(url)
  }

  // The client NAME opens the client's profile; the row itself opens the track.
  function openProfile(client, t) {
    const l = t.link || {}
    navigate(`${clientBase}/${client.id}?${l.program ? `program=${l.program}&` : ''}tab=home`)
  }

  // Unassigned pill (admin): add the client to a program. Every program is
  // offered; when the member is not enrolled in it yet they are enrolled first
  // (msm_enroll_member, the Members > program "Enroll" button's call), then the
  // client is linked (msm_link_existing_client). The client then leaves this
  // list; it joins the other pills once it has a track.
  const [assigningId, setAssigningId] = useState(null)
  const [assignError, setAssignError] = useState({}) // client id -> message
  async function addToProgram(client, programId) {
    const prog = allPrograms.find(p => String(p.id) === String(programId))
    if (!prog) return
    let enr = (client.enrollments || []).find(e => String(e.program_id) === String(prog.id))
    const who = client.member_name || 'The member'
    const ask = enr
      ? `Add ${client.name} to ${prog.name}?`
      : `${who} is not enrolled in ${prog.name} yet.\n\nEnroll ${who} in ${prog.name} (joined today) and add ${client.name} to it?`
    if (!window.confirm(ask)) return
    setAssigningId(client.id)
    setAssignError(m => ({ ...m, [client.id]: '' }))
    try {
      if (!enr) {
        if (!client.member_number) throw new Error('This client has no member')
        const res = await callApi('msm_enroll_member', { member_number: client.member_number, program_id: prog.id })
        enr = { id: res.enrollment.id, program_id: prog.id }
        // The member's other unassigned clients now link to this enrollment, not re-enroll.
        const added = enr
        setDataBySection(d => ({ ...d, unassigned: (d.unassigned || []).map(c => c.member_number === client.member_number ? { ...c, enrollments: [...(c.enrollments || []), added] } : c) }))
      }
      await callApi('msm_link_existing_client', { client_id: client.id, enrollment_id: enr.id })
      const remaining = (dataBySection.unassigned || []).filter(c => c.id !== client.id)
      setDataBySection(d => ({ ...d, unassigned: (d.unassigned || []).filter(c => c.id !== client.id) }))
      setLastSeen('clientoverview:unassigned', { section: 'unassigned', clients: remaining, all_programs: allPrograms })
    } catch (err) {
      setAssignError(m => ({ ...m, [client.id]: err.message }))
    } finally {
      setAssigningId(null)
    }
  }

  const wrap = { padding: isPhone ? '16px var(--vfo-gutter)' : '24px', maxWidth: '1500px', margin: '0 auto' }
  const phoneCards = isPhone && memberMode && isList
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Clients</p>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '4px 0 0' }}>Client Overview</h2>
        </div>
        {memberMode && canAddClient && activeSection === 'clients' && !showAddClient && (
          <button type="button" onClick={() => { setAddedMessage(''); setShowAddClient(true) }}
            style={{ padding: isPhone ? '6px 14px' : '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: isPhone ? '12.5px' : '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            + Add Client
          </button>
        )}
      </div>

      {memberMode && canAddClient && activeSection === 'clients' && showAddClient && (
        <AddClientForm onSave={addClient} onCancel={() => setShowAddClient(false)} profileBase={clientBase} />
      )}
      {addedMessage && activeSection === 'clients' && !showAddClient && (
        <div style={{ padding: '10px 14px', marginBottom: '16px', background: 'rgba(27,146,84,0.10)', border: '1px solid rgba(27,146,84,0.3)', borderRadius: '8px', color: 'var(--vfo-success-text)', fontSize: '13px' }}>{addedMessage}</div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => { setShowAddClient(false); setActiveSection(s.key) }}
            style={{ padding: '7px 16px', borderRadius: '999px', border: '1px solid ' + (activeSection === s.key ? '#125ecc' : 'var(--vfo-border-strong)'), background: activeSection === s.key ? '#125ecc' : 'var(--vfo-input)', color: activeSection === s.key ? '#fff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Phone: the search takes its own row (its hint read in full), Filters + sort share the next. */}
        <input type="search" name="search" autoComplete="off" placeholder={isPhone ? 'Search by name or ref...' : 'Search by client, ref, number, or name...'} value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: isPhone ? '1 1 100%' : 1, minWidth: isPhone ? 0 : '240px', background: 'var(--vfo-input)' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={CLIENT_SORT_OPTIONS} />
      </div>

      {error && <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>Could not load this section: {error}</div>}

      {isLoading ? <ClientOverviewSkeleton /> : phoneCards ? (
        <div>
          {rows.length === 0 && !error && (
            <div style={{ padding: '12px 2px', color: 'var(--vfo-muted)', fontSize: '14px' }}>
              {clients.length === 0 ? (activeSection === 'accountants' ? 'No accountants yet.' : 'No clients yet.') : 'No clients match the current filters.'}
            </div>
          )}
          {rows.map(({ client: c }) => <MemberClientCard key={c.id} c={c} onOpen={() => openProfile(c, {})} />)}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ minWidth: (memberMode ? MEMBER_MIN_WIDTH_BY_SECTION : MIN_WIDTH_BY_SECTION)[activeSection] }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
              <SortHeader label="Name" sortKey="name" sort={colSort} onSort={onSort} />
              {secondCol && <span>{secondCol}</span>}
              <SortHeader label="Status" sortKey="status" sort={colSort} onSort={onSort} />
              <SortHeader label="PF" sortKey="pf" sort={colSort} onSort={onSort} />
              {isMap1 && <span>Service level</span>}
              {isTax && <SortHeader label="Phase" sortKey="phase" sort={colSort} onSort={onSort} />}
              {isCiq && <SortHeader label="CIQ" sortKey="ciq" sort={colSort} onSort={onSort} />}
              {isCiq && <SortHeader label="Last updated" sortKey="ciq_at" sort={colSort} onSort={onSort} />}
              {isCiq && <span>CIQs</span>}
              {isList && <span>Programs</span>}
              {isList && <SortHeader label="CIQs" sortKey="ciq_count" sort={colSort} onSort={onSort} />}
              {!memberMode && !isUnassigned && !isCiq && <span>Next action</span>}
              {!memberMode && !isUnassigned && !isCiq && <span>Owner</span>}
              {!memberMode && isUnassigned && <span>Add to program</span>}
            </div>

            {rows.length === 0 && !error && (
              <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>
                {isUnassigned && clients.length === 0 ? 'Every client is in a program.'
                  : isCiq && clients.length === 0 ? 'No client has a CIQ yet.'
                  : isList && clients.length === 0 ? (activeSection === 'accountants' ? 'No accountants yet.' : 'No clients yet.')
                  : 'No clients match the current filters.'}
              </div>
            )}

            {isList && rows.map(({ client: c }) => {
              const sc = clientStatusColors(c.status)
              return (
                <div key={c.id} onClick={() => openProfile(c, {})} {...rowHoverProps}
                  style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span title="Open client profile" style={{ fontWeight: 600, color: 'var(--vfo-link)', alignSelf: 'flex-start' }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{c.name || '—'}</span>
                    {c.mirrored_from && <span style={{ fontSize: '11px', color: '#0a85e8', fontWeight: 600 }}>Mirrored from {c.mirrored_from}</span>}
                  </span>
                  <span>
                    {c.status
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color }}>{capitalize(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {(c.programs || []).length
                      ? c.programs.map(p => <ProgramPill key={p.id} label={programLabel(p.name)} />)
                      : <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>No program yet</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.ciq_count ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.ciq_count == null ? '—' : c.ciq_count}</span>
                </div>
              )
            })}

            {isCiq && rows.map(({ client: c }) => {
              const sc = clientStatusColors(c.status)
              const st = CIQ_STATE[c.ciq?.state] || CIQ_STATE.draft
              // The row opens THIS client's list of CIQs (the member's CIQ tab, at
              // level 2); the client NAME still opens the profile.
              return (
                <div key={c.id} onClick={() => (onOpenCiq ? onOpenCiq(c) : openProfile(c, {}))} {...rowHoverProps}
                  style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span onClick={e => { e.stopPropagation(); openProfile(c, {}) }} title="Open client profile" style={{ fontWeight: 600, color: 'var(--vfo-link)', cursor: 'pointer', alignSelf: 'flex-start' }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{c.name || '—'}</span>
                    {!memberMode && (c.member_name
                      ? <MemberNameLink memberNumber={c.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', alignSelf: 'flex-start' }}>{c.member_name}</MemberNameLink>
                      : <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>No member</span>)}
                  </span>
                  <span>
                    {c.status
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color }}>{capitalize(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  <span>
                    <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                  </span>
                  <span style={{ fontSize: '12px', color: c.ciq?.last_at ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>
                    {c.ciq?.last_at ? fmtDate(c.ciq.last_at) : '—'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{c.ciq?.count || 0}</span>
                </div>
              )
            })}

            {isUnassigned && rows.map(({ client: c }) => {
              const sc = clientStatusColors(c.status)
              return (
                <div key={c.id} onClick={() => openProfile(c, {})} {...rowHoverProps}
                  style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span title="Open client profile" style={{ fontWeight: 600, color: 'var(--vfo-link)', alignSelf: 'flex-start' }}>{c.name || '—'}</span>
                    {!memberMode && (c.member_name
                      ? <MemberNameLink memberNumber={c.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', alignSelf: 'flex-start' }}>{c.member_name}</MemberNameLink>
                      : <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>No member</span>)}
                  </span>
                  <span>
                    {c.status
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color }}>{capitalize(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  {!memberMode && (
                    <span onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'default' }}>
                      <select value="" disabled={assigningId === c.id} onChange={e => addToProgram(c, e.target.value)} style={{ ...sel, padding: '6px 10px', fontSize: '12.5px', cursor: 'pointer' }}>
                        <option value="">{assigningId === c.id ? 'Adding...' : 'Add to program...'}</option>
                        {allPrograms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {assignError[c.id] && <span style={{ fontSize: '11px', color: '#c0392b' }}>{assignError[c.id]}</span>}
                    </span>
                  )}
                </div>
              )
            })}

            {!isUnassigned && !isCiq && !isList && rows.map(({ client: c, track: t }) => {
              const sc = clientStatusColors(c.status)
              const nexts = t.next_actions || []
              const entries = nexts.length > 0
                ? nexts
                : (t.next_action ? [{ label: t.next_action, owner: null }] : [])
              const done = t.state === 'complete' || t.state === 'closed'
              return (
                <div key={`${c.id}:${t.id ?? activeSection}`} onClick={() => openTrack(c, t)} {...rowHoverProps}
                  style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span onClick={e => { e.stopPropagation(); openProfile(c, t) }} title="Open client profile" style={{ fontWeight: 600, color: 'var(--vfo-link)', cursor: 'pointer', alignSelf: 'flex-start' }}
                      onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                      onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{c.name || '—'}</span>
                    {memberMode ? (c.mirrored_from ? <span style={{ fontSize: '11px', color: '#0a85e8', fontWeight: 600 }}>Mirrored from {c.mirrored_from}</span> : null) : c.member_name
                      ? <MemberNameLink memberNumber={c.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', alignSelf: 'flex-start' }}>{c.member_name}</MemberNameLink>
                      : <span style={{ fontSize: '11px', color: 'var(--vfo-faint)' }}>No member</span>}
                  </span>
                  {activeSection === 'regular' && (
                    <span style={{ fontSize: '12.5px' }}>{t.title || '—'}</span>
                  )}
                  {activeSection === 'tax_planning' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {t.program_label
                        ? <ProgramPill label={t.program_label} direct={t.tax_route === 'direct'} />
                        : <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>—</span>}
                    </span>
                  )}
                  <span>
                    {c.status
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color }}>{capitalize(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  {isMap1 && <span style={{ fontSize: '12px', color: t.service_level ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.service_level || '—'}</span>}
                  {isTax && (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: t.state === 'closed' ? '#b23c30' : t.state === 'complete' ? 'var(--vfo-success-text)' : t.phase ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.phase ? taxDisplayName(t.phase) : '—'}</span>
                  )}
                  {!memberMode && <span style={{ fontSize: '12.5px' }}>
                    {t.state === 'complete' ? (
                      <span style={{ ...line, display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--vfo-success-text)', fontWeight: 600 }}><span style={dot('#1b9254')} />Complete</span>
                    ) : t.state === 'closed' ? (
                      <span style={{ ...line, display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#b23c30', fontWeight: 600 }}><span style={dot('#b23c30')} />{t.closed_reason || 'Closed'}</span>
                    ) : entries.length === 0 ? (
                      <span style={{ ...line, display: 'block', color: 'var(--vfo-faint)' }}>—</span>
                    ) : entries.map((n, i) => (
                      <span key={i} style={{ ...line, display: 'block' }}>{taxDisplayName(n.label)}</span>
                    ))}
                  </span>}
                  {!memberMode && <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)' }}>
                    {done || entries.length === 0
                      ? <span style={{ ...line, display: 'block', color: 'var(--vfo-faint)' }}>—</span>
                      : entries.map((n, i) => (
                        <span key={i} style={{ ...line, display: 'block', color: n.owner ? 'var(--vfo-muted)' : 'var(--vfo-faint)' }}>{n.owner || '—'}</span>
                      ))}
                  </span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
