import { useEffect, useMemo, useState } from 'react'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort } from './ListFilterButton'
import ListTable, { ListName, ListText, ONE_LINE, listSearchStyle } from '../shared/ListTable'
import { MemberNameLink } from '../shared/personLinks'
import { useIsPhone } from '../../lib/useMediaQuery'
import { formatDate } from '../../lib/dates'
import { onboardingTypeLabel, createMemberLock } from './onboardingOrder'

// The Advisor / Accountant Onboarding list in the Client Overview style (2026-11-19):
// one table with search, a filter and sortable columns, no sub-tabs. Columns Name ·
// Email · Type · Phase · Started (2026-11-20), each in-progress phase numbered. The Phase filter opens on the
// in-progress phases and Complete; tick Stopped, or untick all, to see the stopped
// ones. Complete and Stopped carry Client Overview's green and red dots. Search,
// filter and sort survive a trip into a record and back. A row whose Create button
// is open (paid, or a bank payment clearing — createMemberLock is null) reads
// "Ready to Create Advisor / Accountant" in the portal's action blue, and the
// Team Member Responsible has its own column (2026-11-20).

const DONE = 'Complete'
const STOPPED = 'Stopped'
const dot = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: color, display: 'inline-block' })
const MIN_WIDTH = '1040px'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Started: Newest' },
  { value: 'oldest', label: 'Started: Oldest' },
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
]

function readView(key, fallback) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null')
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback
  } catch { return fallback }
}

