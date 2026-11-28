import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'
import ListFilterButton, { matchesFilter, sortMembers, SortSelect, MEMBER_SORT_OPTIONS } from './ListFilterButton'
import { formatDate } from '../../lib/dates'
import ListTable, { ListName, ListText, listSearchStyle } from '../shared/ListTable'
import ExpandChevron from '../shared/ExpandChevron'
import { ClientNameLink, clientPagePath, planTabFor } from '../shared/personLinks'
import Tag from '../shared/Tag'
import { STANDING_COLORS, statusColor } from '../shared/statusColors'
import { clientStatusColors, clientStatusLabel } from '../shared/clientStatus'
import { TableSkeleton } from '../shared/Skeleton'
import { PageHeading } from '../shared/ProfileKit'

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
// team tiers). Financial Collaborator came out 2026-10-30 (portal licensing L6b,
// decision 99: they pay monthly now) — the backend's public-member-directory.ts
// list changed with it.
const EXCLUDED_TYPES = new Set([
  'VFO Reconciliation (Free)', 'FAC Historic',
  'Free Legacy TBM', 'Survey #1', 'Survey #2', 'Survey #3', 'Team Member',
])
const ENGAGEMENT_LABELS = ENGAGEMENT.map(e => e.label)
// Filter-only label for a member with no `assigned_msm`. It is a sentinel, not a
// stored value — nothing writes it and the table column still renders an em dash.
const UNASSIGNED_MSM = 'Unassigned'
export const engagementMeta = (v) => ENGAGEMENT.find(e => e.value === v) || null
const engMeta = engagementMeta

function catLabel(m) {
  if (m.member_category === 'accountant') return 'Accountant'
  if (m.member_category === 'strategic_member') return 'Strategic'
  return 'Advisor'
}

const CLIENT_GRID = '120px 1.6fr 120px 1fr 100px'
const CLIENT_TABLE_WIDTH = '820px'

