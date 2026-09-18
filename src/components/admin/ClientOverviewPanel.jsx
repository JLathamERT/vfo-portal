import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'
import { ClientOverviewSkeleton } from '../shared/skeletons/admin'
import { MemberNameLink } from '../shared/personLinks'

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
]

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

// Client · [Priority/Plan] · Member Name · Status · PF · [Service level] · [Phase] · Next action · Owner
const GRID_BY_SECTION = {
  map1: '1.4fr 1.3fr 96px 120px 1fr 1.9fr 1.1fr',
  regular: '1.4fr 1.7fr 1.3fr 96px 120px 1.9fr 1.1fr',
  tax_planning: '1.4fr 130px 1.3fr 96px 120px 90px 1.9fr 1.1fr',
  pft: '1.4fr 1.3fr 96px 120px 1.9fr 1.1fr',
}
const MIN_WIDTH_BY_SECTION = { map1: '1060px', regular: '1080px', tax_planning: '1120px', pft: '940px' }

// A stopped / declined / otherwise closed track always sinks below the live ones
// in the dropdown orderings; a clicked column header sorts purely by that column.
const isClosedTrack = (t) => t.state === 'closed'

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function clientStatusColors(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active') return { bg: 'rgba(27,146,84,0.13)', color: '#1b9254' }
  if (s === 'lost') return { bg: 'rgba(231,76,60,0.13)', color: '#e74c3c' }
  if (s === 'pending') return { bg: 'rgba(224,103,23,0.14)', color: '#e06717' }
  return { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)' }
}

const dot = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: color, display: 'inline-block' })

// Both multi-line cells (Next action / Owner) use this line box so a two-way fork
// reads across as two aligned pairs.
const line = { lineHeight: '17px', padding: '1px 0' }

function ProgramPill({ label }) {
  const isPlanning = label === 'Tax Planning'
  return (
    <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', whiteSpace: 'nowrap', background: isPlanning ? 'rgba(18,94,204,0.10)' : 'var(--vfo-tint)', color: isPlanning ? '#125ecc' : 'var(--vfo-muted)' }}>{label}</span>
  )
}

// The member runs this case (client_tax_plans.tax_route). Rides beside the
// program pill in the same cell rather than taking a column of its own.
function DirectPill() {
  return (
    <span title="Direct: the member runs this case" style={{ fontSize: '10px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', whiteSpace: 'nowrap', background: 'rgba(224,103,23,0.12)', color: '#e06717' }}>Direct</span>
  )
}

