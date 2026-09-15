import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'
import ListFilterButton, { matchesFilter, sortMembers, SortSelect, MEMBER_SORT_OPTIONS, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'

// Member Overview — one unified list of every member (advisor / accountant /
// strategic) with at-a-glance columns, an expandable client drill-down, a
// saveable engagement level, and rich filtering. Styled to match the Accounting
// panels (navy/blue grid table + Totals row).

// Exported because the member profile hero in MembersPanel renders the same
// value as a pill — one list, one set of labels and colours, so a rename here
// cannot leave the two surfaces disagreeing about what a stored value means.
export const ENGAGEMENT = [
  { value: 'highly_engaged', label: 'Highly engaged', color: '#1b9254' },
  { value: 'reasonably_engaged', label: 'Reasonably engaged', color: '#f1c40f' },
  { value: 'somewhat_engaged', label: 'Somewhat engaged', color: '#e67e22' },
  { value: 'disengaged', label: 'Disengaged', color: '#e74c3c' },
]

// Member types that never belong in the overview (free / historic / survey /
// team tiers).
const EXCLUDED_TYPES = new Set([
  'VFO Reconciliation (Free)', 'FAC Historic', 'Financial Collaborator',
  'Free Legacy TBM', 'Survey #1', 'Survey #2', 'Survey #3', 'Team Member',
])
const ENGAGEMENT_LABELS = ENGAGEMENT.map(e => e.label)
export const engagementMeta = (v) => ENGAGEMENT.find(e => e.value === v) || null
const engMeta = engagementMeta

function catLabel(m) {
  if (m.member_category === 'accountant') return 'Accountant'
  if (m.member_category === 'strategic_member') return 'Strategic'
  return 'Advisor'
}
const CAT_COLORS = { Advisor: '#0a85e8', Accountant: '#7b52d6', Strategic: '#e0771a' }

const GRID = '30px 84px 1.5fr 100px 1.1fr 96px 128px 110px 70px 1.3fr 176px'

const CLIENT_GRID = '120px 1.4fr 96px 110px 130px 1.6fr'

// Client status pill — capitalized + color-coded, matching the member status pills.
function clientStatusColors(status) {
  const s = (status || '').toLowerCase()
  if (s === 'active') return { bg: 'rgba(27,146,84,0.13)', color: '#1b9254' }
  if (s === 'lost') return { bg: 'rgba(231,76,60,0.13)', color: '#e74c3c' }
  if (s === 'pending') return { bg: 'rgba(224,103,23,0.14)', color: '#e06717' }
  return { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)' }   // removed / unknown
}
const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

export default function MemberOverviewPanel({ allMembers = [], onOpenMember, onPatchMember }) {
  const navigate = useNavigate()
  const [relations, setRelations] = useState({ programsByMember: {}, clientsByMember: {} })
  const [relLoading, setRelLoading] = useState(true)
  const [relError, setRelError] = useState('')
  const [expanded, setExpanded] = useState({})            // member_number -> bool
  const [engOverrides, setEngOverrides] = useState({})    // member_number -> value (optimistic)
  const [saving, setSaving] = useState({})                // member_number -> bool
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState({ status: ['Active'] })
  const [listSort, setListSort] = useState('number_asc')
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort()

  useEffect(() => {
    let alive = true
    setRelLoading(true)
    callApi('member_overview_relations')
      .then(res => { if (alive) { setRelations({ programsByMember: res.programsByMember || {}, clientsByMember: res.clientsByMember || {} }); setRelError('') } })
      .catch(err => { if (alive) setRelError(err.message) })
      .finally(() => { if (alive) setRelLoading(false) })
    return () => { alive = false }
  }, [])

  const { programsByMember, clientsByMember } = relations
  const engOf = (m) => (m.plugin_member_number in engOverrides ? engOverrides[m.plugin_member_number] : (m.engagement_level || ''))

  // Base pool: exclude the free / historic / survey / team member types entirely.
  const basePool = useMemo(() => allMembers.filter(m => !EXCLUDED_TYPES.has(m.member_type)), [allMembers])

  // Filter option pools (derived from the data present).
  const typeOptions = useMemo(() => [...new Set(basePool.map(m => m.member_type).filter(Boolean))].sort(), [basePool])
  const programOptions = useMemo(() => {
    const s = new Set()
    Object.values(programsByMember).forEach(list => (list || []).forEach(p => s.add(p)))
    return [...s].sort()
  }, [programsByMember])

  const filterGroups = [
    { key: 'category', label: 'Category', options: ['Advisor', 'Accountant', 'Strategic'], get: m => catLabel(m) },
    { key: 'status', label: 'Status', options: ['Active', 'Lost', 'Removed'], get: m => m.elite_status || 'Active' },
    { key: 'standing', label: 'Standing', options: ['Suspended', 'Paused', 'In Arrears'], get: m => { const f = []; if (m.suspended) f.push('Suspended'); if (m.paused) f.push('Paused'); if (m.membership_arrears) f.push('In Arrears'); return f } },
    ...(typeOptions.length ? [{ key: 'type', label: 'Member Type', options: typeOptions, get: m => m.member_type || '' }] : []),
    ...(programOptions.length ? [{ key: 'programs', label: 'Programs', options: programOptions, get: m => programsByMember[m.plugin_member_number] || [] }] : []),
    { key: 'engagement', label: 'Engagement', options: ENGAGEMENT_LABELS, get: m => { const meta = engMeta(engOf(m)); return meta ? meta.label : '(none)' } },
  ]

  const q = search.trim().toLowerCase()
  const searched = q ? basePool.filter(m => m.name?.toLowerCase().includes(q) || m.plugin_member_number?.toLowerCase().includes(q)) : basePool
  const filtered = searched.filter(m => matchesFilter(m, filterGroups, listFilter))
  // Baseline = the dropdown ordering; a clicked column header overrides it.
  const sortColumns = {
    number: { type: 'number', get: m => { const n = parseInt(String(m.plugin_member_number ?? ''), 10); return Number.isNaN(n) ? null : n } },
    name: { type: 'text', get: m => m.name },
    category: { type: 'text', get: m => catLabel(m) },
    type: { type: 'text', get: m => m.member_type },
    joined: { type: 'date', get: m => (m.join_date ? String(m.join_date).slice(0, 10) : null) },
    status: { type: 'text', get: m => m.elite_status || 'Active' },
    msm: { type: 'text', get: m => m.assigned_msm },
    clients: { type: 'number', get: m => (clientsByMember[m.plugin_member_number] || []).length },
    programs: { type: 'text', get: m => (programsByMember[m.plugin_member_number] || []).join(', ') },
    engagement: { type: 'number', get: m => { const i = ENGAGEMENT.findIndex(e => e.value === engOf(m)); return i < 0 ? null : i } },
  }
  const rows = sortByColumn(sortMembers(filtered, listSort), colSort, sortColumns)

  async function saveEngagement(m, value) {
    const mn = m.plugin_member_number
    const prev = engOf(m)
    setEngOverrides(o => ({ ...o, [mn]: value }))
    setSaving(s => ({ ...s, [mn]: true }))
    try {
      await callApi('member_save_engagement', { member_number: mn, engagement_level: value || null })
      // The write lands, but `allMembers` is loaded ONCE by AdminPortal and never
      // re-read on a tab switch — so without this the panel unmounts, engOverrides
      // dies with it, and coming back renders the stale pre-save payload as if the
      // save had failed. Patch the row the portal is actually holding; MembersPanel's
      // own allMembers→selectedMember sync effect then carries it to the profile hero.
      if (onPatchMember) onPatchMember(mn, { engagement_level: value || null })
    } catch (err) {
      setEngOverrides(o => ({ ...o, [mn]: prev }))
      alert('Could not save engagement level: ' + err.message)
    } finally {
      setSaving(s => { const n = { ...s }; delete n[mn]; return n })
    }
  }

  const wrap = { padding: '24px', maxWidth: '1500px', margin: '0 auto' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  return (
    <div style={wrap}>
      <div style={{ marginBottom: '18px' }}>
        <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Members</p>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '4px 0 0' }}>Member Overview</h2>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by name or number..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: 1, minWidth: '240px', background: 'var(--vfo-input)' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={MEMBER_SORT_OPTIONS} />
      </div>

      {relError && <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>Could not load programs/clients: {relError}</div>}

      <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: '1320px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span />
            <SortHeader label="Member #" sortKey="number" sort={colSort} onSort={onSort} />
            <SortHeader label="Name" sortKey="name" sort={colSort} onSort={onSort} />
            <SortHeader label="Category" sortKey="category" sort={colSort} onSort={onSort} />
            <SortHeader label="Type" sortKey="type" sort={colSort} onSort={onSort} />
            <SortHeader label="Joined" sortKey="joined" sort={colSort} onSort={onSort} />
            <SortHeader label="Status" sortKey="status" sort={colSort} onSort={onSort} />
            <SortHeader label="MSM" sortKey="msm" sort={colSort} onSort={onSort} />
            <SortHeader label="Clients" sortKey="clients" sort={colSort} onSort={onSort} />
            <SortHeader label="Programs" sortKey="programs" sort={colSort} onSort={onSort} />
            <SortHeader label="Engagement" sortKey="engagement" sort={colSort} onSort={onSort} />
          </div>

          {/* Rows */}
          {rows.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>No members match the current filters.</div>
          )}
          {rows.map(m => {
            const mn = m.plugin_member_number
            const cat = catLabel(m)
            const isOpen = !!expanded[mn]
            const programs = programsByMember[mn] || []
            const clients = clientsByMember[mn] || []
            const engVal = engOf(m)
            const eMeta = engMeta(engVal)
            return (
              <div key={mn}>
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                  <button
                    onClick={() => setExpanded(e => ({ ...e, [mn]: !e[mn] }))}
                    title={isOpen ? 'Hide clients' : `Show clients (${clients.length})`}
                    style={{ width: '24px', height: '24px', border: '1px solid var(--vfo-border-strong)', background: isOpen ? 'var(--vfo-tint)' : 'var(--vfo-card)', borderRadius: '6px', cursor: 'pointer', color: 'var(--vfo-muted)', fontSize: '11px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isOpen ? '▾' : '▸'}
                  </button>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--vfo-muted)' }}>{mn}</span>
                  <span onClick={() => onOpenMember && onOpenMember(m)} style={{ fontWeight: 600, color: '#125ecc', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                    onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>{m.name || '—'}</span>
                  <span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', color: CAT_COLORS[cat], background: `${CAT_COLORS[cat]}1f` }}>{cat}</span>
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{m.member_type || '—'}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--vfo-muted)' }}>{m.join_date ? String(m.join_date).slice(0, 10) : '—'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', fontWeight: 600, background: m.elite_status === 'Active' ? 'rgba(27,146,84,0.13)' : m.elite_status === 'Lost' ? 'rgba(231,76,60,0.13)' : 'var(--vfo-tint)', color: m.elite_status === 'Active' ? '#1b9254' : m.elite_status === 'Lost' ? '#e74c3c' : 'var(--vfo-muted)' }}>{m.elite_status || 'Active'}</span>
                    {m.suspended && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', fontWeight: 700, background: 'rgba(231,76,60,0.13)', color: '#e74c3c' }}>SUSP</span>}
                    {m.paused && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', fontWeight: 700, background: 'rgba(224,103,23,0.14)', color: '#e06717' }}>PAUSE</span>}
                    {m.membership_arrears && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', fontWeight: 700, background: 'rgba(180,83,9,0.14)', color: '#b45309' }}>ARREARS</span>}
                  </span>
                  <span style={{ fontSize: '12px', color: m.assigned_msm ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{m.assigned_msm || '—'}</span>
                  <span>
                    <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', color: clients.length ? '#125ecc' : 'var(--vfo-faint)', background: clients.length ? 'rgba(18,94,204,0.1)' : 'var(--vfo-border-soft)' }}>{clients.length}</span>
                  </span>
                  <span style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {programs.length === 0 ? <span style={{ color: 'var(--vfo-faint)' }}>—</span> : programs.map(p => (
                      <span key={p} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'var(--vfo-tint)', color: '#3a5488', fontWeight: 600 }}>{p}</span>
                    ))}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: eMeta ? eMeta.color : '#d3dbe8' }} />
                    <select value={engVal} disabled={!!saving[mn]} onChange={e => saveEngagement(m, e.target.value)}
                      style={{ flex: 1, padding: '5px 6px', borderRadius: '7px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '12px', color: eMeta ? 'var(--vfo-ink)' : 'var(--vfo-faint)', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
                      <option value="">— Not set —</option>
                      {ENGAGEMENT.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                    </select>
                  </span>
                </div>

                {isOpen && (
                  <div style={{ padding: '4px 18px 14px 52px', borderBottom: '1px solid var(--vfo-border-soft)', background: 'var(--vfo-input)' }}>
                    {relLoading ? (
                      <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', padding: '8px 0' }}>Loading clients…</div>
                    ) : clients.length === 0 ? (
                      <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', padding: '8px 0' }}>No clients attached.</div>
                    ) : (
                      <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '10px', overflow: 'hidden', minWidth: '860px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: CLIENT_GRID, gap: '10px', padding: '8px 14px', background: 'var(--vfo-input)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--vfo-muted)' }}>
                          <span>Client Ref</span>
                          <span>Name</span>
                          <span>Joined</span>
                          <span>Status</span>
                          <span>PF</span>
                          <span>Programs</span>
                        </div>
                        {clients.map(c => (
                          <div key={c.id}
                            style={{ display: 'grid', gridTemplateColumns: CLIENT_GRID, gap: '10px', padding: '9px 14px', borderTop: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '12.5px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{c.ref || '—'}</span>
                            <span style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{c.name}</span>
                            <span style={{ fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{c.joined ? String(c.joined).slice(0, 10) : '—'}</span>
                            <span>
                              {c.status
                                ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, ...(() => { const s = clientStatusColors(c.status); return { background: s.bg, color: s.color } })() }}>{capitalize(c.status)}</span>
                                : <span style={{ color: 'var(--vfo-faint)' }}>—</span>}
                            </span>
                            <span style={{ fontSize: '12px', color: c.pf ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{c.pf || '—'}</span>
                            <span style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                              {(c.programs || []).length === 0 ? <span style={{ color: 'var(--vfo-faint)' }}>No programs</span> : c.programs.map(p => (
                                <span key={p.id}
                                  onClick={ev => { ev.stopPropagation(); navigate(`/admin/client/${c.id}?program=${p.id}`) }}
                                  title={`Open ${c.name} — ${p.name}`}
                                  style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '6px', background: 'var(--vfo-tint)', color: '#3a5488', fontWeight: 600, cursor: 'pointer' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--vfo-tint)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--vfo-tint)' }}>{p.name}</span>
                              ))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
