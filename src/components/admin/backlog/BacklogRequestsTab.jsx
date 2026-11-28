import { Fragment, useEffect, useState } from 'react'
import ListFilterButton, { useHeaderSort, sortByColumn, SortHeader, SortSelect } from '../ListFilterButton'
import { clickableRowStyle, rowHoverProps } from '../../shared/rowHover'
import { useIsPhone } from '../../../lib/useMediaQuery'
import { departmentChipStyle } from './portalDepartments'
import { isTask, sortRequests, REQUEST_SORT_OPTIONS } from './backlogModel'
import ScorePill from './ScorePill'
import { TaskTag } from './TaskBits'
import BigNewsBadge from './BigNewsBadge'
import BacklogDetails from './BacklogDetails'
import LikeButton from './LikeButton'
import { formatDate } from '../../../lib/dates'

// The Requests tab, laid out like Client Overview: search, Filter and Sort, then
// one table of the requests waiting for review (Ready to announce moved to the
// What's new tab, Paxton 2026-11-23). It defaults to the order added, oldest
// first (the Sort dropdown); a clicked column header overrides it until the
// dropdown changes. A row (or its chevron) drops its full details down under
// it, with every drawer action; several rows can be open. The drawer is for the
// Tasks board, What's new and the Archive.

// The Likes column (Backlog 7c) sits right after Title.
export const REQUESTS_GRID = '32px minmax(260px, 2.4fr) 80px minmax(180px, 1.6fr) 90px 100px 120px 150px'
export const REQUESTS_MIN_WIDTH = 1070

export const requestRowId = (id) => `backlog-request-${id}`

export default function BacklogRequestsTab({ requests, people, assignees, canManage, me, busyId, search, onSearch, openIds, onToggle, detailProps, filterGroups, filter, onFilterChange, filtering, sortValue = 'added_asc', onSortChange, likeFor, likesLeftText }) {
  const isPhone = useIsPhone()
  const pendingSort = useHeaderSort()

  const q = search.trim().toLowerCase()
  const matches = (r) => !q || [r.title, r.request_text, r.requester_name].some((v) => String(v || '').toLowerCase().includes(q))

  // Tasks are never pending (Backlog 4a).
  const allPending = requests.filter((r) => r.review_status === 'pending' && !isTask(r))
  const pending = sortRequests(allPending.filter(matches), sortValue)

  const nameOf = (id) => (id == null ? '' : (people[id] || 'A former admin'))
  const columnsFor = (field) => ({
    title: { get: (r) => r.title },
    // Negated so the first click puts the most-liked first (Backlog 7c); ties keep
    // the dropdown's order.
    likes: { get: (r) => -(r.like_count || 0), type: 'number' },
    departments: { get: (r) => (r.departments || []).join(', ') },
    urgency: { get: (r) => r.urgency, type: 'number' },
    importance: { get: (r) => r.importance, type: 'number' },
    requested_on: { get: (r) => r.requested_on, type: 'date' },
    assigned: { get: (r) => nameOf(r[field]) },
  })

  const renderDetails = (r) => (
    <BacklogDetails request={r} people={people} assignees={assignees} canManage={canManage} me={me}
      busy={busyId === r.id} layout="grid" {...detailProps(r)} />
  )
  // The filter is applied before this tab gets the rows, so with any tick on an
  // empty table says so; with only a search, the search does.
  const emptyFor = (all, none) => (filtering ? 'No requests match the current filters.' : q && all.length ? 'No requests match your search.' : none)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" aria-label="Search requests"
          placeholder="Search by title, description or requester..." value={search} onChange={(e) => onSearch(e.target.value)}
          style={{ flex: isPhone ? '1 1 100%' : 1, minWidth: 0, padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }} />
        <ListFilterButton groups={filterGroups} value={filter} onChange={onFilterChange} align={isPhone ? 'left' : 'right'} />
        <SortSelect value={sortValue} options={REQUEST_SORT_OPTIONS}
          onChange={(v) => { onSortChange(v); pendingSort.reset() }} />
        {likesLeftText}
      </div>

      <RequestsTable rows={sortByColumn(pending, pendingSort.sort, columnsFor('requested_assignee_admin_id'))}
        emptyText={emptyFor(allPending, 'No requests waiting for review.')}
        sort={pendingSort.sort} onSort={pendingSort.onSort} people={people} assignedField="requested_assignee_admin_id"
        openIds={openIds} onToggle={onToggle} renderDetails={renderDetails} likeFor={likeFor} />
    </div>
  )
}

