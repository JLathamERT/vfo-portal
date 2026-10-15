import { useState } from 'react'

// Reusable multi-select filter dropdown for admin lists. `groups` is an array of
// { key, label, options: string[], get: item => string }. `value` is
// { [key]: string[] }. An item matches a group when that group's selection is
// empty (no filter) OR includes the item's value. The caller's initial `value`
// sets the default (e.g. { status: ['Active'] }); "All" = untick everything in a
// group.
export default function ListFilterButton({ groups, value, onChange }) {
  const [open, setOpen] = useState(false)
  const total = groups.reduce((n, g) => n + (value[g.key]?.length || 0), 0)
  // Say what's filtering rather than a cryptic count: one selection reads
  // "Status: Active"; several read "Filters (N)".
  const selected = groups.flatMap(g => (value[g.key] || []).map(v => ({ group: g.label, opt: v })))
  const label = selected.length === 0 ? 'Filter'
    : selected.length === 1 ? `${selected[0].group}: ${selected[0].opt}`
    : `Filters (${selected.length})`
  function toggle(key, opt) {
    const cur = value[key] || []
    onChange({ ...value, [key]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] })
  }
  const btnStyle = { padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: total > 0 ? 'rgba(18,94,204,0.1)' : 'var(--vfo-input)', color: total > 0 ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px' }
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setOpen(o => !o)} style={btnStyle}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '6px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '220px', zIndex: 200, padding: '8px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)', maxHeight: '380px', overflowY: 'auto' }}>
            {groups.map(g => (
              <div key={g.key} style={{ padding: '6px 14px 10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{g.label}</div>
                {g.options.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={(value[g.key] || []).includes(opt)} onChange={() => toggle(g.key, opt)} style={{ accentColor: 'var(--vfo-primary)', cursor: 'pointer' }} />
                    {opt}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// An item passes when every group is either unselected (no filter) or includes
// the item's value for that group. `get` may return a single value (scalar) or
// an array of values (e.g. a specialist's ecosystems) — for an array, the item
// matches when ANY of its values is selected.
export function matchesFilter(item, groups, value) {
  return groups.every(g => {
    const sel = value[g.key] || []
    if (sel.length === 0) return true
    const got = g.get(item)
    return Array.isArray(got) ? got.some(v => sel.includes(v)) : sel.includes(got)
  })
}

// Sort a list by join_date. 'newest' = most recent first, 'oldest' = earliest
// first, anything else leaves the original order. Items with no join_date sort last.
export function sortByJoin(arr, sortBy) {
  if (sortBy !== 'newest' && sortBy !== 'oldest') return arr
  return [...arr].sort((a, b) => {
    const da = a.join_date || '', db = b.join_date || ''
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return sortBy === 'newest' ? db.localeCompare(da) : da.localeCompare(db)
  })
}

// Richer sort for the member directories (advisors / accountants / strategic):
// by member number (low/high), join date (oldest/newest), or name (A→Z / Z→A).
// Member numbers are usually integers but corporate ones look like "<parent>-C<n>";
// we sort on the leading integer, breaking ties (and non-numeric values) with a
// string compare. Items with no join_date sort last in the date modes.
export const MEMBER_SORT_OPTIONS = [
  { value: 'number_asc', label: 'Member #: Low to High' },
  { value: 'number_desc', label: 'Member #: High to Low' },
  { value: 'date_oldest', label: 'Join date: Oldest' },
  { value: 'date_newest', label: 'Join date: Newest' },
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
]

export function sortMembers(arr, sortBy) {
  const list = [...arr]
  const numKey = (m) => String(m.plugin_member_number ?? m.member_number ?? '')
  const numOf = (m) => { const n = parseInt(numKey(m), 10); return Number.isNaN(n) ? Infinity : n }
  const nameOf = (m) => (m.name || '').toLowerCase()
  const byNumber = (a, b) => (numOf(a) - numOf(b)) || numKey(a).localeCompare(numKey(b))
  const byDate = (a, b, dir) => {
    const da = a.join_date || '', db = b.join_date || ''
    if (!da && !db) return 0
    if (!da) return 1
    if (!db) return -1
    return dir === 'newest' ? db.localeCompare(da) : da.localeCompare(db)
  }
  switch (sortBy) {
    case 'number_desc': return list.sort((a, b) => byNumber(b, a))
    case 'date_oldest': return list.sort((a, b) => byDate(a, b, 'oldest'))
    case 'date_newest': return list.sort((a, b) => byDate(a, b, 'newest'))
    case 'az': return list.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    case 'za': return list.sort((a, b) => nameOf(b).localeCompare(nameOf(a)))
    case 'number_asc':
    default: return list.sort(byNumber)
  }
}

// --- Click-to-sort column headers --------------------------------------------
// Header-driven sort for the admin overview tables. A column is described by
// { get, type }: `get(item)` returns the raw sort value; `type` is 'text'
// (case-insensitive alphabetical — the default), 'number', or 'date' (ISO /
// 'YYYY-MM-DD' strings, compared lexically = chronologically). null / empty
// values ALWAYS sort last, regardless of direction.
//
// `useHeaderSort()` holds the { key, dir } state. First click on a column sorts
// ascending, a second click flips to descending, clicking a different column
// switches to it ascending. `reset()` clears the sort (falls back to the
// caller's default ordering); the overview panels call it when the dropdown sort
// changes so the two controls never fight.
export function useHeaderSort() {
  const [sort, setSort] = useState(null)   // { key, dir } | null
  const onSort = (key) => setSort(s => (
    s && s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
  ))
  const reset = () => setSort(null)
  return { sort, onSort, reset }
}

const isEmptySortValue = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v))

// Sort a copy of `arr` by the active header `sort` using `columns[key]`. With no
// active sort (or an unknown key) the input order is returned untouched, so the
// caller's default ordering is preserved until a header is clicked.
export function sortByColumn(arr, sort, columns) {
  if (!sort || !columns[sort.key]) return arr
  const { get, type = 'text' } = columns[sort.key]
  const dir = sort.dir === 'desc' ? -1 : 1
  const cmp = (a, b) => {
    if (type === 'number') return a - b
    if (type === 'date') return String(a).localeCompare(String(b))   // ISO strings sort chronologically
    return String(a).toLowerCase().localeCompare(String(b).toLowerCase())
  }
  return [...arr].sort((x, y) => {
    const av = get(x), bv = get(y)
    const ae = isEmptySortValue(av), be = isEmptySortValue(bv)
    if (ae && be) return 0
    if (ae) return 1        // empties always last
    if (be) return -1
    return dir * cmp(av, bv)
  })
}

// A clickable, sort-aware column-header cell. Every sortable column advertises
// itself with a faint updown glyph; hovering highlights the header, and the
// active column shows its label + direction arrow in blue. Drop-in replacement
// for a plain header <span>; inherits the header row's font.
export function SortHeader({ label, sortKey, sort, onSort, style }) {
  const active = sort?.key === sortKey
  const BLUE = 'var(--vfo-accent-text)'
  return (
    <span onClick={() => onSort(sortKey)} title={`Sort by ${label}`}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = BLUE }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = '' }}
      style={{ cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', color: active ? BLUE : undefined, transition: 'color 0.12s', ...style }}>
      {label}
      {active
        ? <span style={{ fontSize: '8px', lineHeight: 1, color: BLUE }}>{sort.dir === 'desc' ? '▼' : '▲'}</span>
        : <span aria-hidden style={{ fontSize: '9px', lineHeight: 1, opacity: 0.45 }}>↕</span>}
    </span>
  )
}

// Small sort dropdown for the admin lists. Defaults to the join-date options
// (used by the specialist list); the member directories pass MEMBER_SORT_OPTIONS.
const DEFAULT_SORT_OPTIONS = [
  { value: 'default', label: 'Sort: Default' },
  { value: 'newest', label: 'Join date: Newest' },
  { value: 'oldest', label: 'Join date: Oldest' },
]
export function SortSelect({ value, onChange, options = DEFAULT_SORT_OPTIONS }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-muted)', fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