export default function MemberOverviewPanel({ allMembers = [], onOpenMember, onPatchMember }) {
  const [relations, setRelations] = useState({ programsByMember: {}, clientsByMember: {} })
  const [relLoading, setRelLoading] = useState(true)
  const [relError, setRelError] = useState('')
  const [expanded, setExpanded] = useState({})            // member_number -> bool
  const [engOverrides, setEngOverrides] = useState({})    // member_number -> value (optimistic)
  const [saving, setSaving] = useState({})                // member_number -> bool
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState({ status: ['Active'] })
  const [listSort, setListSort] = useState('az')

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
  // Derived from the data present, like every other option pool here — there is
  // no MSM roster in this payload, and `assigned_msm` is free text on the member.
  // UNASSIGNED is a real option rather than an absence, because "who does nobody
  // own?" is the question this list gets asked most: the names sort first, then
  // the catch-all. `UNASSIGNED_MSM` is a sentinel the getter maps to, so a member
  // whose MSM really were the literal string would collide — no such MSM exists,
  // and a bare '' cannot be used because matchesFilter treats it as no selection.
  const msmOptions = useMemo(() => {
    const named = [...new Set(basePool.map(m => (m.assigned_msm || '').trim()).filter(Boolean))].sort()
    const hasUnassigned = basePool.some(m => !(m.assigned_msm || '').trim())
    return hasUnassigned ? [...named, UNASSIGNED_MSM] : named
  }, [basePool])

  const filterGroups = [
    { key: 'category', label: 'Category', options: ['Advisor', 'Accountant', 'Strategic'], get: m => catLabel(m) },
    { key: 'status', label: 'Status', options: ['Active', 'Lost', 'Removed'], get: m => m.elite_status || 'Active' },
    { key: 'standing', label: 'Standing', options: ['Suspended', 'Paused', 'In Arrears'], get: m => { const f = []; if (m.suspended) f.push('Suspended'); if (m.paused) f.push('Paused'); if (m.membership_arrears) f.push('In Arrears'); return f } },
    ...(typeOptions.length ? [{ key: 'type', label: 'Member Type', options: typeOptions, get: m => m.member_type || '' }] : []),
    ...(programOptions.length ? [{ key: 'programs', label: 'Programs', options: programOptions, get: m => programsByMember[m.plugin_member_number] || [] }] : []),
    ...(msmOptions.length ? [{ key: 'msm', label: 'MSM', options: msmOptions, get: m => (m.assigned_msm || '').trim() || UNASSIGNED_MSM }] : []),
    { key: 'engagement', label: 'Engagement', options: ENGAGEMENT_LABELS, get: m => { const meta = engMeta(engOf(m)); return meta ? meta.label : '(none)' } },
  ]

  const q = search.trim().toLowerCase()
  const searched = q ? basePool.filter(m => m.name?.toLowerCase().includes(q) || m.plugin_member_number?.toLowerCase().includes(q)) : basePool
  const filtered = searched.filter(m => matchesFilter(m, filterGroups, listFilter))
  // Baseline = the dropdown ordering; a clicked column header re-sorts on top (ListTable).
  const rows = sortMembers(filtered, listSort)
  // Who they are, where they stand, who looks after them, then their book (Jake
  // 2026-11-28). Category is plain words; status and standing are tags.
  const standingOf = m => [m.suspended && 'Suspended', m.paused && 'Paused', m.membership_arrears && 'In Arrears'].filter(Boolean)
  const columns = [
    { key: 'number', label: 'Member #', width: '84px', type: 'number', get: m => { const n = parseInt(String(m.plugin_member_number ?? ''), 10); return Number.isNaN(n) ? null : n },
      render: m => <ListText mono style={{ color: 'var(--vfo-muted)' }}>{m.plugin_member_number}</ListText> },
    { key: 'name', label: 'Name', width: '1.6fr', get: m => m.name, render: m => <ListName>{m.name}</ListName> },
    { key: 'category', label: 'Category', width: '110px', get: m => catLabel(m), render: m => <ListText>{catLabel(m)}</ListText> },
    { key: 'type', label: 'Type', width: '1.2fr', get: m => m.member_type, render: m => <ListText style={{ color: 'var(--vfo-muted)' }}>{m.member_type}</ListText> },
    { key: 'status', label: 'Status', width: '110px', get: m => m.elite_status || 'Active', render: m => {
      const s = m.elite_status || 'Active'
      return <Tag color={statusColor(s, '#8a9bbd')}>{s}</Tag>
    } },
    { key: 'standing', label: 'Standing', width: '150px', get: m => standingOf(m).join(', ') || null, render: m => {
      const flags = standingOf(m)
      if (!flags.length) return <ListText />
      return <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>{flags.map(f => <Tag key={f} color={STANDING_COLORS[f]}>{f}</Tag>)}</span>
    } },
    { key: 'msm', label: 'MSM', width: '1fr', get: m => m.assigned_msm, render: m => <ListText>{m.assigned_msm}</ListText> },
    { key: 'engagement', label: 'Engagement', width: '180px', type: 'number', stop: true, get: m => { const i = ENGAGEMENT.findIndex(e => e.value === engOf(m)); return i < 0 ? null : i }, render: m => {
      const mn = m.plugin_member_number
      const engVal = engOf(m)
      const eMeta = engMeta(engVal)
      return (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: eMeta ? eMeta.color : '#d3dbe8' }} />
          <select value={engVal} disabled={!!saving[mn]} onChange={e => saveEngagement(m, e.target.value)}
            style={{ flex: 1, padding: '5px 6px', borderRadius: '7px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '12px', color: eMeta ? 'var(--vfo-ink)' : 'var(--vfo-faint)', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
            <option value="">— Not set —</option>
            {ENGAGEMENT.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </span>
      )
    } },
    // The count opens the member's clients under the row (Jake 2026-11-28: the ▼ sits
    // with the count it opens, not before the name).
    { key: 'clients', label: 'Clients', width: '90px', type: 'number', stop: true, get: m => (clientsByMember[m.plugin_member_number] || []).length, render: m => {
      const mn = m.plugin_member_number
      const n = (clientsByMember[mn] || []).length
      const isOpen = !!expanded[mn]
      // A plain number, not a pill (Jake 2026-11-28: every row has one, so it is not a tag).
      const pill = <span style={{ fontSize: '13px', color: n ? 'var(--vfo-ink)' : 'var(--vfo-faint)', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
      if (!n) return pill
      return (
        <span onClick={() => setExpanded(e => ({ ...e, [mn]: !e[mn] }))} title={isOpen ? 'Hide clients' : `Show clients (${n})`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}>
          {pill}
          <ExpandChevron open={isOpen} style={{ width: '20px', height: '20px' }} />
        </span>
      )
    } },
    { key: 'joined', label: 'Joined', width: '110px', type: 'date', get: m => (m.join_date ? String(m.join_date).slice(0, 10) : null),
      render: m => <ListText mono style={{ color: 'var(--vfo-muted)' }}>{m.join_date ? formatDate(m.join_date) : ''}</ListText> },
  ]

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

  return (
    <div style={wrap}>
      {/* The count is of the list as RENDERED, so it moves with the search box
          and every filter. `of N` appears only once something is narrowing it,
          which is what makes the bare number unambiguous the rest of the time. */}
      <PageHeading eyebrow="Members" title={<>
        Member Overview
        <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: 0, color: 'var(--vfo-ink-2)', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-mid)', borderRadius: '999px', padding: '3px 12px', whiteSpace: 'nowrap', marginLeft: '12px', verticalAlign: 'middle' }}>
          {rows.length}{rows.length === basePool.length ? '' : ` of ${basePool.length}`} member{rows.length === 1 ? '' : 's'}
        </span>
      </>} />

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by name or number..." value={search} onChange={e => setSearch(e.target.value)} style={listSearchStyle} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={setListSort} options={MEMBER_SORT_OPTIONS} />
      </div>

      {relError && <div style={{ padding: '10px 14px', marginBottom: '12px', background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: '8px', color: '#c0392b', fontSize: '13px' }}>Could not load programs/clients: {relError}</div>}

      <ListTable
        columns={columns}
        rows={rows}
        rowKey={m => m.plugin_member_number}
        onRowClick={m => onOpenMember && onOpenMember(m)}
        resetSortOn={listSort}
        minWidth="1320px"
        empty="No members match the current filters."
        renderExpanded={m => (expanded[m.plugin_member_number] ? <MemberClients clients={clientsByMember[m.plugin_member_number] || []} loading={relLoading} /> : null)}
      />
    </div>
  )
}

// A member's clients, under their opened row. A client's NAME opens the client's
// profile and the ROW opens the plan (#632, Client Overview's rule). No programs
// column; the order follows the member table: ref, name, status, PF, joined
// (Jake 2026-11-28).
function MemberClients({ clients, loading }) {
  const navigate = useNavigate()
  const openPlan = (c, p) => navigate(clientPagePath(c.id, { program: p?.id, tab: p ? planTabFor(p.name) : 'home' }))
  // Narrow on purpose (Jake 2026-11-28): five short columns, so no wide gaps.
  if (loading) return <div style={{ maxWidth: CLIENT_TABLE_WIDTH, margin: '0 auto' }}><TableSkeleton cols={CLIENT_GRID} rows={2} minWidth="640px" pad="9px 14px" /></div>
  if (clients.length === 0) return <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', padding: '8px 0' }}>No clients attached.</div>
  const columns = [
    { key: 'ref', label: 'Client Ref', width: '120px', get: c => c.ref, render: c => <ListText mono>{c.ref}</ListText> },
    { key: 'name', label: 'Name', width: '1.6fr', get: c => c.name, render: c => (
      <ClientNameLink clientId={c.id} program={(c.programs || [])[0]?.id} style={{ fontWeight: 600 }}>{c.name || '—'}</ClientNameLink>
    ) },
    { key: 'status', label: 'Status', width: '120px', get: c => clientStatusLabel(c.status), render: c => (c.status
      ? <span style={{ fontSize: '11px', padding: '2px 9px', borderRadius: '999px', fontWeight: 600, ...(() => { const s = clientStatusColors(c.status); return { background: s.bg, color: s.color, whiteSpace: 'nowrap' } })() }}>{clientStatusLabel(c.status)}</span>
      : <ListText />) },
    { key: 'pf', label: 'PF', width: '1fr', get: c => c.pf, render: c => <ListText>{c.pf}</ListText> },
    { key: 'joined', label: 'Joined', width: '100px', type: 'date', get: c => c.joined || null, render: c => <ListText mono style={{ color: 'var(--vfo-muted)' }}>{c.joined ? formatDate(c.joined) : ''}</ListText> },
  ]
  return (
    <div style={{ maxWidth: CLIENT_TABLE_WIDTH, margin: '0 auto' }}>
      <ListTable dense columns={columns} rows={clients} rowKey={c => c.id} minWidth="640px"
        onRowClick={c => openPlan(c, (c.programs || [])[0])} />
    </div>
  )
}