function RequestsTable({ rows, emptyText, sort, onSort, people, assignedField, openIds, onToggle, renderDetails, likeFor }) {
  const isPhone = useIsPhone()
  // The table scrolls sideways below its min width, so an open dropdown is sized
  // to the table's VISIBLE width (and stuck to its left edge) to wrap on screen.
  const [box, setBox] = useState(null)
  const [visibleWidth, setVisibleWidth] = useState(null)
  useEffect(() => {
    if (!box || typeof ResizeObserver === 'undefined') return
    const measure = () => setVisibleWidth(box.clientWidth || null)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [box])

  const faint = { color: 'var(--vfo-faint)' }

  // A phone gets one card per request instead of the wide table: the same facts,
  // and the details drop open inside the card.
  if (isPhone) {
    return (
      <div>
        {rows.length === 0 && <div style={{ padding: '12px 2px', color: 'var(--vfo-faint)', fontSize: '13px' }}>{emptyText}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {rows.map((r) => {
            const open = openIds.has(r.id)
            const assigned = r[assignedField]
            const like = likeFor ? likeFor(r) : null
            return (
              <div key={r.id} style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden' }}>
                <div id={requestRowId(r.id)} role="button" tabIndex={0} aria-expanded={open}
                  onClick={() => onToggle(r.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(r.id) } }}
                  style={{ padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', scrollMarginTop: '80px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {(isTask(r) || r.release_importance === 'big') && (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '5px' }}>
                        {isTask(r) && <TaskTag />}
                        <BigNewsBadge request={r} />
                      </div>
                    )}
                    <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--vfo-link)', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{r.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px' }}>{r.requester_name} · {formatDate(r.requested_on, '–')}</div>
                    {(r.departments || []).length > 0 && (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {r.departments.map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}
                      </div>
                    )}
                    {!isTask(r) && (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '6px' }}>
                        <ScorePill label="Urgency" value={r.urgency} />
                        <ScorePill label="Importance" value={r.importance} />
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '8px' }}>
                      {assigned != null
                        ? <>Assigned to <span style={{ fontWeight: 600, color: 'var(--vfo-ink)' }}>{people[assigned] || 'A former admin'}</span></>
                        : <span style={{ color: 'var(--vfo-faint)' }}>Unassigned</span>}
                    </div>
                  </div>
                  {like && <LikeButton {...like} />}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                    style={{ flexShrink: 0, marginTop: '2px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms ease' }}><polyline points="9 6 15 12 9 18" /></svg>
                </div>
                {open && (
                  <div style={{ padding: '12px', background: 'var(--vfo-input)', borderTop: '1px solid var(--vfo-border-soft)', cursor: 'default' }}>
                    {renderDetails(r)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div ref={setBox} style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: REQUESTS_MIN_WIDTH }}>
          <div style={{ display: 'grid', gridTemplateColumns: REQUESTS_GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span />
            <SortHeader label="Title" sortKey="title" sort={sort} onSort={onSort} />
            <SortHeader label="Likes" sortKey="likes" sort={sort} onSort={onSort} />
            <SortHeader label="Departments" sortKey="departments" sort={sort} onSort={onSort} />
            <SortHeader label="Urgency" sortKey="urgency" sort={sort} onSort={onSort} />
            <SortHeader label="Importance" sortKey="importance" sort={sort} onSort={onSort} />
            <SortHeader label="Requested on" sortKey="requested_on" sort={sort} onSort={onSort} />
            <SortHeader label="Assigned to" sortKey="assigned" sort={sort} onSort={onSort} />
          </div>

          {rows.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>{emptyText}</div>
          )}

          {rows.map((r) => {
            const open = openIds.has(r.id)
            const assigned = r[assignedField]
            const like = likeFor ? likeFor(r) : null
            return (
              <Fragment key={r.id}>
                <div id={requestRowId(r.id)} role="button" tabIndex={0} aria-expanded={open}
                  onClick={() => onToggle(r.id)}
                  onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(r.id) } }}
                  {...rowHoverProps}
                  style={{ ...clickableRowStyle, display: 'grid', gridTemplateColumns: REQUESTS_GRID, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)', scrollMarginTop: '80px' }}>
                  <button type="button" tabIndex={-1}
                    onClick={(ev) => { ev.stopPropagation(); onToggle(r.id) }}
                    title={open ? 'Hide the request details' : 'Show the request details'}
                    style={{ width: '24px', height: '24px', border: '1px solid var(--vfo-border-strong)', background: open ? 'var(--vfo-tint)' : 'var(--vfo-card)', borderRadius: '6px', cursor: 'pointer', color: 'var(--vfo-muted)', fontSize: '11px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {open ? '▾' : '▸'}
                  </button>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: 'var(--vfo-link)', overflowWrap: 'anywhere' }}>
                      {isTask(r) && <><TaskTag />{' '}</>}{r.release_importance === 'big' && <><BigNewsBadge request={r} />{' '}</>}{r.title}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{r.requester_name}</span>
                  </span>
                  <span>{like ? <LikeButton {...like} /> : <LikeButton count={r.like_count || 0} />}</span>
                  <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', minWidth: 0 }}>
                    {(r.departments || []).length
                      ? r.departments.map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)
                      : <span style={faint}>–</span>}
                  </span>
                  <span>{r.urgency == null ? <span style={faint}>–</span> : <ScorePill label="Urgency" value={r.urgency} numberOnly />}</span>
                  <span>{r.importance == null ? <span style={faint}>–</span> : <ScorePill label="Importance" value={r.importance} numberOnly />}</span>
                  <span style={{ fontSize: '12px', color: r.requested_on ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>{formatDate(r.requested_on, '–')}</span>
                  <span style={{ fontSize: '12px', color: assigned != null ? 'var(--vfo-ink)' : 'var(--vfo-faint)' }}>
                    {assigned != null ? (people[assigned] || 'A former admin') : 'Unassigned'}
                  </span>
                </div>
                {open && (
                  <div style={{
                    padding: '14px 18px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', cursor: 'default',
                    ...(visibleWidth ? { position: 'sticky', left: 0, width: `${visibleWidth}px`, boxSizing: 'border-box' } : null),
                  }}>
                    {renderDetails(r)}
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>
    </div>
  )
}
