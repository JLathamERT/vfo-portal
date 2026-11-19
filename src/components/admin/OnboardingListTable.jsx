import { useEffect, useMemo, useState } from 'react'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'
import { MemberNameLink } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import { useIsPhone } from '../../lib/useMediaQuery'
import { formatDate } from '../../lib/dates'
import { onboardingTypeLabel } from './onboardingOrder'

// The Advisor / Accountant Onboarding list in the Client Overview style (2026-11-19):
// one table with search, a filter and sortable columns, no sub-tabs. The Phase
// filter opens on the in-progress phases, as the old list did (Completed and
// Stopped sat folded away); tick Done / Stopped, or untick all, to see them.
// Search, filter and sort survive a trip into a record and back.

const GRID = 'minmax(180px, 1.2fr) 170px 160px minmax(200px, 1.4fr) 110px'
const MIN_WIDTH = '860px'

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
  const livePhases = stageNames.slice(1)
  const phaseOptions = [...livePhases, 'Done', 'Stopped']
  const phaseOf = ob => (ob.member_created_at ? 'Done' : ob.status === 'stopped' ? 'Stopped' : stageNames[stageOf(ob)])
  const typeOf = ob => onboardingTypeLabel(ob, pipeline) || '(none)'

  const viewKey = `${pipeline}OnboardingListView`
  const defaultView = { search: '', filter: { phase: livePhases }, sort: 'newest', colSort: null }
  const [initialView] = useState(() => readView(viewKey, defaultView))
  const [search, setSearch] = useState(initialView.search)
  // A saved Phase pick naming a phase that no longer exists (PC Admin became
  // Automated steps, 2026-11-19) falls back to the default, so no row hides.
  const [listFilter, setListFilter] = useState(() => {
    const f = initialView.filter || {}
    return (f.phase || []).some(p => !phaseOptions.includes(p)) ? { ...f, phase: livePhases } : f
  })
  const [listSort, setListSort] = useState(initialView.sort)
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort(initialView.colSort)
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
  const ordered = useMemo(() => {
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
  const rows = sortByColumn(ordered, colSort, {
    name: { type: 'text', get: nameOf },
    type: { type: 'text', get: typeOf },
    phase: { type: 'number', get: ob => phaseOptions.indexOf(phaseOf(ob)) },
    email: { type: 'text', get: ob => ob.email || '' },
    started: { type: 'date', get: ob => ob.created_at || '' },
  })

  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  return (
    <>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder={isPhone ? 'Search by name or email...' : 'Search by name, email or member number...'} value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: isPhone ? '1 1 100%' : 1, minWidth: isPhone ? 0 : '240px' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={SORT_OPTIONS} />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: MIN_WIDTH }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <SortHeader label="Name" sortKey="name" sort={colSort} onSort={onSort} />
            <SortHeader label="Type" sortKey="type" sort={colSort} onSort={onSort} />
            <SortHeader label="Phase" sortKey="phase" sort={colSort} onSort={onSort} />
            <SortHeader label="Email" sortKey="email" sort={colSort} onSort={onSort} />
            <SortHeader label="Started" sortKey="started" sort={colSort} onSort={onSort} />
          </div>

          {rows.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>
              {onboardings.length === 0 ? emptyText : 'No onboardings match the current filters.'}
            </div>
          )}

          {rows.map(ob => {
            const phase = phaseOf(ob)
            const type = onboardingTypeLabel(ob, pipeline)
            return (
              <div key={ob.id} onClick={() => onOpen(ob)} {...rowHoverProps}
                style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: 'var(--vfo-link)' }}>{nameOf(ob) || '—'}</span>
                  {ob.member_number && <MemberNameLink memberNumber={ob.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', alignSelf: 'flex-start' }}>#{ob.member_number}</MemberNameLink>}
                </span>
                <span style={{ fontSize: '12.5px', color: type ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{type || '—'}</span>
                <span style={{ fontSize: '12.5px', color: 'var(--vfo-ink)' }}>{phase}</span>
                <span style={{ fontSize: '12.5px', color: ob.email ? 'var(--vfo-ink)' : 'var(--vfo-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ob.email || ''}>{ob.email || 'No email'}</span>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{formatDate(ob.created_at) || '—'}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
