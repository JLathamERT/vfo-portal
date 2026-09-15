import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'
import { ListHeader } from '../shared/TrackKit'
import { DirectoryListSkeleton } from '../shared/Skeleton'

const STORAGE_KEY = 'taxPlannerListIncluded'
const ROSTER_KEY = 'taxPlannerListRoster'

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
  const [filterOpen, setFilterOpen] = useState(false)

  // One fetch pulls every client the caller is authorized to see (the backend
  // intersects the requested ids with the group roster), and the checkboxes then
  // filter in memory. The roster is only known from a response, so it is cached:
  // the very first mount may need a second call to widen to the full group, every
  // later mount is a single request.
  async function load(rosterIds, allowWiden) {
    setLoading(true)
    setLoadError('')
    let widenTo = null
    try {
      const payload = rosterIds.length > 0 ? { planner_ids: rosterIds } : {}
      const data = await callApi('tax_planner_portal_clients', payload)
      const roster = (data.group || []).map(g => g.id)
      const role = data.self_role || 'Tax Planner'
      setRows(data.clients || [])
      setGroup(data.group || [])
      setSelfId(data.self_id ?? null)
      setSelfRole(role)
      sessionStorage.setItem(ROSTER_KEY, JSON.stringify(roster))
      // An empty request means "self only" for a planner but "whole partnership"
      // for a team member, so only the planner case can come back short.
      const covered = (role === 'Team Member' && rosterIds.length === 0) ||
        roster.every(id => id === data.self_id || rosterIds.includes(id))
      if (!covered && allowWiden) widenTo = roster
    } catch (err) {
      setLoadError(err.message || 'Failed to load clients.')
    } finally {
      // Stay in the loading state across the widening call so the list never
      // settles on a half-populated view.
      if (widenTo) load(widenTo, false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    load(readIds(ROSTER_KEY), true)
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

  // Three sections, in the order a planner works them: what is open, what is
  // finished, what was stopped. Stopped wins over completion — a stopped plan is
  // Stopped even if every step happened to be ticked before it stopped (the
  // backend applies the same precedence when it sets is_complete's siblings).
  // Search and the planner filter have already been applied, so a section that
  // matches nothing simply disappears.
  const sections = useMemo(() => {
    const active = []
    const complete = []
    const stopped = []
    for (const r of filtered) {
      if (r.plan_status === 'stopped') stopped.push(r)
      else if (r.is_complete) complete.push(r)
      else active.push(r)
    }
    return [
      { key: 'active', label: 'Active', rows: active, showNextStep: true },
      { key: 'complete', label: 'Complete', rows: complete, showNextStep: false },
      { key: 'stopped', label: 'Stopped', rows: stopped, showNextStep: false },
    ]
  }, [filtered])

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  if (loading && rows.length === 0) {
    return (
      <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
        <DirectoryListSkeleton />
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '880px', margin: '0 auto', padding: '28px 24px' }}>
      {loadError && (
        <div style={{ marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', background: 'rgba(231,76,60,0.1)', color: '#e74c3c', border: '1px solid rgba(231,76,60,0.3)' }}>{loadError}</div>
      )}

      <ListHeader title="Tax Planning" count={filtered.length} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by client, ref, or name..." style={inputStyle} onChange={e => setSearch(e.target.value)} value={search} />
        {others.length > 0 && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setFilterOpen(o => !o)}
              style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: filterActive ? 'rgba(18,94,204,0.1)' : 'var(--vfo-input)', color: filterActive ? '#125ecc' : 'var(--vfo-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {isTeamMember ? 'Tax Planners' : 'Group'}{filterActive ? ` (${included.length})` : ''}
              <span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
            </button>
            {filterOpen && (
              <>
                <div onClick={() => setFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '6px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '220px', zIndex: 200, padding: '8px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)', maxHeight: '380px', overflowY: 'auto' }}>
                  <div style={{ padding: '6px 14px 10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{isTeamMember ? 'Show clients by planner' : 'Include group clients'}</div>
                    {others.map(g => (
                      <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={included.includes(g.id)} onChange={() => toggleInclude(g.id)} style={{ accentColor: '#125ecc', cursor: 'pointer' }} />
                        Include {g.name}'s clients{g.planner_role === 'Team Member' ? ' — Team Member' : ''}
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div>
        {sections.filter(s => s.rows.length > 0).map(section => (
          <div key={section.key} style={{ marginBottom: '18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px 4px' }}>
              {section.label} ({section.rows.length})
            </div>
            {section.rows.map(row => (
              <div key={row.tax_plan_id}
                onClick={() => navigate(`/tax-planner/client/${row.client_id}?program=${row.program_id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 16px', marginBottom: '6px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', boxShadow: '0 2px 8px rgba(20,45,95,0.04)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(0,149,255,0.4)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--vfo-border-soft)'}>
                <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12.5px', color: 'var(--vfo-muted)', width: '90px', flexShrink: 0 }}>{row.client_ref}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: '160px', flexShrink: 0 }}>
                  <span style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{row.client_name || '—'}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{row.member_name || '—'}</span>
                </span>
                {/* Next step is an Active-only column: on a finished or stopped
                    plan there is nothing owed, so the slot collapses rather than
                    printing a stale instruction. */}
                {section.showNextStep && (
                  <span title={row.next_step || ''} style={{ flex: 1, minWidth: 0, fontSize: '12px', color: row.next_step ? 'var(--vfo-muted)' : 'var(--vfo-faint)', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.next_step || '—'}</span>
                )}
                <span style={{ marginLeft: section.showNextStep ? 0 : 'auto', flexShrink: 0, fontSize: '12px', color: 'var(--vfo-faint)', whiteSpace: 'nowrap' }}>{row.planner_name || '—'}</span>
                {/* When the VFO team sent the client over — the team-member
                    allocation date, shown to team member and planner alike. */}
                <span title="Date this client was assigned" style={{ flexShrink: 0, width: '78px', textAlign: 'right', fontSize: '12px', color: row.assigned_at ? 'var(--vfo-muted)' : 'var(--vfo-faint)', whiteSpace: 'nowrap' }}>
                  {row.assigned_at ? new Date(row.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </span>
              </div>
            ))}
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
