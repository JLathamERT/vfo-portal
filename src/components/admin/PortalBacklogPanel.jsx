import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { KpiHero } from './KpiKit'
import { btnPrimary, btnSecondary } from '../shared/buttonStyles'
import { PORTAL_DEPARTMENTS } from './backlog/portalDepartments'
import { LENSES, LENS_PREDICATE, lensCounts } from './backlog/backlogModel'
import BacklogBoard from './backlog/BacklogBoard'
import BacklogRequestsTab from './backlog/BacklogRequestsTab'
import BacklogArchive from './backlog/BacklogArchive'
import BacklogDrawer from './backlog/BacklogDrawer'
import NewRequestModal from './backlog/NewRequestModal'
import DenyDialog from './backlog/DenyDialog'
import ArchiveDialog from './backlog/ArchiveDialog'
import { inputStyle } from './backlog/BacklogModal'
import { PortalBacklogSkeleton } from '../shared/skeletons'

// More > Portal Backlog (2026-11-17): portal update requests, replacing the
// "VFO Portal Update Requests" sheet. Every admin sees everything and can file a
// request; the superadmins (the server's `can_manage`) review, move and restore.
// Styled like the KPI pages: a lens hero, breakdown cards, then the Tasks board
// or the Requests lists. The server owns every rule; this page reads and asks.
async function call(action, payload) {
  const d = await callApi(action, payload)
  if (d?.error) throw new Error(d.error)
  return d
}