// pipeline: 'advisor' | 'accountant'. stageNames: ['', stage 1, stage 2, stage 3].
// stageOf(ob) -> 1 | 2 | 3 for a row still in progress.
export default function OnboardingListTable({ pipeline, onboardings, stageNames, stageOf, onOpen, emptyText }) {
  const isPhone = useIsPhone()
  // Each in-progress phase carries its stage number: "1 - Initial Meeting" (2026-11-20).
  const phaseLabel = n => `${n} - ${stageNames[n]}`
  const livePhases = stageNames.slice(1).map((_, i) => phaseLabel(i + 1))
  const READY = `Ready to Create ${pipeline === 'advisor' ? 'Advisor' : 'Accountant'}`
  const phaseOptions = [...livePhases, READY, DONE, STOPPED]
  const phaseOf = ob => (ob.member_created_at ? DONE
    : ob.status === 'stopped' ? STOPPED
    : !createMemberLock(ob, pipeline) ? READY
    : phaseLabel(stageOf(ob)))
  const typeOf = ob => onboardingTypeLabel(ob, pipeline) || '(none)'

  // v3: Complete and Ready to Create are shown by default since 2026-11-20, so a
  // view saved before them (which left them out) is not carried over.
  const viewKey = `${pipeline}OnboardingListView3`
  const defaultPhases = [...livePhases, READY, DONE]
  const defaultView = { search: '', filter: { phase: defaultPhases }, sort: 'newest', colSort: null }
  const [initialView] = useState(() => readView(viewKey, defaultView))
  const [search, setSearch] = useState(initialView.search)
  // A saved Phase pick naming a phase that no longer exists (PC Admin became
  // Automated steps, 2026-11-19) falls back to the default, so no row hides.
  const [listFilter, setListFilter] = useState(() => {
    const f = initialView.filter || {}
    return (f.phase || []).some(p => !phaseOptions.includes(p)) ? { ...f, phase: defaultPhases } : f
  })
  const [listSort, setListSort] = useState(initialView.sort)
  const headerSort = useHeaderSort(initialView.colSort)
  const colSort = headerSort.sort
  const resetColSort = headerSort.reset
  useEffect(() => {
    try { sessionStorage.setItem(viewKey, JSON.stringify({ search, filter: listFilter, sort: listSort, colSort })) } catch { /* private mode */ }
  }, [viewKey, search, listFilter, listSort, colSort])

  const typeOptions = useMemo(() => {
    const base = pipeline === 'advisor' ? ['Catalyst', 'Financial Collaborator'] : ['VFO FT', 'VFO Associate']
    const extra = [...new Set(onboardings.map(typeOf))].filter(t => !base.includes(t))
    return [...base, ...extra]
  }, [onboardings, pipeline])

  const filterGroups = [
    { key: 'phase', label: 'Phase', options: phaseOptions, get: phaseOf },
    { key: 'type', label: 'Type', options: typeOptions, get: typeOf },
  ]

  const nameOf = ob => `${ob.first_name || ''} ${ob.last_name || ''}`.trim()
  const q = search.trim().toLowerCase()
  const searched = q
    ? onboardings.filter(ob => nameOf(ob).toLowerCase().includes(q) || (ob.email || '').toLowerCase().includes(q) || String(ob.member_number || '').includes(q))
    : onboardings
  const filtered = searched.filter(ob => matchesFilter(ob, filterGroups, listFilter))
  const rows = useMemo(() => {
    const list = [...filtered]
    const at = ob => ob.created_at || ''
    switch (listSort) {
      case 'oldest': return list.sort((a, b) => at(a).localeCompare(at(b)))
      case 'az': return list.sort((a, b) => nameOf(a).toLowerCase().localeCompare(nameOf(b).toLowerCase()))
      case 'za': return list.sort((a, b) => nameOf(b).toLowerCase().localeCompare(nameOf(a).toLowerCase()))
      case 'newest':
      default: return list.sort((a, b) => at(b).localeCompare(at(a)))
    }
  }, [filtered, listSort])

  const phaseCell = (phase) => {
    if (phase === DONE) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--vfo-success-text)', fontWeight: 600 }}><span style={dot('#1b9254')} />{DONE}</span>
    if (phase === READY) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#125ecc', fontWeight: 600 }}><span style={dot('#125ecc')} />{READY}</span>
    if (phase === STOPPED) return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#b23c30', fontWeight: 600 }}><span style={dot('#b23c30')} />{STOPPED}</span>
    return <span style={{ color: 'var(--vfo-ink)' }}>{phase}</span>
  }
  const columns = [
    { key: 'name', label: 'Name', width: 'minmax(200px, 260px)', get: nameOf, render: ob => (
      <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
        <ListName>{nameOf(ob)}</ListName>
        {ob.member_number && <MemberNameLink memberNumber={ob.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>#{ob.member_number}</MemberNameLink>}
      </span>
    ) },
    { key: 'email', label: 'Email', width: 'minmax(220px, 1fr)', get: ob => ob.email || '', render: ob => (
      <span style={{ ...ONE_LINE, fontSize: '12.5px', color: ob.email ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }} title={ob.email || ''}>{ob.email || 'No email'}</span>
    ) },
    { key: 'type', label: 'Type', width: '170px', get: typeOf, render: ob => <ListText style={{ fontSize: '12.5px' }}>{onboardingTypeLabel(ob, pipeline)}</ListText> },
    { key: 'phase', label: 'Phase', width: '200px', type: 'number', get: ob => phaseOptions.indexOf(phaseOf(ob)), render: ob => <span style={{ fontSize: '12.5px' }}>{phaseCell(phaseOf(ob))}</span> },
    { key: 'team', label: 'Team Member', width: '150px', get: ob => ob.onboarding_team_member || '', render: ob => (
      <span style={{ ...ONE_LINE, fontSize: '12.5px', color: ob.onboarding_team_member ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }} title={ob.onboarding_team_member || ''}>{ob.onboarding_team_member || '—'}</span>
    ) },
    { key: 'started', label: 'Started', width: '110px', type: 'date', get: ob => ob.created_at || '', render: ob => <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{formatDate(ob.created_at) || '—'}</span> },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder={isPhone ? 'Search by name or email...' : 'Search by name, email or member number...'} value={search} onChange={e => setSearch(e.target.value)} style={{ ...listSearchStyle, flex: isPhone ? '1 1 100%' : 1, minWidth: isPhone ? 0 : '240px' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={SORT_OPTIONS} />
      </div>

      <ListTable
        columns={columns}
        rows={rows}
        rowKey={ob => ob.id}
        onRowClick={ob => onOpen(ob)}
        headerSort={headerSort}
        minWidth={MIN_WIDTH}
        empty={onboardings.length === 0 ? emptyText : 'No onboardings match the current filters.'}
      />
    </>
  )
}
