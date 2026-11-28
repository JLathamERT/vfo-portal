import { Fragment, useEffect, useMemo, useRef, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'
import { MemberNameLink } from '../shared/personLinks'
import { taxDisplayName } from '../shared/taxDisplayNames'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import AddClientForm from '../shared/AddClientForm'
import { useIsPhone } from '../../lib/useMediaQuery'
import { statusPillStyle } from '../shared/statusColors'
import TaxPlanKpiPanel from './tax/TaxPlanKpiPanel'
import NextTaxYearList from './tax/NextTaxYearList'
import { NEXT_YEAR_HEX } from './tax/TaxPlanStatus'
import { CLIENT_STATUS_LABELS, clientStatusColors, clientStatusHex, clientStatusLabel } from '../shared/clientStatus'
import { ClientOverviewSkeleton } from '../shared/Skeleton'
import SubTabs, { MiniTabs } from '../shared/SubTabs'
import { PageHeading } from '../shared/ProfileKit'
import { formatDate } from '../../lib/dates'
import { listSelectStyle } from '../shared/ListTable'
import { btnPrimary } from '../shared/buttonStyles'

// Client Overview — a mirror of Member Overview, but oriented around clients and
// their program tracks. Four sub-tabs, each lazily loaded from the backend
// `client_overview_load` engine and cached in component state. One row per TRACK
// (a client with three Regular Priorities is three rows), each carrying who owes
// the next action.

const SECTIONS = [
  // Programs in the one program order (Tax first, 2026-11-26): Tax, then Holistic's
  // two (MAP 1, Regular Priorities), then Partnership and Tailored.
  { key: 'tax_planning', label: 'Tax Planning' },
  { key: 'map1', label: 'MAP 1' },
  { key: 'regular', label: 'Regular Priorities' },
  { key: 'pft', label: 'Partnership Fast Track' },
  { key: 'tailored', label: 'Tailored Route for Accountants' },
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

// Client (member beneath) · [Priority/Plan] · Status · PF · [Service level] · [Tax plan team] · [Phase] · Next action · Owner
// Tax Planning leads with the KPI chevron (admin only, 2026-11-16).
const GRID_BY_SECTION = {
  map1: '1.1fr 96px 130px 1fr 1.9fr 1.1fr',
  regular: '1.1fr 1.7fr 96px 130px 1.9fr 1.1fr',
  tax_planning: '24px 190px 150px 84px 116px 168px 72px 1.8fr 1fr',
  pft: '1.1fr 96px 130px 1.9fr 1.1fr',
  tailored: '1.1fr 96px 130px 1.9fr 1.1fr',
  unassigned: '1.4fr 96px 160px 260px',
  // Same column slots as MAP 1: CIQ sits where Service level is, Last updated
  // where Next action is, CIQs where Owner is - so the columns line up pill to pill.
  ciq: '1.1fr 96px 130px 1fr 1.9fr 1.1fr',
}
const MIN_WIDTH_BY_SECTION = { map1: '980px', regular: '1000px', tax_planning: '1240px', pft: '860px', tailored: '860px', unassigned: '760px', ciq: '980px' }
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

// Tax Planning's own filter (2026-11-23): one pill per plan status.
const TAX_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'In progress' },
  { key: 'paused', label: 'Paused' },
  { key: 'next_tax_year', label: 'Next tax year' },
  { key: 'stopped', label: 'Stopped' },
  { key: 'completed', label: 'Completed' },
]
// A paused or closed tax plan in words: orange paused, orange-red next tax year, red stopped.
function closedTaxText(t) {
  if (t.track_status === 'paused') return { text: `Paused${t.pause_check_back_on ? ` - check back ${formatDate(t.pause_check_back_on)}` : ''}`, color: '#e06717' }
  if (t.status_kind === 'next_tax_year') return { text: t.closed_reason || 'Next tax year', color: NEXT_YEAR_HEX }
  return { text: t.closed_reason || 'Closed', color: '#b23c30' }
}
function taxBucket(t) {
  // Their next plan has been started: off the list, shown under All.
  if (t.track_status === 'stopped' && t.status_kind === 'next_tax_year') return t.followed ? 'followed' : 'next_tax_year'
  if (t.track_status === 'paused') return 'paused'
  if (t.track_status === 'stopped' || t.state === 'closed') return 'stopped'
  return t.state === 'complete' ? 'completed' : 'live'
}


const dot = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: color, display: 'inline-block' })

