import { useCallback, useEffect, useState } from 'react'
import { callApi } from '../../../lib/api'
import { btnSecondary } from '../../shared/buttonStyles'
import { hexA } from '../KpiKit'
import { departmentChipStyle, PORTAL_DEPARTMENTS } from './portalDepartments'
import { fmtDate, fmtDateTime, isTask } from './backlogModel'
import { TaskTag } from './TaskBits'
import { inputStyle } from './BacklogModal'
import { PortalBacklogArchiveRowsSkeleton } from '../../shared/skeletons'

// The archive: announced requests and denied ones, newest first, read-only.
// Search matches the title, the description and the requester. A superadmin
// can Restore an announced request (back to Ready to announce) or Reopen a
// denied one (back to New requests).
const SHOW = [['all', 'Announced and denied'], ['announced', 'Announced'], ['denied', 'Denied']]

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

  return (
    <div style={{ background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Archive</span>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{total}</span>
        </div>
        <button style={btnSecondary} onClick={onBack}>Back to the board</button>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search titles, requests or requesters" value={search}
          onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }} />
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
      {data && rows.length === 0 && <div style={{ color: 'var(--vfo-faint)', fontSize: '13.5px', padding: '10px 0' }}>Nothing in the archive{query || department || show !== 'all' ? ' matches' : ' yet'}.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {rows.map((r) => {
          const denied = r.review_status === 'denied'
          return (
            <div key={r.id} onClick={() => onOpen(r)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r) }}
              style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap', padding: '10px 12px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', cursor: 'pointer', background: 'var(--vfo-card)' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <StatusPill denied={denied} />
                  {isTask(r) && <TaskTag />}
                  <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--vfo-ink)', overflowWrap: 'anywhere' }}>{r.title}</span>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vfo-muted)', marginTop: '3px' }}>{r.requester_name} · {fmtDate(r.requested_on)}</div>
                {r.departments?.length > 0 && <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>{r.departments.map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}</div>}
                <div style={{ fontSize: '12.5px', color: 'var(--vfo-ink-soft)', marginTop: '5px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>
                  {denied ? r.request_text : (r.announcement || r.request_text)}
                </div>
              </div>
              <div style={{ flex: '0 1 240px', minWidth: 0, fontSize: '12px', color: 'var(--vfo-muted)', lineHeight: 1.5 }}>
                {denied ? (
                  <>
                    <div><strong style={{ color: 'var(--vfo-ink)' }}>Denied by {people[r.reviewed_by_admin_id] || (r.imported ? 'the sheet' : 'a former admin')}</strong></div>
                    {r.reviewed_at && <div>{fmtDateTime(r.reviewed_at)}</div>}
                    {r.review_note && <div style={{ overflowWrap: 'anywhere' }}>Reason: {r.review_note}</div>}
                    {canManage && (
                      <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px', marginTop: '6px' }} disabled={busyId === r.id}
                        onClick={(e) => { e.stopPropagation(); onReopen(r) }}>Reopen</button>
                    )}
                  </>
                ) : (
                  <>
                    <div><strong style={{ color: 'var(--vfo-ink)' }}>Announced on {fmtDate(r.announced_on)}</strong></div>
                    {r.announce_note && <div style={{ overflowWrap: 'anywhere' }}>{r.announce_note}</div>}
                    <div>Archived by {people[r.archived_by_admin_id] || 'a former admin'}, {fmtDateTime(r.archived_at)}</div>
                    {canManage && (
                      <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px', marginTop: '6px' }} disabled={busyId === r.id}
                        onClick={(e) => { e.stopPropagation(); onRestore(r) }}>Restore</button>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
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

function StatusPill({ denied }) {
  const color = denied ? '#e74c3c' : '#1b9254'
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', whiteSpace: 'nowrap',
      background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.4)}`, color: denied ? color : 'var(--vfo-success-text)' }}>
      {denied ? 'Denied' : 'Announced'}
    </span>
  )
}
