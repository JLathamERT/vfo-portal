import { useState } from 'react'
import { downloadXlsx, exportFilename, exportHeading } from '../../lib/exportXlsx'
import { matchesFilter } from '../admin/ListFilterButton'

// Export opens a window: tick the columns wanted and put them in order (↑ / ↓),
// set the filters (pre-set to the list's own, so the default export is what is on
// screen), then Download. `rows` is the list as searched and sorted but BEFORE
// its filters; `filterGroups` / `filterValue` are the list's own filter groups and
// current selection. A column with `default: false` starts unticked. Group by
// (any of the filter groups) sorts the rows into groups, each under a bold heading
// row, in the group's option order (so MSM names first, Unassigned last), keeping
// the list order inside a group. Column picks + grouping are remembered per list
// in this browser.
const colKey = (c) => c.key || c.header
const storeKey = (title) => `vfo-export-cols:${title}`
const groupStoreKey = (title) => `vfo-export-group:${title}`
const groupValueOf = (g, r) => { const v = g.get(r); const s = Array.isArray(v) ? v.join(', ') : String(v ?? ''); return s.trim() || '(none)' }

// [{ label, rows }] in the group's option order; values not among the options
// (combinations, '(none)') follow alphabetically.
function groupRows(g, rows) {
  const buckets = new Map()
  rows.forEach(r => { const k = groupValueOf(g, r); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(r) })
  const rank = (k) => { const i = g.options.indexOf(k); return i === -1 ? g.options.length : i }
  return [...buckets.keys()].sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b)).map(label => ({ label, rows: buckets.get(label) }))
}

function initialColumns(title, columns) {
  let saved = null
  try { saved = JSON.parse(localStorage.getItem(storeKey(title)) || 'null') } catch { saved = null }
  const keys = columns.map(colKey)
  if (Array.isArray(saved) && saved.every(s => s && typeof s.key === 'string')) {
    const known = saved.filter(s => keys.includes(s.key))
    const added = columns.filter(c => !known.some(s => s.key === colKey(c))).map(c => ({ key: colKey(c), on: c.default !== false }))
    return [...known.map(s => ({ key: s.key, on: !!s.on })), ...added]
  }
  const on = columns.filter(c => c.default !== false), off = columns.filter(c => c.default === false)
  return [...on, ...off].map(c => ({ key: colKey(c), on: c.default !== false }))
}