// Member mode on a phone (2026-10-28): the Clients / Accountants lists as the
// phone list card - name, then ref + status on the left, the programs (one per
// line) on the right, chevron at the far right, the whole card opening the
// profile. No PF or CIQ count on a phone (Jake: simpler, squeeze less in).
function MemberClientCard({ c, onOpen }) {
  const programs = c.programs || []
  return (
    <div onClick={onOpen} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', padding: '12px 14px', marginBottom: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* The programs sit centred against the name block (Jake, 2026-10-28). */}
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '14px', alignItems: 'center' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-ink)', lineHeight: 1.3 }}>{c.name || '—'}</div>
          {c.mirrored_from && <div style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 600, marginTop: '2px' }}>Mirrored from {c.mirrored_from}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '3px' }}>
            {c.client_ref && <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{c.client_ref}</span>}
            {c.status && <span style={statusPillStyle(clientStatusHex(c.status))}>{clientStatusLabel(c.status)}</span>}
          </div>
        </div>
        <div style={{ minWidth: 0, fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.45 }}>
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

// The plan a row is on, in plain words (Jake 2026-11-28: every row has one, so it is
// not a tag). A Direct case says so in orange after the name.
function ProgramName({ label, direct = false }) {
  return (
    <span title={direct ? 'Direct: the member runs this case and is the Planning Facilitator' : undefined}
      style={{ fontSize: '12px', color: 'var(--vfo-ink)', whiteSpace: 'nowrap' }}>
      {label}{direct && <span style={{ color: '#e06717', fontWeight: 600 }}> · Direct</span>}
    </span>
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

// The list's search, filters and sort ride along with the pill (Jake 2026-11-13:
// sorting, opening a client and pressing Back lost the sort), and clear with it
// on a fresh visit from the nav. Default: every status shown, A to Z by name
// (the name is "First Last", so A to Z is by first name).
// '2': the status filter gained options, which a view saved before it would leave out.
export const CLIENT_OVERVIEW_VIEW_KEY = 'clientOverviewView2'
const MEMBER_VIEW_KEY = 'memberClientOverviewView2'
const DEFAULT_VIEW = { search: '', taxPill: 'all', filter: { status: CLIENT_STATUS_LABELS }, sort: 'az', colSort: null }
function readView(key) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null')
    return v && typeof v === 'object' ? { ...DEFAULT_VIEW, ...v } : DEFAULT_VIEW
  } catch { return DEFAULT_VIEW }
}

