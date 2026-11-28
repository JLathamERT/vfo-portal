import { useCallback, useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'
import { btnSecondary } from '../../shared/buttonStyles'
import { hexA } from '../KpiKit'
import { departmentChipStyle, PORTAL_DEPARTMENTS } from './portalDepartments'
import { isTask } from './backlogModel'
import { TaskTag } from './TaskBits'
import BigNewsBadge from './BigNewsBadge'
import LikeButton from './LikeButton'
import { inputStyle } from './BacklogModal'
import { PortalBacklogArchiveRowsSkeleton } from '../../shared/skeletons'
import ListTable, { ListName, ListText, listSearchStyle } from '../../shared/ListTable'
import { formatDate, formatDateTime } from '../../../lib/dates'

// The archive: archived items (from Live since Backlog 5a, from Ready to
// announce before it) and denied requests, newest first, read-only. Search
// matches the title, the description and the requester. A superadmin can
// Restore an archived item (back to Live) or Reopen a denied one (back to New
// requests). An item that went Live without being announced shows "Live".
const SHOW = [['all', 'Archived and denied'], ['announced', 'Archived'], ['denied', 'Denied']]

// `department` / `onDepartmentChange`: the page holds the department so a single
// ticked department in the board's Filter carries in, and back out (Backlog 3b).
export default function BacklogArchive({ people, canManage, reloadKey, onOpen, onRestore, onReopen, onBack, busyId, onLoaded, department: departmentProp, onDepartmentChange }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [ownDepartment, setOwnDepartment] = useState('')
  const department = departmentProp ?? ownDepartment
  const setDepartment = onDepartmentChange ?? setOwnDepartment
  const [show, setShow] = useState('all')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { const t = setTimeout(() => { setQuery(search.trim()); setOffset(0) }, 300); return () => clearTimeout(t) }, [search])

  const load = useCallback(async () => {
    setError('')
    try {
      const d = await callApi('portal_backlog_archive_load', { search: query, department: department || null, show, offset })
      if (d.error) throw new Error(d.error)
      setData(d)
      onLoaded?.(d.requests || [])
    } catch (e) {
      setError(e.message || 'Could not load the archive')
    }
  }, [query, department, show, offset, onLoaded])

  useEffect(() => { load() }, [load, reloadKey])

  const rows = data?.requests || []
  const total = data?.total || 0
  const pageSize = data?.page_size || 100

  const columns = [
    { key: 'request', label: 'Request', width: 'minmax(0, 1fr)', get: r => r.title, render: r => {
      const denied = r.review_status === 'denied'
      return (
        <span style={{ display: 'block', minWidth: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <StatusPill denied={denied} announced={!!r.announced_on} />
            {isTask(r) && <TaskTag />}
            <BigNewsBadge request={r} />
            <ListName>{r.title}</ListName>
            <LikeButton count={r.like_count || 0} />
          </span>
          <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', marginTop: '3px' }}>{r.requester_name}</span>
          {r.departments?.length > 0 && <span style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>{r.departments.map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}</span>}
          <span style={{ fontSize: '12.5px', color: 'var(--vfo-ink-soft)', marginTop: '5px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
            {denied ? r.request_text : (r.announcement || r.request_text)}
          </span>
        </span>
      )
    } },
    { key: 'requested', label: 'Requested', width: '100px', type: 'date', get: r => r.requested_on || null, render: r => <ListText style={{ color: 'var(--vfo-muted)' }}>{formatDate(r.requested_on, '')}</ListText> },
    { key: 'outcome', label: 'Outcome', width: '260px', render: r => {
      const denied = r.review_status === 'denied'
      return (
        <span style={{ display: 'block', fontSize: '12px', color: 'var(--vfo-muted)', lineHeight: 1.5 }}>
          {denied ? (
            <>
              <span style={{ display: 'block' }}><strong style={{ color: 'var(--vfo-ink)' }}>Denied by {people[r.reviewed_by_admin_id] || (r.imported ? 'the sheet' : 'a former admin')}</strong></span>
              {r.reviewed_at && <span style={{ display: 'block' }}>{formatDateTime(r.reviewed_at, '–')}</span>}
              {r.review_note && <span style={{ display: 'block', overflowWrap: 'anywhere' }}>Reason: {r.review_note}</span>}
              {canManage && (
                <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px', marginTop: '6px' }} disabled={busyId === r.id}
                  onClick={(e) => { e.stopPropagation(); onReopen(r) }}>Reopen</button>
              )}
            </>
          ) : (
            <>
              {r.announced_on
                ? <span style={{ display: 'block' }}><strong style={{ color: 'var(--vfo-ink)' }}>Announced on {formatDate(r.announced_on, '–')}</strong></span>
                : r.live_at && <span style={{ display: 'block' }}><strong style={{ color: 'var(--vfo-ink)' }}>Live {formatDate(String(r.live_at).slice(0, 10), '–')}</strong></span>}
              {r.announce_note && <span style={{ display: 'block', overflowWrap: 'anywhere' }}>{r.announce_note}</span>}
              <span style={{ display: 'block' }}>Archived by {people[r.archived_by_admin_id] || 'a former admin'}, {formatDateTime(r.archived_at, '–')}</span>
              {canManage && (
                <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px', marginTop: '6px' }} disabled={busyId === r.id}
                  onClick={(e) => { e.stopPropagation(); onRestore(r) }}>Restore</button>
              )}
            </>
          )}
        </span>
      )
    } },
  ]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Archive</span>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{total}</span>
        </div>
        <button style={btnSecondary} onClick={onBack}>Back to the board</button>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search titles, requests or requesters" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ ...listSearchStyle, flex: '1 1 220px' }} />
        <select aria-label="Show" value={show} onChange={(e) => { setShow(e.target.value); setOffset(0) }} style={{ ...inputStyle, flex: '0 1 210px', width: 'auto' }}>
          {SHOW.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <select aria-label="Department" value={department} onChange={(e) => { setDepartment(e.target.value); setOffset(0) }} style={{ ...inputStyle, flex: '0 1 220px', width: 'auto' }}>
          <option value="">All departments</option>
          {PORTAL_DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
        </select>
      </div>
      {error && <div style={{ color: '#e74c3c', fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>{error}</div>}
      {!data && !error && <PortalBacklogArchiveRowsSkeleton />}
      {data && (
        <ListTable columns={columns} rows={rows} rowKey={r => r.id} onRowClick={r => onOpen(r)} minWidth="720px"
          empty={`Nothing in the archive${query || department || show !== 'all' ? ' matches' : ' yet'}.`} />
      )}
      {total > pageSize && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', gap: '8px' }}>
          <button style={btnSecondary} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>Newer</button>
          <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>{offset + 1}–{Math.min(total, offset + pageSize)} of {total}</span>
          <button style={btnSecondary} disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)}>Older</button>
        </div>
      )}
    </div>
  )
}

function StatusPill({ denied, announced }) {
  const color = denied ? '#e74c3c' : announced ? '#1b9254' : '#0e8a8a'
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', whiteSpace: 'nowrap',
      background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.4)}`, color: denied || !announced ? color : 'var(--vfo-success-text)' }}>
      {denied ? 'Denied' : announced ? 'Announced' : 'Live'}
    </span>
  )
}
