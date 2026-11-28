import { useEffect, useMemo, useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getSession } from '../../lib/api'
import { ListHeader } from '../shared/TrackKit'
import ListTable, { ListName, ListText, listSearchStyle, LIST_PAGE_MAX_WIDTH } from '../shared/ListTable'
import ListFilterButton from '../admin/ListFilterButton'
import { PlannerClientsSkeleton } from '../shared/Skeleton'
import { formatDate } from '../../lib/dates'

const STORAGE_KEY = 'taxPlannerListIncluded'
const ROSTER_KEY = 'taxPlannerListRoster'

// The last list this tab loaded, keyed to the session token so a different
// login in the same tab never sees it.
let lastList = null

function readIds(key) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(key) || '[]')
    if (Array.isArray(raw)) return raw.map(Number).filter(Number.isFinite)
  } catch { /* ignore malformed */ }
  return []
}

export default function PlannerClientsList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [rows, setRows] = useState([])
  const [group, setGroup] = useState([])
  const [selfId, setSelfId] = useState(null)
  const [selfRole, setSelfRole] = useState('Tax Planner')
  const [search, setSearch] = useState('')
  const [included, setIncluded] = useState(() => readIds(STORAGE_KEY))

  // One fetch pulls every client the caller is authorized to see (the backend
  // intersects the requested ids with the group roster), and the checkboxes then
  // filter in memory. The roster is only known from a response, so it is cached:
  // the very first mount may need a second call to widen to the full group, every
  // later mount is a single request.
  function apply(data) {
    setRows(data.clients || [])
    setGroup(data.group || [])
    setSelfId(data.self_id ?? null)
    setSelfRole(data.self_role || 'Tax Planner')
  }

  // quiet: a background refresh behind a list already on screen (from the
  // in-memory copy), so no skeleton and no error banner over good rows.
  async function load(rosterIds, allowWiden, quiet = false) {
    if (!quiet) {
      setLoading(true)
      setLoadError('')
    }
    let widenTo = null
    try {
      const payload = rosterIds.length > 0 ? { planner_ids: rosterIds } : {}
      const data = await callApi('tax_planner_portal_clients', payload)
      const roster = (data.group || []).map(g => g.id)
      const role = data.self_role || 'Tax Planner'
      apply(data)
      lastList = { token: getSession()?.token, data }
      sessionStorage.setItem(ROSTER_KEY, JSON.stringify(roster))
      // An empty request means "self only" for a planner but "whole partnership"
      // for a team member, so only the planner case can come back short.
      const covered = (role === 'Team Member' && rosterIds.length === 0) ||
        roster.every(id => id === data.self_id || rosterIds.includes(id))
      if (!covered && allowWiden) widenTo = roster
    } catch (err) {
      if (quiet) console.error(err)
      else setLoadError(err.message || 'Failed to load clients.')
    } finally {
      // Stay in the loading state across the widening call so the list never
      // settles on a half-populated view.
      if (widenTo) load(widenTo, false, quiet)
      else if (!quiet) setLoading(false)
    }
  }

  // Coming back from a client shows the last list at once (same session only),
  // then refreshes it behind the scenes.
  useLayoutEffect(() => {
    const cached = lastList && lastList.token && lastList.token === getSession()?.token ? lastList.data : null
    if (cached) {
      apply(cached)
      setLoading(false)
    }
    load(readIds(ROSTER_KEY), true, !!cached)
  }, [])

  const isTeamMember = selfRole === 'Team Member'

  // A team member has no allocated clients of their own, so the default view is
  // every planner in the partnership. The role only arrives with the load
  // response, so mirror that default into the checkboxes once it lands.
  useEffect(() => {
    if (!isTeamMember || group.length === 0 || included.length > 0) return
    const all = group.map(g => g.id)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    setIncluded(all)
  }, [isTeamMember, group, included])

  function toggleInclude(id) {
    let next = included.includes(id) ? included.filter(x => x !== id) : [...included, id]
    // Clearing every box would leave a team member with nothing, so snap back to
    // all-checked — their default view is the whole partnership.
    if (isTeamMember && next.length === 0) next = group.map(g => g.id)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    setIncluded(next)
  }

  const others = useMemo(
    () => group.filter(g => g.id !== selfId),
    [group, selfId],
  )

  // For a team member "all checked" is the default, not an active filter.
  const filterActive = included.length > 0 && (!isTeamMember || included.length < others.length)

  // Every authorized row is already in state; the checkboxes narrow it here so a
  // tick costs no round-trip. A planner always keeps their own clients in view.
  const visible = useMemo(() => {
    if (isTeamMember) return included.length === 0 ? rows : rows.filter(r => included.includes(r.planner_id))
    return rows.filter(r => r.planner_id === selfId || included.includes(r.planner_id))
  }, [rows, included, isTeamMember, selfId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return visible
    return visible.filter(r =>
      (r.client_name || '').toLowerCase().includes(q) ||
      (r.client_ref || '').toLowerCase().includes(q) ||
      (r.member_name || '').toLowerCase().includes(q)
    )
  }, [visible, search])

  // Sections in the order a planner works them: what is open, what is paused, what is
  // finished, what moved to next tax year, what was stopped. Stopped wins over completion — a stopped plan is
  // Stopped even if every step happened to be ticked before it stopped (the
  // backend applies the same precedence when it sets is_complete's siblings).
  // Search and the planner filter have already been applied, so a section that
  // matches nothing simply disappears.
  const sections = useMemo(() => {
    const active = []
    const paused = []
    const nextYear = []
    const complete = []
    const stopped = []
    for (const r of filtered) {
      if (r.plan_status === 'stopped' && r.status_kind === 'next_tax_year') nextYear.push(r)
      else if (r.plan_status === 'stopped') stopped.push(r)
      else if (r.plan_status === 'paused') paused.push(r)
      else if (r.is_complete) complete.push(r)
      else active.push(r)
    }
    return [
      { key: 'active', label: 'Active', rows: active, showNextStep: true },
      { key: 'paused', label: 'Paused', rows: paused, showNextStep: false },
      { key: 'complete', label: 'Complete', rows: complete, showNextStep: false },
      { key: 'nextYear', label: 'Next tax year', rows: nextYear, showNextStep: false },
      { key: 'stopped', label: 'Stopped', rows: stopped, showNextStep: false },
    ]
  }, [filtered])

  if (loading && rows.length === 0) {
    return (
      <div style={{ maxWidth: LIST_PAGE_MAX_WIDTH, margin: '0 auto', padding: '28px 24px' }}>
        <PlannerClientsSkeleton />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: LIST_PAGE_MAX_WIDTH, margin: '0 auto', padding: '28px 24px' }}>
      {loadError && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>{loadError}</div>
      )}

      <ListHeader title="Tax Planning" count={filtered.length} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by client, ref, or name..." style={listSearchStyle} onChange={e => setSearch(e.target.value)} value={search} />
        {others.length > 0 && (() => {
          // The house filter button (ListFilterButton) holding the planner ticks.
          const optionOf = g => `Include ${g.name}'s clients${g.planner_role === 'Team Member' ? ' — Team Member' : ''}`
          const idOf = Object.fromEntries(others.map(g => [optionOf(g), g.id]))
          const group = { key: 'planner', label: isTeamMember ? 'Show clients by planner' : 'Include group clients', options: others.map(optionOf) }
          return (
            <ListFilterButton
              groups={[group]}
              value={{ planner: others.filter(g => included.includes(g.id)).map(optionOf) }}
              onChange={v => {
                const picked = (v.planner || []).map(o => idOf[o])
                const changed = picked.find(id => !included.includes(id)) ?? included.find(id => !picked.includes(id))
                if (changed != null) toggleInclude(changed)
              }}
              buttonLabel={`${isTeamMember ? 'Tax Planners' : 'Group'}${filterActive ? ` (${included.length})` : ''}`}
              active={filterActive}
            />
          )
        })()}
      </div>

      <div>
        {sections.filter(s => s.rows.length > 0).map(section => (
          <div key={section.key} style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 4px' }}>
              {section.label} ({section.rows.length})
            </div>
            <ListTable
              rows={section.rows}
              rowKey={r => r.tax_plan_id}
              minWidth={section.showNextStep ? '760px' : '620px'}
              onRowClick={r => navigate(`/tax-planner/client/${r.client_id}?program=${r.program_id || 1}&tab=tax&plan=${r.tax_plan_id}`)}
              columns={[
                { key: 'ref', label: 'Ref', width: '100px', get: r => r.client_ref, render: r => <ListText mono>{r.client_ref}</ListText> },
                // The name opens the profile (Client Overview's rule); the row opens the plan.
                { key: 'client', label: 'Client', width: '1.4fr', get: r => r.client_name, render: r => (
                  <ListName sub={r.member_name || '—'} title="Open client profile"
                    onClick={e => { e.stopPropagation(); navigate(`/tax-planner/client/${r.client_id}?program=${r.program_id || 1}&tab=home`) }}>{r.client_name}</ListName>
                ) },
                // Next step is an Active-only column: on a finished or stopped plan
                // nothing is owed, so the column is left out.
                ...(section.showNextStep ? [{ key: 'next', label: 'Next step', width: '2fr', render: r => <ListText style={{ color: r.next_step ? 'var(--vfo-muted)' : undefined }}>{r.next_step}</ListText> }] : []),
                { key: 'planner', label: 'Planner', width: '1fr', get: r => r.planner_name, render: r => <ListText style={{ color: r.planner_name ? 'var(--vfo-muted)' : undefined }}>{r.planner_name}</ListText> },
                // When the VFO team sent the client over (the team-member allocation date).
                { key: 'assigned', label: 'Assigned', width: '110px', type: 'date', get: r => r.assigned_at, render: r => <ListText style={{ color: r.assigned_at ? 'var(--vfo-muted)' : undefined }}>{r.assigned_at ? formatDate(r.assigned_at) : null}</ListText> },
              ]}
            />
          </div>
        ))}
        {filtered.length === 0 && !loadError && (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13.5px', background: 'var(--vfo-tint)', border: '1px dashed var(--vfo-border-chip)', borderRadius: '12px' }}>
            {search ? 'No clients match your search.' : 'Your allocated clients will appear here.'}
          </div>
        )}
      </div>
    </div>
  )
}