// canAddClient (member mode): the "+ Add Client" button on the Clients list, on
// the member's tax_intake switch ("Members add clients").
export default function ClientOverviewPanel({ mode = 'admin', onOpenCiq, canAddClient = false }) {
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const memberMode = mode === 'member'
  const sections = memberMode ? MEMBER_SECTIONS : SECTIONS
  const sectionKey = memberMode ? MEMBER_SECTION_KEY : CLIENT_OVERVIEW_SECTION_KEY
  const viewKey = memberMode ? MEMBER_VIEW_KEY : CLIENT_OVERVIEW_VIEW_KEY
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
  const [initialView] = useState(() => readView(viewKey))
  const [search, setSearch] = useState(initialView.search)
  const [listFilter, setListFilter] = useState(initialView.filter)
  const [listSort, setListSort] = useState(initialView.sort)
  const [taxPill, setTaxPill] = useState(initialView.taxPill || 'all')
  // One header-sort state for this table instance; kept across sub-tab switches
  // (the client columns are identical in every section).
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort(initialView.colSort)
  useEffect(() => {
    try { sessionStorage.setItem(viewKey, JSON.stringify({ search, filter: listFilter, sort: listSort, colSort, taxPill })) } catch { /* private mode */ }
  }, [viewKey, search, listFilter, listSort, colSort, taxPill])

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
    { key: 'status', label: 'Status', options: CLIENT_STATUS_LABELS, get: c => clientStatusLabel(c.status) || 'Active' },
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
    : sorted.flatMap(c => (c.tracks || []).map(t => ({ client: c, track: activeSection === 'tax_planning' ? { ...t, followed: (c.tracks || []).some(o => o.id > t.id) } : t })))
  const liveFirst = [...flatRows.filter(r => !isClosedTrack(r.track)), ...flatRows.filter(r => isClosedTrack(r.track))]
  const sortColumns = {
    name: { type: 'text', get: r => r.client.name },
    member_name: { type: 'text', get: r => r.client.member_name },
    status: { type: 'text', get: r => clientStatusLabel(r.client.status) || 'Active' },
    pf: { type: 'text', get: r => r.client.assigned_pf },
    phase: { type: 'number', get: r => r.track.phase_rank },
    team: { type: 'text', get: r => r.track.team },
    ciq: { type: 'number', get: r => CIQ_STATE[r.client.ciq?.state]?.rank ?? -1 },
    ciq_at: { type: 'text', get: r => r.client.ciq?.last_at || '' },
    ciq_count: { type: 'number', get: r => r.client.ciq_count ?? -1 },
  }
  const taxCounts = {}
  if (activeSection === 'tax_planning') for (const r of flatRows) { const k = taxBucket(r.track); taxCounts[k] = (taxCounts[k] || 0) + 1 }
  const pilled = activeSection === 'tax_planning' && taxPill !== 'all' ? liveFirst.filter(r => taxBucket(r.track) === taxPill) : liveFirst
  const rows = sortByColumn(pilled, colSort, sortColumns)

  const isMap1 = activeSection === 'map1'
  const isTax = activeSection === 'tax_planning'
  // The Next tax year list needs the team's details, so members get the plain table.
  const isNextYearList = isTax && taxPill === 'next_tax_year' && !memberMode
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

  // Tax Planning (admin): each plan row's chevron opens its Tax Plan Progress
  // (tax_plan_kpis_load, one call per client, kept for this mount).
  const showKpi = isTax && !memberMode
  const [kpiOpen, setKpiOpen] = useState({})         // plan id -> open
  const [kpiByClient, setKpiByClient] = useState({}) // client id -> { loading, error, plans }
  // The table scrolls sideways below its min width, so an open panel is sized to
  // the table's VISIBLE width (and stuck to its left edge) to wrap on screen.
  const [tableBox, setTableBox] = useState(null)
  const [tableVisibleWidth, setTableVisibleWidth] = useState(null)
  useEffect(() => {
    if (!showKpi || !tableBox || typeof ResizeObserver === 'undefined') return
    const measure = () => setTableVisibleWidth(tableBox.clientWidth || null)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(tableBox)
    return () => ro.disconnect()
  }, [showKpi, tableBox])
  function toggleKpi(client, planId) {
    const opening = !kpiOpen[planId]
    setKpiOpen(o => ({ ...o, [planId]: opening }))
    const have = kpiByClient[client.id]
    if (!opening || (have && (have.loading || have.plans))) return
    setKpiByClient(m => ({ ...m, [client.id]: { loading: true, error: '', plans: null } }))
    callApi('tax_plan_kpis_load', { client_id: client.id })
      .then(res => setKpiByClient(m => ({ ...m, [client.id]: { loading: false, error: '', plans: res.plans || [] } })))
      .catch(err => setKpiByClient(m => ({ ...m, [client.id]: { loading: false, error: err.message, plans: null } })))
  }

  const wrap = { padding: isPhone ? '16px var(--vfo-gutter)' : '24px', maxWidth: '1500px', margin: '0 auto' }
  const phoneCards = isPhone && memberMode && isList
  const sel = listSelectStyle

  return (
    <div style={wrap}>
      <PageHeading eyebrow="Clients" title="Client Overview" action={memberMode && canAddClient && activeSection === 'clients' && !showAddClient && (
        <button type="button" onClick={() => { setAddedMessage(''); setShowAddClient(true) }}
          style={btnPrimary}>
          + Add Client
        </button>
      )} />

      {memberMode && canAddClient && activeSection === 'clients' && showAddClient && (
        <AddClientForm onSave={addClient} onCancel={() => setShowAddClient(false)} profileBase={clientBase} />
      )}
      {addedMessage && activeSection === 'clients' && !showAddClient && (
        <div style={{ padding: '10px 14px', marginBottom: '16px', background: 'rgba(27,146,84,0.10)', border: '1px solid rgba(27,146,84,0.3)', borderRadius: '8px', color: 'var(--vfo-success-text)', fontSize: '13px' }}>{addedMessage}</div>
      )}

      <SubTabs tabs={sections} active={activeSection} onChange={k => { setShowAddClient(false); setActiveSection(k) }} style={{ marginBottom: '16px' }} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Phone: the search takes its own row (its hint read in full), Filters + sort share the next. */}
        <input type="search" name="search" autoComplete="off" placeholder={isPhone ? 'Search by name or ref...' : 'Search by client, ref, number, or name...'} value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: isPhone ? '1 1 100%' : 1, minWidth: isPhone ? 0 : '240px', background: 'var(--vfo-input)' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={CLIENT_SORT_OPTIONS} />
      </div>

      {isTax && !isLoading && (
        <MiniTabs style={{ marginBottom: '16px' }} active={taxPill} onChange={setTaxPill}
          tabs={TAX_PILLS.map(p => ({ key: p.key, label: `${p.label} (${p.key === 'all' ? flatRows.length : taxCounts[p.key] || 0})` }))} />
      )}

      {error && <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>Could not load this section: {error}</div>}

      {isLoading ? <ClientOverviewSkeleton cards={phoneCards} grid={grid} minWidth={(memberMode ? MEMBER_MIN_WIDTH_BY_SECTION : MIN_WIDTH_BY_SECTION)[activeSection]} twoLine={!memberMode} /> : phoneCards ? (
        <div>
          {rows.length === 0 && !error && (
            <div style={{ padding: '12px 2px', color: 'var(--vfo-muted)', fontSize: '14px' }}>
              {clients.length === 0 ? (activeSection === 'accountants' ? 'No accountants yet.' : 'No clients yet.') : 'No clients match the current filters.'}
            </div>
          )}
          {rows.map(({ client: c }) => <MemberClientCard key={c.id} c={c} onOpen={() => openProfile(c, {})} />)}
        </div>
      ) : isNextYearList ? (
        <NextTaxYearList rows={rows} total={taxCounts.next_tax_year || 0} onOpenTrack={openTrack} onOpenProfile={openProfile}
          onChanged={() => { freshSections.current.tax_planning = false; setReloadTick(t => t + 1) }} />
      ) : (
        <div ref={setTableBox} style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ minWidth: (memberMode ? MEMBER_MIN_WIDTH_BY_SECTION : MIN_WIDTH_BY_SECTION)[activeSection] }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
              {showKpi && <span />}
              <SortHeader label="Name" sortKey="name" sort={colSort} onSort={onSort} />
              {secondCol && <span>{secondCol}</span>}
              <SortHeader label="Status" sortKey="status" sort={colSort} onSort={onSort} />
              <SortHeader label="PF" sortKey="pf" sort={colSort} onSort={onSort} />
              {isMap1 && <span>Service level</span>}
              {showKpi && <SortHeader label="Tax plan team" sortKey="team" sort={colSort} onSort={onSort} />}
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
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{clientStatusLabel(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  <span style={{ fontSize: '12px', color: (c.programs || []).length ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>
                    {(c.programs || []).length ? c.programs.map(p => programLabel(p.name)).join(', ') : 'No program yet'}
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
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{clientStatusLabel(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  <span>
                    <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                  </span>
                  <span style={{ fontSize: '12px', color: c.ciq?.last_at ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>
                    {c.ciq?.last_at ? formatDate(c.ciq.last_at) : '—'}
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
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{clientStatusLabel(c.status)}</span>
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
              const planId = t.link?.plan ?? t.id
              const kpiOpenRow = showKpi && planId != null && !!kpiOpen[planId]
              const kpi = kpiByClient[c.id]
              return (
                <Fragment key={`${c.id}:${t.id ?? activeSection}`}>
                <div onClick={() => openTrack(c, t)} {...rowHoverProps}
                  style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                  {showKpi && (planId != null ? (
                    <button
                      onClick={ev => { ev.stopPropagation(); toggleKpi(c, planId) }}
                      title={kpiOpenRow ? 'Hide tax plan progress' : 'Show tax plan progress'}
                      style={{ width: '24px', height: '24px', border: '1px solid var(--vfo-border-strong)', background: kpiOpenRow ? 'var(--vfo-tint)' : 'var(--vfo-card)', borderRadius: '6px', cursor: 'pointer', color: 'var(--vfo-muted)', fontSize: '11px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {kpiOpenRow ? '▾' : '▸'}
                    </button>
                  ) : <span />)}
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
                        ? <ProgramName label={t.program_label} direct={t.tax_route === 'direct'} />
                        : <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>—</span>}
                    </span>
                  )}
                  <span>
                    {c.status
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color, whiteSpace: 'nowrap' }}>{clientStatusLabel(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  {isMap1 && <span style={{ fontSize: '12px', color: t.service_level ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.service_level || '—'}</span>}
                  {showKpi && <span style={{ fontSize: '12px', color: t.team ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.team || 'Not allocated'}</span>}
                  {isTax && (t.state === 'closed' ? (
                    memberMode ? <span style={{ fontSize: '12px', fontWeight: 600, color: closedTaxText(t).color }}>{closedTaxText(t).text}</span>
                      : <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)' }}>{t.reached_phase ? taxDisplayName(t.reached_phase) : '—'}</span>
                  ) : (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: t.state === 'closed' ? '#b23c30' : t.state === 'complete' ? 'var(--vfo-success-text)' : t.phase ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.phase ? taxDisplayName(t.phase) : '—'}</span>
                  ))}
                  {!memberMode && <span style={{ fontSize: '12.5px' }}>
                    {t.state === 'complete' ? (
                      <span style={{ ...line, display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--vfo-success-text)', fontWeight: 600 }}><span style={dot('#1b9254')} />Complete</span>
                    ) : t.state === 'closed' && isTax ? (
                      <span style={{ ...line, display: 'inline-flex', alignItems: 'center', gap: '6px', color: closedTaxText(t).color, fontWeight: 600 }}><span style={dot(closedTaxText(t).color)} />{closedTaxText(t).text}</span>
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
                {kpiOpenRow && (
                  <TaxPlanKpiPanel
                    loading={!kpi || kpi.loading}
                    error={kpi?.error || ''}
                    plan={(kpi?.plans || []).find(p => String(p.plan_id) === String(planId)) || null}
                    fitWidth={tableVisibleWidth}
                  />
                )}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