export default function ExportButton({ title, columns, rows, filterGroups = [], filterValue = {} }) {
  const [open, setOpen] = useState(false)
  const [cols, setCols] = useState([])
  const [filter, setFilter] = useState({})
  const [groupBy, setGroupBy] = useState('')
  const pool = rows || []

  function openDialog() {
    setCols(initialColumns(title, columns))
    setFilter(filterValue || {})
    let g = ''
    try { g = localStorage.getItem(groupStoreKey(title)) || '' } catch { g = '' }
    setGroupBy(filterGroups.some(x => x.key === g) ? g : '')
    setOpen(true)
  }
  const matched = filterGroups.length ? pool.filter(r => matchesFilter(r, filterGroups, filter)) : pool
  const group = filterGroups.find(g => g.key === groupBy) || null
  const groups = group ? groupRows(group, matched) : null
  const chosen = cols.filter(c => c.on).map(c => columns.find(col => colKey(col) === c.key)).filter(Boolean)

  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= cols.length) return
    const next = [...cols]
    ;[next[i], next[j]] = [next[j], next[i]]
    setCols(next)
  }
  function toggleCol(i) { setCols(cols.map((c, k) => k === i ? { ...c, on: !c.on } : c)) }
  function toggleFilter(key, opt) {
    const cur = filter[key] || []
    setFilter({ ...filter, [key]: cur.includes(opt) ? cur.filter(x => x !== opt) : [...cur, opt] })
  }
  function download() {
    try { localStorage.setItem(storeKey(title), JSON.stringify(cols)); localStorage.setItem(groupStoreKey(title), groupBy) } catch { /* private window */ }
    const out = groups ? groups.flatMap(gr => [exportHeading(`${group.label}: ${gr.label} (${gr.rows.length})`), ...gr.rows]) : matched
    downloadXlsx(exportFilename(title), title, chosen, out)
    setOpen(false)
  }

  const count = pool.length
  const label = { fontSize: '11px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }
  const arrow = (disabled) => ({ width: '26px', height: '24px', borderRadius: '6px', border: '1px solid var(--vfo-border)', background: 'var(--vfo-input)', color: disabled ? 'var(--vfo-faint)' : 'var(--vfo-ink)', cursor: disabled ? 'default' : 'pointer', fontSize: '11px', lineHeight: 1, padding: 0 })
  const btn = (primary, disabled) => ({ padding: '9px 18px', borderRadius: '8px', border: primary ? 'none' : '1px solid var(--vfo-border-strong)', background: primary ? (disabled ? 'var(--vfo-border-strong)' : 'var(--vfo-primary)') : 'var(--vfo-card)', color: primary ? '#fff' : 'var(--vfo-ink)', fontSize: '13px', fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: disabled ? 'default' : 'pointer' })

  return (
    <>
      <button type="button" disabled={count === 0} onClick={openDialog}
        title={count ? 'Choose columns and filters, then download an Excel file' : 'Nothing to export'}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: count ? 'var(--vfo-ink)' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: count ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></svg>
        Export
      </button>
      {open && (
        <div onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,20,45,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '14px', width: '100%', maxWidth: '560px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(8,20,45,0.3)', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
            <div style={{ padding: '18px 22px 12px', fontSize: '17px', fontWeight: 700 }}>Export {title}</div>
            {filterGroups.length > 0 && (
              <div style={{ padding: '0 22px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ ...label, marginBottom: 0 }}>Group by</div>
                <select value={groupBy} onChange={e => setGroupBy(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}>
                  <option value="">No grouping</option>
                  {filterGroups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </div>
            )}
            <div style={{ padding: '0 22px', overflowY: 'auto', display: 'grid', gridTemplateColumns: filterGroups.length ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr', gap: '22px' }}>
              <div>
                <div style={label}>Columns, in order</div>
                {cols.map((c, i) => {
                  const col = columns.find(x => colKey(x) === c.key)
                  return (
                    <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
                      <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: c.on ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>
                        <input type="checkbox" checked={c.on} onChange={() => toggleCol(i)} style={{ accentColor: 'var(--vfo-primary)', cursor: 'pointer' }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col?.header}</span>
                      </label>
                      <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} style={arrow(i === 0)}>▲</button>
                      <button type="button" aria-label="Move down" disabled={i === cols.length - 1} onClick={() => move(i, 1)} style={arrow(i === cols.length - 1)}>▼</button>
                    </div>
                  )
                })}
              </div>
              {filterGroups.length > 0 && (
                <div>
                  {filterGroups.map(g => (
                    <div key={g.key} style={{ marginBottom: '14px' }}>
                      <div style={label}>{g.label}</div>
                      {g.options.map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontSize: '13px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={(filter[g.key] || []).includes(opt)} onChange={() => toggleFilter(g.key, opt)} style={{ accentColor: 'var(--vfo-primary)', cursor: 'pointer' }} />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ))}
                  <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Nothing ticked in a group = all of them.</div>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 22px 18px', display: 'flex', alignItems: 'center', gap: '10px', borderTop: '1px solid var(--vfo-border)', marginTop: '14px' }}>
              <div style={{ flex: 1, fontSize: '13px', color: 'var(--vfo-muted)' }}>{matched.length} row{matched.length === 1 ? '' : 's'}{groups ? ` in ${groups.length} group${groups.length === 1 ? '' : 's'}` : ''} · {chosen.length} column{chosen.length === 1 ? '' : 's'}</div>
              <button type="button" onClick={() => setOpen(false)} style={btn(false, false)}>Cancel</button>
              <button type="button" disabled={!matched.length || !chosen.length} onClick={download} style={btn(true, !matched.length || !chosen.length)}>Download</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