export default function ClientOverviewPanel() {
  const navigate = useNavigate()

  const [activeSection, setActiveSection] = useState('map1')
  const [dataBySection, setDataBySection] = useState({})   // section -> clients[] (success only)
  const [loadingSection, setLoadingSection] = useState(null)
  const [errorBySection, setErrorBySection] = useState({}) // section -> message
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState({ status: ['Active', 'Pending'] })
  const [listSort, setListSort] = useState('ref_asc')
  // One header-sort state for this table instance; kept across sub-tab switches
  // (the client columns are identical in every section).
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort()

  // Lazily load each section on first visit; a cached section never refetches, a
  // failed one retries when the admin returns to it.
  useEffect(() => {
    if (dataBySection[activeSection]) return
    let alive = true
    setLoadingSection(activeSection)
    setErrorBySection(e => ({ ...e, [activeSection]: '' }))
    callApi('client_overview_load', { section: activeSection })
      .then(res => { if (alive) setDataBySection(d => ({ ...d, [activeSection]: res.clients || [] })) })
      .catch(err => { if (alive) setErrorBySection(e => ({ ...e, [activeSection]: err.message })) })
      .finally(() => { if (alive) setLoadingSection(ls => (ls === activeSection ? null : ls)) })
    return () => { alive = false }
  }, [activeSection])

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
  const flatRows = sorted.flatMap(c => (c.tracks || []).map(t => ({ client: c, track: t })))
  const liveFirst = [...flatRows.filter(r => !isClosedTrack(r.track)), ...flatRows.filter(r => isClosedTrack(r.track))]
  const sortColumns = {
    name: { type: 'text', get: r => r.client.name },
    member_name: { type: 'text', get: r => r.client.member_name },
    status: { type: 'text', get: r => capitalize(r.client.status) || 'Active' },
    pf: { type: 'text', get: r => r.client.assigned_pf },
    phase: { type: 'number', get: r => r.track.phase_rank },
  }
  const rows = sortByColumn(liveFirst, colSort, sortColumns)

  const isMap1 = activeSection === 'map1'
  const isTax = activeSection === 'tax_planning'
  const secondCol = SECOND_COL[activeSection]
  const grid = GRID_BY_SECTION[activeSection]

  function openTrack(client, t) {
    const l = t.link || {}
    const url = `/admin/client/${client.id}?program=${l.program}&tab=${l.tab}` + (l.track ? `&track=${l.track}` : '') + (l.plan ? `&plan=${l.plan}` : '')
    navigate(url)
  }

  const wrap = { padding: '24px', maxWidth: '1500px', margin: '0 auto' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Clients</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '4px 0 0' }}>Client Overview</h2>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActiveSection(s.key)}
            style={{ padding: '7px 16px', borderRadius: '999px', border: '1px solid ' + (activeSection === s.key ? '#125ecc' : 'var(--vfo-border-strong)'), background: activeSection === s.key ? '#125ecc' : 'var(--vfo-input)', color: activeSection === s.key ? '#fff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by client, ref, number, or name..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: 1, minWidth: '240px', background: 'var(--vfo-input)' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={CLIENT_SORT_OPTIONS} />
      </div>

      {error && <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>Could not load this section: {error}</div>}

      {isLoading ? <ClientOverviewSkeleton /> : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
          <div style={{ minWidth: MIN_WIDTH_BY_SECTION[activeSection] }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
              <SortHeader label="Client" sortKey="name" sort={colSort} onSort={onSort} />
              {secondCol && <span>{secondCol}</span>}
              <SortHeader label="Member Name" sortKey="member_name" sort={colSort} onSort={onSort} />
              <SortHeader label="Status" sortKey="status" sort={colSort} onSort={onSort} />
              <SortHeader label="PF" sortKey="pf" sort={colSort} onSort={onSort} />
              {isMap1 && <span>Service level</span>}
              {isTax && <SortHeader label="Phase" sortKey="phase" sort={colSort} onSort={onSort} />}
              <span>Next action</span>
              <span>Owner</span>
            </div>

            {rows.length === 0 && !error && (
              <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>No clients match the current filters.</div>
            )}

            {rows.map(({ client: c, track: t }) => {
              const sc = clientStatusColors(c.status)
              const nexts = t.next_actions || []
              const entries = nexts.length > 0
                ? nexts
                : (t.next_action ? [{ label: t.next_action, owner: null }] : [])
              const done = t.state === 'complete' || t.state === 'closed'
              return (
                <div key={`${c.id}:${t.id ?? activeSection}`} style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                  <span onClick={() => openTrack(c, t)} style={{ fontWeight: 600, color: '#125ecc', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{c.name || '—'}</span>
                  {activeSection === 'regular' && (
                    <span style={{ fontSize: '12.5px' }}>{t.title || '—'}</span>
                  )}
                  {activeSection === 'tax_planning' && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                      {t.program_label
                        ? <ProgramPill label={t.program_label} />
                        : <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>—</span>}
                      {t.tax_route === 'direct' && <DirectPill />}
                    </span>
                  )}
                  {c.member_name
                    ? <MemberNameLink memberNumber={c.member_number} style={{ fontSize: '12px' }}>{c.member_name}</MemberNameLink>
                    : <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>—</span>}
                  <span>
                    {c.status
                      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, background: sc.bg, color: sc.color }}>{capitalize(c.status)}</span>
                      : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: c.assigned_pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.assigned_pf || '—'}</span>
                  {isMap1 && <span style={{ fontSize: '12px', color: t.service_level ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.service_level || '—'}</span>}
                  {isTax && (
                    <span style={{ fontSize: '12px', fontWeight: 600, color: t.state === 'closed' ? '#b23c30' : t.state === 'complete' ? '#1b9254' : t.phase ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{t.phase || '—'}</span>
                  )}
                  <span style={{ fontSize: '12.5px' }}>
                    {t.state === 'complete' ? (
                      <span style={{ ...line, display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#1b9254', fontWeight: 600 }}><span style={dot('#1b9254')} />Complete</span>
                    ) : t.state === 'closed' ? (
                      <span style={{ ...line, display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#b23c30', fontWeight: 600 }}><span style={dot('#b23c30')} />{t.closed_reason || 'Closed'}</span>
                    ) : entries.length === 0 ? (
                      <span style={{ ...line, display: 'block', color: 'var(--vfo-faint)' }}>—</span>
                    ) : entries.map((n, i) => (
                      <span key={i} style={{ ...line, display: 'block' }}>{n.label}</span>
                    ))}
                  </span>
                  <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)' }}>
                    {done || entries.length === 0
                      ? <span style={{ ...line, display: 'block', color: 'var(--vfo-faint)' }}>—</span>
                      : entries.map((n, i) => (
                        <span key={i} style={{ ...line, display: 'block', color: n.owner ? 'var(--vfo-muted)' : 'var(--vfo-faint)' }}>{n.owner || '—'}</span>
                      ))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