export default function PortalBacklogPanel({ link }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [lens, setLens] = useState('all')
  const [department, setDepartment] = useState('')
  const [view, setView] = useState('tasks')
  const [showArchive, setShowArchive] = useState(false)
  const [archiveKey, setArchiveKey] = useState(0)
  const [archiveRows, setArchiveRows] = useState([])
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(null) // 'new' | request
  const [denying, setDenying] = useState(null)
  const [archiving, setArchiving] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const deepLink = useRef(null)
  const [linkTick, setLinkTick] = useState(0)
  useEffect(() => {
    if (link?.id) { deepLink.current = link.id; setLinkTick((t) => t + 1) }
  }, [link])

  const load = useCallback(async () => {
    try {
      const d = await call('portal_backlog_load', {})
      setData(d)
      setLoadError('')
      return d
    } catch (e) {
      setLoadError(e.message || 'Could not load the backlog')
      return null
    }
  }, [])

  useEffect(() => { load() }, [load])

  const people = data?.people || {}
  const assignees = data?.assignees || []
  const canManage = !!data?.can_manage
  const me = data?.me || null

  // Department narrows everything on the page; the lens narrows what is under the hero.
  const pool = useMemo(() => {
    const rows = data?.requests || []
    return department ? rows.filter((r) => (r.departments || []).includes(department)) : rows
  }, [data, department])
  const counts = useMemo(() => lensCounts(pool), [pool])
  const scoped = useMemo(() => pool.filter(LENS_PREDICATE[lens]), [pool, lens])


  // The drawer reads the live row (or an archived one) by id, so it follows reloads.
  const allRows = useMemo(() => [...(data?.requests || []), ...(data?.my_withdrawn || []), ...archiveRows], [data, archiveRows])
  const open = openId != null ? allRows.find((r) => r.id === openId) : null

  // A bell's ?request= link: open the inner tab the request is on, then its drawer.
  useEffect(() => {
    const id = deepLink.current
    if (!id || !data) return
    const r = data.requests.find((x) => x.id === id)
    if (r) {
      deepLink.current = null
      setView(r.review_status === 'approved' ? 'tasks' : 'requests')
      setShowArchive(false)
      setOpenId(id)
    } else {
      setShowArchive(true)
      setArchiveKey((k) => k + 1)
    }
  }, [data, linkTick])

  const onArchiveLoaded = useCallback((rows) => {
    setArchiveRows(rows)
    const id = deepLink.current
    if (id && rows.some((r) => r.id === id)) { deepLink.current = null; setOpenId(id) }
    else if (id) deepLink.current = null
  }, [])

  // Every write: run it, say what went wrong, reload the board.
  const act = async (request, action, payload, { optimistic } = {}) => {
    setBusyId(request?.id ?? 'new')
    setNotice('')
    if (optimistic && data) {
      setData({ ...data, requests: data.requests.map((r) => (r.id === request.id ? { ...r, ...optimistic } : r)) })
    }
    try {
      const d = await call(action, payload)
      await load()
      return d
    } catch (e) {
      setNotice(e.message || 'That did not work')
      await load()
      throw e
    } finally {
      setBusyId(null)
    }
  }
  const quiet = (p) => p.catch(() => {})

  const move = (r, progress, assignee, position = {}) => {
    if (progress === 'ready_to_announce' && r.progress !== 'ready_to_announce' && !String(r.announcement || '').trim()) {
      setNotice(`Write up what "${r.title}" does before moving it to Ready to announce.`)
      setOpenId(r.id)
      return Promise.resolve()
    }
    return quiet(act(r, 'portal_request_move',
    { id: r.id, progress, assignee_admin_id: assignee, ...position },
    { optimistic: { progress, assignee_admin_id: progress === 'ready_to_announce' ? r.assignee_admin_id : assignee } }))
  }
  const approve = (r) => quiet(act(r, 'portal_request_review', { id: r.id, decision: 'approve' }))
  const reopen = async (r) => { await quiet(act(r, 'portal_request_review', { id: r.id, decision: 'reopen' })); setArchiveKey((k) => k + 1) }
  const resort = (progress, assignee) => quiet(act(null, 'portal_backlog_resort', { progress, assignee_admin_id: assignee }))
  const restore = async (r) => { await quiet(act(r, 'portal_request_restore', { id: r.id })); setArchiveKey((k) => k + 1) }
  const withdraw = async (r) => {
    if (!window.confirm('Withdraw this request? It will disappear from the backlog.')) return
    await quiet(act(r, 'portal_request_withdraw', { id: r.id }))
    setOpenId(null)
  }

  const saveRequest = async (fields) => {
    if (editing === 'new') {
      const d = await act(null, 'portal_request_create', fields)
      setEditing(null)
      setView('requests')
      if (d?.request?.id) setOpenId(d.request.id)
    } else {
      await act(editing, 'portal_request_update', { id: editing.id, ...fields })
      setEditing(null)
    }
  }

  const pageStyle = { maxWidth: '1800px', margin: '0 auto', padding: 'var(--vfo-gutter, 24px)', boxSizing: 'border-box', minWidth: 0 }

  // The inner tabs sit above the hero, the way the Advisor KPIs page does it.
  // They are chrome, so they show while the backlog loads too.
  const viewTabs = (
    <div role="tablist" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
      {[['tasks', 'Tasks'], ['requests', 'Requests']].map(([k, label]) => {
        const active = view === k && !showArchive
        return (
          <button key={k} role="tab" aria-selected={active} onClick={() => { setView(k); setShowArchive(false) }}
            style={{
              padding: '8px 16px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap',
              background: active ? 'var(--vfo-primary)' : 'var(--vfo-card)',
              color: active ? '#ffffff' : 'var(--vfo-muted)',
              border: `1px solid ${active ? 'var(--vfo-primary)' : 'var(--vfo-border-soft)'}`,
            }}>
            {label}{k === 'requests' && counts.pending > 0 ? ` (${counts.pending})` : ''}
          </button>
        )
      })}
    </div>
  )

  if (!data) {
    if (loadError) {
      return (
        <div style={pageStyle}>
          <div style={{ color: '#e74c3c', fontWeight: 600 }}>{loadError} <button style={{ ...btnSecondary, marginLeft: '8px' }} onClick={load}>Try again</button></div>
        </div>
      )
    }
    return (
      <div style={pageStyle}>
        {viewTabs}
        <PortalBacklogSkeleton view={view} lensCount={LENSES.length} />
      </div>
    )
  }

  const showAssignFor = (r) => r === 'new' || (me && r.requester_admin_id === me.admin_id && r.review_status === 'pending')

  return (
    <div style={pageStyle}>
      {viewTabs}

      <KpiHero
        title="Portal Backlog"
        subtitle="Update requests for the VFO Portal"
        lenses={LENSES}
        counts={counts}
        lens={lens}
        setLens={setLens}
        unitLabel="requests"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select aria-label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} style={{ ...inputStyle, width: 'auto', padding: '7px 10px', fontSize: '13px' }}>
            <option value="">All departments</option>
            {PORTAL_DEPARTMENTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
          </select>
          <button style={btnSecondary} onClick={() => setShowArchive((v) => !v)}>{showArchive ? 'Close archive' : 'Archive'}</button>
        </div>
        <button style={btnPrimary} onClick={() => setEditing('new')}>+ New request</button>
      </div>

      {notice && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', borderRadius: '10px', marginBottom: '12px', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)', color: '#c0392b', fontSize: '13px', fontWeight: 600 }}>
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {showArchive ? (
        <BacklogArchive people={people} canManage={canManage} reloadKey={archiveKey} busyId={busyId}
          onOpen={(r) => setOpenId(r.id)} onRestore={restore} onReopen={reopen} onBack={() => setShowArchive(false)} onLoaded={onArchiveLoaded} />
      ) : view === 'tasks' ? (
        <BacklogBoard requests={scoped} assignees={assignees} people={people} canManage={canManage}
          onOpen={(r) => setOpenId(r.id)} onMove={move} onResort={resort} onArchive={setArchiving} />
      ) : (
        <BacklogRequestsTab requests={scoped} people={people} canManage={canManage} busyId={busyId}
          onOpen={(r) => setOpenId(r.id)} onApprove={approve} onDeny={setDenying} onArchive={setArchiving} />
      )}

      {open && (
        <BacklogDrawer request={open} people={people} assignees={assignees} canManage={canManage} me={me} busy={busyId === open.id}
          onClose={() => setOpenId(null)}
          onEdit={() => setEditing(open)}
          onWithdraw={() => withdraw(open)}
          onApprove={() => approve(open)}
          onDeny={() => setDenying(open)}
          onReopen={() => reopen(open)}
          onMove={(progress, assignee) => move(open, progress, assignee)}
          onArchive={() => setArchiving(open)}
          onRestore={() => restore(open)}
          onSaveWriteup={(announcement) => act(open, 'portal_request_writeup_save', { id: open.id, announcement })} />
      )}

      {editing && (
        <NewRequestModal initial={editing === 'new' ? null : editing} assignees={assignees} showAssign={showAssignFor(editing)}
          onSave={saveRequest} onClose={() => setEditing(null)} />
      )}
      {denying && (
        <DenyDialog request={denying} onClose={() => setDenying(null)}
          onDeny={async (note) => { await act(denying, 'portal_request_review', { id: denying.id, decision: 'deny', note }); setDenying(null); setArchiveKey((k) => k + 1) }} />
      )}
      {archiving && (
        <ArchiveDialog request={archiving} onClose={() => setArchiving(null)}
          onArchive={async (announced_on, announce_note) => {
            await act(archiving, 'portal_request_archive', { id: archiving.id, announced_on, announce_note })
            setArchiving(null)
            setArchiveKey((k) => k + 1)
          }} />
      )}
    </div>
  )
}
