import { useEffect } from 'react'
import { SortHeader, sortByColumn, useHeaderSort } from '../admin/ListFilterButton'
import { clickableRowStyle, rowHoverProps } from './rowHover'
import { statusPillStyle } from './statusColors'

// The one list look (2026-11-26, Jake): the Client Overview table. A card holding a
// header row of column names (click one to sort by it), then one row per item that
// lifts on hover and opens on click. Every directory list (Advisors, Accountants,
// Strategic Members, Specialists, Tax Planners, the planner portal's clients, the
// specialist onboarding list) draws through it, so they all read the same.
//
// columns: [{ key, label, width ('1fr', '120px'...), render(row),
//             get(row) -> value  (optional: makes the header sortable),
//             type ('text' | 'number' | 'date'), align ('right'),
//             stop (true: a click in this cell never opens the row, for a cell
//                   holding its own control - a select, a button) }]
// rows arrive already searched, filtered and sorted by the page's own Sort; a
// header click re-sorts on top of that, and `resetSortOn` (the page's Sort value)
// clears the header sort when it changes, as Client Overview does. A page that
// remembers the header sort passes its own `useHeaderSort()` as `headerSort`.
// `renderExpanded(row)` draws what an opened row shows under it (null = closed);
// `dense` is the smaller table used inside an opened row.
export default function ListTable({ columns, rows, rowKey, onRowClick, empty = 'Nothing matches the current filters.', minWidth, resetSortOn, headerSort, renderExpanded, dense = false, style }) {
  const own = useHeaderSort()
  const { sort, onSort, reset } = headerSort || own
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (resetSortOn !== undefined) reset() }, [resetSortOn])
  const sortable = Object.fromEntries(columns.filter(c => c.get).map(c => [c.key, { get: c.get, type: c.type }]))
  const shown = sortByColumn(rows, sort, sortable)
  const grid = columns.map(c => c.width || '1fr').join(' ')
  const pad = dense ? '14px' : '18px'
  const cellAlign = c => (c.align === 'right' ? { justifySelf: 'end', textAlign: 'right' } : null)

  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: dense ? '10px' : '14px', background: 'var(--vfo-card)', boxShadow: dense ? 'none' : 'var(--vfo-shadow-card)', ...style }}>
      <div style={{ minWidth }}>
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: dense ? `8px ${pad}` : `12px ${pad}`, background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
          {columns.map(c => c.get
            ? <SortHeader key={c.key} label={c.label} sortKey={c.key} sort={sort} onSort={onSort} style={cellAlign(c) || undefined} />
            : <span key={c.key} style={cellAlign(c) || undefined}>{c.label}</span>)}
        </div>
        {shown.length === 0 && (
          <div style={{ padding: dense ? `16px ${pad}` : `28px ${pad}`, textAlign: 'center', color: 'var(--vfo-faint)', fontSize: dense ? '12px' : '13px' }}>{empty}</div>
        )}
        {shown.map(row => {
          const expanded = renderExpanded ? renderExpanded(row) : null
          return (
            <div key={rowKey(row)}>
              <div onClick={e => onRowClick && onRowClick(row, e)} {...(onRowClick ? rowHoverProps : {})}
                style={{ ...(onRowClick ? clickableRowStyle : {}), display: 'grid', gridTemplateColumns: grid, gap: '10px', padding: dense ? `9px ${pad}` : `11px ${pad}`, borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: dense ? '12.5px' : '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                {columns.map(c => (
                  <span key={c.key} onClick={c.stop ? e => e.stopPropagation() : undefined}
                    style={{ minWidth: 0, ...cellAlign(c), ...(c.stop ? { cursor: 'default' } : null) }}>{c.render(row)}</span>
                ))}
              </div>
              {expanded && (
                <div style={{ padding: `4px ${pad} 14px 52px`, borderBottom: '1px solid var(--vfo-border-soft)', background: 'var(--vfo-input)' }}>{expanded}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// The name cell: the name in link blue, an optional grey line under it.
// `onClick` (with stopPropagation by the caller) when the name opens something
// different from the row, as the client name does on Client Overview.
// `oneLine` keeps a long name on one line, cut with "..." (hover shows `title`),
// so the row never grows taller.
export function ListName({ children, sub, onClick, title, oneLine = false }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
      <span onClick={onClick} title={title}
        onMouseEnter={onClick ? e => { e.currentTarget.style.textDecoration = 'underline' } : undefined}
        onMouseLeave={onClick ? e => { e.currentTarget.style.textDecoration = 'none' } : undefined}
        style={{ fontWeight: 600, color: 'var(--vfo-link)', alignSelf: oneLine ? 'stretch' : 'flex-start', cursor: onClick ? 'pointer' : undefined, ...(oneLine ? ONE_LINE : { overflowWrap: 'anywhere' }) }}>{children || '—'}</span>
      {sub && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{sub}</span>}
    </span>
  )
}

// A small tinted pill (status, Paused, In Arrears...) in any hex colour.
export function ListPill({ color, children, style }) {
  return <span style={{ ...statusPillStyle(color), ...style }}>{children}</span>
}

// A plain grey cell value, faint when empty.
export function ListText({ children, mono = false, style }) {
  const empty = children == null || children === ''
  return (
    <span style={{ fontSize: '12px', color: empty ? 'var(--vfo-faint)' : 'var(--vfo-ink)', fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, ...style }}>
      {empty ? '—' : children}
    </span>
  )
}

// A cell kept to one line, cut with "...".
export const ONE_LINE = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

// How wide a directory LIST page may grow (Advisors, Accountants, Strategic
// Members, Specialists, Tax Planners). An opened profile stays at 900px.
export const LIST_PAGE_MAX_WIDTH = '1200px'

// A dropdown in the toolbar above a list or money table: a filter, a sort, a period
// (Issue #661 part 6b: nine pages each typed their own). Accounting's selectStyle is this.
export const listSelectStyle = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }

// The search box above a list (Client Overview's).
export const listSearchStyle = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', flex: 1, minWidth: '240px', boxSizing: 'border-box' }
