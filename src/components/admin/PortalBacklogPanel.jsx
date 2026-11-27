import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { callApi } from '../../lib/api'
import { KpiHero } from './KpiKit'
import { btnPrimary, btnSecondary } from '../shared/buttonStyles'
import { PORTAL_DEPARTMENTS } from './backlog/portalDepartments'
import { LENSES, LENS_PREDICATE, lensCounts, EMPTY_BACKLOG_FILTER, backlogFilterGroups, filterIsOn, isPool, isTask, likeable, likeCounts } from './backlog/backlogModel'
import LikeCapDialog from './backlog/LikeCapDialog'
import ListFilterButton, { matchesFilter } from './ListFilterButton'
import BacklogBoard from './backlog/BacklogBoard'
import BacklogRequestsTab, { requestRowId } from './backlog/BacklogRequestsTab'
import BacklogArchive from './backlog/BacklogArchive'
import BacklogDrawer from './backlog/BacklogDrawer'
import NewRequestModal from './backlog/NewRequestModal'
import TaskModal from './backlog/TaskModal'
import DenyDialog from './backlog/DenyDialog'
import AnnounceDialog from './backlog/AnnounceDialog'
import AnnounceTab from './backlog/AnnounceTab'
import { PortalBacklogSkeleton } from '../shared/skeletons'
import SubTabs from '../shared/SubTabs'
import { PageHeading } from '../shared/ProfileKit'

// More > Portal Backlog (2026-11-17): portal update requests, replacing the
// "VFO Portal Update Requests" sheet. Every admin sees everything and can file a
// request; the superadmins (the server's `can_manage`) review, move and restore.
// Styled like the KPI pages: the Tasks board, the Requests tables under a lens
// hero (Requests only; the board ignores the lens), or What's new (Backlog 5a:
// Ready to announce and Live as announcement cards). A board, What's new or
// archive card opens the drawer; a Requests row drops its details open under it
// instead. The server owns every rule; this page reads and asks.
async function call(action, payload) {
  const d = await callApi(action, payload)
  if (d?.error) throw new Error(d.error)
  return d
}

export default function PortalBacklogPanel({ link }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [success, setSuccess] = useState('')
  const [lens, setLens] = useState('all')
  // One Filter for the Tasks board and the Requests tab; the Archive keeps its
  // own department dropdown, and a single department carries in and out.
  const [filter, setFilter] = useState(EMPTY_BACKLOG_FILTER)
  const [archiveDepartment, setArchiveDepartment] = useState('')
  const [view, setView] = useState('tasks')
  const [showArchive, setShowArchive] = useState(false)
  const [archiveKey, setArchiveKey] = useState(0)
  const [archiveRows, setArchiveRows] = useState([])
  const [openId, setOpenId] = useState(null)
  const [editing, setEditing] = useState(null) // 'new' | request | task
  const [addingTask, setAddingTask] = useState(null) // null | { assignee }
  const [denying, setDenying] = useState(null)
  const [announcing, setAnnouncing] = useState(null) // Mark as announced (Ready to announce -> Live)
  const [busyId, setBusyId] = useState(null)
  // The Requests tab (requests waiting for review only; Ready to announce lives
  // on What's new since 2026-11-23): its sort, search, the rows dropped open,
  // and one to scroll to.
  const [requestsSort, setRequestsSort] = useState('added_asc')
  const [search, setSearch] = useState('')
  const [openIds, setOpenIds] = useState(() => new Set())
  const [scrollToId, setScrollToId] = useState(null)
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

  // The hero counts follow the Department ticks only; the whole Filter narrows
  // the board and the Requests tables, and the lens the Requests tables only.
  const filterGroups = useMemo(
    () => backlogFilterGroups(data?.requests || [], data?.people || {}, data?.assignees || [], PORTAL_DEPARTMENTS.map((d) => d.name)),
    [data],
  )
  const pool = useMemo(() => {
    const rows = data?.requests || []
    const deps = filter.department
    return deps.length ? rows.filter((r) => (r.departments || []).some((d) => deps.includes(d))) : rows
  }, [data, filter.department])
  // Tasks stay out of the hero: it counts requests (Backlog 4a, Paxton 2026-11-23).
  const counts = useMemo(() => lensCounts(pool.filter((r) => !isTask(r))), [pool])
  const filtered = useMemo(() => pool.filter((r) => matchesFilter(r, filterGroups, filter)), [pool, filterGroups, filter])
  const scoped = useMemo(() => filtered.filter(LENS_PREDICATE[lens]), [filtered, lens])
  // The What's new pill: Ready to announce + Live, tasks included.
  const whatsNewCount = useMemo(() => pool.filter((r) => LENS_PREDICATE.ready(r) || LENS_PREDICATE.live(r)).length, [pool])

  // An open Requests row that the filter or lens hides closes.
  useEffect(() => {
    const shown = new Set(scoped.map((r) => r.id))
    setOpenIds((s) => {
      if ([...s].every((id) => shown.has(id))) return s
      return new Set([...s].filter((id) => shown.has(id)))
    })
  }, [scoped])

  // Into the Archive: one ticked department becomes its dropdown. Out of it: its
  // department becomes the only Department tick (Requester / Assigned to stay).
  const openArchive = () => {
    setArchiveDepartment(filter.department.length === 1 ? filter.department[0] : '')
    setShowArchive(true)
  }
  const closeArchive = () => {
    if (archiveDepartment) setFilter((f) => ({ ...f, department: [archiveDepartment] }))
    setShowArchive(false)
  }

  // The drawer reads the live row (or an archived one) by id, so it follows reloads.
  const allRows = useMemo(() => [...(data?.requests || []), ...(data?.my_withdrawn || []), ...archiveRows], [data, archiveRows])
  const open = openId != null ? allRows.find((r) => r.id === openId) : null

  const toggleRow = (id) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const closeRow = (id) => setOpenIds((s) => { if (!s.has(id)) return s; const n = new Set(s); n.delete(id); return n })
  const onRequestsTab = (r) => r.review_status === 'pending'
  const onWhatsNew = (r) => r.review_status === 'approved' && !r.archived_at && isPool(r.progress)

  // Show a Requests tab row dropped open and scrolled to, clearing whatever would hide it.
  const revealRow = (r) => {
    setView('requests')
    setShowArchive(false)
    if (!LENS_PREDICATE[lens](r)) setLens('all')
    if (!matchesFilter(r, filterGroups, filter)) setFilter(EMPTY_BACKLOG_FILTER)
    setSearch('')
    setOpenIds((s) => (s.has(r.id) ? s : new Set(s).add(r.id)))
    setScrollToId(r.id)
  }
  useEffect(() => {
    if (scrollToId == null || view !== 'requests' || showArchive) return
    const el = document.getElementById(requestRowId(scrollToId))
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setScrollToId(null)
  })

  // A green line after an action takes a request off the Requests tab.
  const doneOnRequests = (msg) => { if (view === 'requests' && !showArchive) setSuccess(msg) }

  // A bell's ?request= link: a pending request drops its row open on Requests;
  // one in Ready to announce or Live opens its drawer on What's new; one on the
  // rest of the board opens its drawer on the Tasks tab.
  useEffect(() => {
    const id = deepLink.current
    if (!id || !data) return
    const r = data.requests.find((x) => x.id === id)
    if (r) {
      deepLink.current = null
      if (onRequestsTab(r)) revealRow(r)
      else {
        setView(onWhatsNew(r) ? 'announce' : 'tasks')
        setShowArchive(false)
        setOpenId(id)
      }
    } else {
      setArchiveDepartment('')
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
    setSuccess('')
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

  // Likes (Backlog 7a / 7b): flip at once, let the server confirm, flip back
  // with its message if it refuses. No reload, and one click per request in flight.
  const [likeBusy, setLikeBusy] = useState(() => new Set())
  const [capOpen, setCapOpen] = useState(false)
  const likesLeft = data?.likes_left ?? 0
  const likeCap = data?.like_cap ?? 0
  const toggleLike = async (r) => {
    if (!me || likeBusy.has(r.id)) return
    const liked = !r.liked_by_me
    const counted = likeCounts(r)
    setNotice('')
    setLikeBusy((s) => new Set(s).add(r.id))
    setData((d) => ({
      ...d,
      likes_left: counted ? Math.max(0, (d.likes_left ?? 0) + (liked ? -1 : 1)) : d.likes_left,
      requests: d.requests.map((x) => (x.id !== r.id ? x : {
        ...x,
        liked_by_me: liked,
        like_count: Math.max(0, (x.like_count || 0) + (liked ? 1 : -1)),
        liked_by: liked ? [...(x.liked_by || []), me.admin_id] : (x.liked_by || []).filter((id) => id !== me.admin_id),
      })),
    }))
    try {
      const res = await call('portal_request_like', { id: r.id, liked })
      setData((d) => ({
        ...d,
        like_cap: res.like_cap ?? d.like_cap,
        likes_left: res.likes_left ?? d.likes_left,
        requests: d.requests.map((x) => (x.id === r.id ? { ...x, like_count: res.like_count, liked_by_me: res.liked_by_me } : x)),
      }))
    } catch (e) {
      setData((d) => ({ ...d, likes_left: data.likes_left, requests: d.requests.map((x) => (x.id === r.id ? r : x)) }))
      setNotice(e.message || 'That like did not save')
    } finally {
      setLikeBusy((s) => { const n = new Set(s); n.delete(r.id); return n })
    }
  }
  const capTitle = `You've used all ${likeCap} likes. Unlike something, or wait for a request you liked to be done.`
  // The like button's props for a request, or null where there is no button (a task).
  const likeFor = (r) => {
    if (!likeable(r) || !me) return null
    return {
      count: r.like_count || 0,
      liked: !!r.liked_by_me,
      disabled: !r.liked_by_me && likesLeft <= 0 && likeCounts(r),
      disabledTitle: capTitle,
      busy: likeBusy.has(r.id),
      onToggle: () => toggleLike(r),
    }
  }
  const saveLikeCap = async (like_cap) => {
    await act(null, 'portal_backlog_settings_save', { like_cap })
    setCapOpen(false)
    setSuccess(`Saved: ${like_cap} ${like_cap === 1 ? 'like' : 'likes'} each.`)
  }
  const likesLeftText = data && me && (
    <span style={{ fontSize: '12.5px', fontWeight: 700, whiteSpace: 'nowrap', color: likesLeft <= 0 ? '#c98a14' : 'var(--vfo-muted)' }}>
      {likesLeft} of {likeCap} likes left
    </span>
  )

  const move = (r, progress, assignee, position = {}) => {
    if (isTask(r) && !isPool(progress) && assignee == null) {
      setNotice('A task always belongs to someone. Assign it to a lane instead.')
      return Promise.resolve()
    }
    if (progress === 'ready_to_announce' && r.progress !== 'ready_to_announce' && !isTask(r) && !String(r.announcement || '').trim()) {
      setNotice(`Write up what "${r.title}" does before moving it to Ready to announce.`)
      setOpenId(r.id)
      return Promise.resolve()
    }
    // Ready to announce -> Live is Mark as announced: ask for the date first
    // (Backlog 5a). Cancelling leaves the card where it was. Review -> Live needs
    // no write-up and no date.
    if (progress === 'live' && r.progress === 'ready_to_announce') {
      setAnnouncing(r)
      return Promise.resolve()
    }
    return quiet(act(r, 'portal_request_move',
    { id: r.id, progress, assignee_admin_id: assignee, ...position },
    { optimistic: { progress, assignee_admin_id: isPool(progress) ? r.assignee_admin_id : assignee } }))
  }
  // Only a Live item is archived (Backlog 5a), with no dialog.
  const archive = async (r) => {
    await quiet(act(r, 'portal_request_archive', { id: r.id }).then(() => {
      setArchiveKey((k) => k + 1)
      setSuccess(`Archived "${r.title}".`)
    }))
  }
  const setImportance = (r, value) => act(r, 'portal_request_importance_set', { id: r.id, release_importance: value },
    { optimistic: { release_importance: value } })
  const approve = (r) => quiet(act(r, 'portal_request_review', { id: r.id, decision: 'approve' }).then(() => {
    closeRow(r.id)
    doneOnRequests('Approved: now on the Tasks board.')
  }))
  const reopen = async (r) => { await quiet(act(r, 'portal_request_review', { id: r.id, decision: 'reopen' })); setArchiveKey((k) => k + 1) }
  const resort = (progress, assignee) => quiet(act(null, 'portal_backlog_resort', { progress, assignee_admin_id: assignee }))
  const resortLikes = (progress, assignee) => quiet(act(null, 'portal_backlog_resort', { progress, assignee_admin_id: assignee, order_by: 'likes' }))
  const restore = async (r) => { await quiet(act(r, 'portal_request_restore', { id: r.id })); setArchiveKey((k) => k + 1) }
  const withdraw = async (r) => {
    if (!window.confirm('Withdraw this request? It will disappear from the backlog.')) return
    await quiet(act(r, 'portal_request_withdraw', { id: r.id }).then(() => {
      closeRow(r.id)
      doneOnRequests('Withdrawn.')
    }))
    setOpenId(null)
  }

  const saveRequest = async (fields) => {
    if (editing === 'new') {
      const d = await act(null, 'portal_request_create', fields)
      setEditing(null)
      if (d?.request?.id) revealRow(d.request)
      else setView('requests')
    } else {
      await act(editing, 'portal_request_update', { id: editing.id, ...fields })
      setEditing(null)
    }
  }

  // A task (Backlog 4b): Add task puts it at the top of the creator's own To do;
  // Edit keeps it where it is. The page stays on the board.
  const saveTask = async (fields) => {
    if (addingTask) {
      await act(null, 'portal_task_create', fields)
      setAddingTask(null)
    } else {
      await act(editing, 'portal_request_update', { id: editing.id, ...fields })
      setEditing(null)
    }
  }

  // The same buttons in the drawer and in a Requests tab row dropdown.
  const detailHandlers = (r) => ({
    onEdit: () => setEditing(r),
    onWithdraw: () => withdraw(r),
    onApprove: () => approve(r),
    onDeny: () => setDenying(r),
    onReopen: () => reopen(r),
    onMove: (progress, assignee) => move(r, progress, assignee),
    onAnnounce: () => setAnnouncing(r),
    onArchive: () => archive(r),
    onRestore: () => restore(r),
    onSaveWriteup: (announcement) => act(r, 'portal_request_writeup_save', { id: r.id, announcement }),
    onSetImportance: (value) => setImportance(r, value),
    like: likeFor(r),
  })

  const pageStyle = { maxWidth: '1800px', margin: '0 auto', padding: 'var(--vfo-gutter, 24px)', boxSizing: 'border-box', minWidth: 0 }

  // The inner tabs sit above the hero, the way the Advisor KPIs page does it.
  // They are chrome, so they show while the backlog loads too.
  const viewTabs = (
    <SubTabs tablist style={{ marginBottom: '20px' }}
      tabs={[
        { key: 'tasks', label: 'Tasks' },
        { key: 'requests', label: `Requests${counts.pending > 0 ? ` (${counts.pending})` : ''}` },
        { key: 'announce', label: `What's new${data && whatsNewCount > 0 ? ` (${whatsNewCount})` : ''}` },
      ]}
      active={showArchive ? null : view}
      onChange={k => { setView(k); if (showArchive) closeArchive() }} />
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
        <PageHeading eyebrow="More" title="Portal Backlog" />
        {viewTabs}
        <PortalBacklogSkeleton view={view} lensCount={LENSES.length} />
      </div>
    )
  }

  const showAssignFor = (r) => r === 'new' || (me && r.requester_admin_id === me.admin_id && r.review_status === 'pending')

  return (
    <div style={pageStyle}>
      <PageHeading eyebrow="More" title="Portal Backlog" />
      {viewTabs}

      {view === 'requests' && !showArchive && (
        <KpiHero
          title="Requests"
          subtitle="Update requests for the VFO Portal"
          lenses={LENSES}
          counts={counts}
          lens={lens}
          setLens={setLens}
          unitLabel="requests"
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {(view === 'tasks' || view === 'announce') && !showArchive && (
            <ListFilterButton groups={filterGroups} value={filter} onChange={setFilter} align="left" />
          )}
          <button style={btnSecondary} onClick={showArchive ? closeArchive : openArchive}>{showArchive ? 'Close archive' : 'Archive'}</button>
          {view === 'tasks' && !showArchive && likesLeftText}
        </div>
        {(view === 'requests' || view === 'tasks') && !showArchive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {canManage && (
              <button type="button" onClick={() => setCapOpen(true)} title="How many likes each person can have on open requests"
                style={{ background: 'transparent', border: 'none', padding: 0, fontSize: '12.5px', fontWeight: 700, color: 'var(--vfo-link)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                Likes: {likeCap} each
              </button>
            )}
            {view === 'requests' && (
              <button style={btnPrimary} onClick={() => setEditing('new')}>+ New request</button>
            )}
            {view === 'tasks' && canManage && (
              <button style={btnPrimary} onClick={() => setAddingTask({ assignee: me?.admin_id ?? null })}>+ Add task</button>
            )}
          </div>
        )}
      </div>

      {notice && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', borderRadius: '10px', marginBottom: '12px', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.3)', color: '#c0392b', fontSize: '13px', fontWeight: 600 }}>
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}
      {success && (
        <div role="status" style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '10px 14px', borderRadius: '10px', marginBottom: '12px', background: 'rgba(27,146,84,0.10)', border: '1px solid rgba(27,146,84,0.3)', color: 'var(--vfo-success-text)', fontSize: '13px', fontWeight: 600 }}>
          <span>{success}</span>
          <button onClick={() => setSuccess('')} aria-label="Dismiss" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}>×</button>
        </div>
      )}

      {showArchive ? (
        <BacklogArchive people={people} canManage={canManage} reloadKey={archiveKey} busyId={busyId}
          onOpen={(r) => setOpenId(r.id)} onRestore={restore} onReopen={reopen} onBack={closeArchive} onLoaded={onArchiveLoaded}
          department={archiveDepartment} onDepartmentChange={setArchiveDepartment} />
      ) : view === 'tasks' ? (
        <BacklogBoard requests={filtered} assignees={assignees} people={people} canManage={canManage} me={me} likeFor={likeFor}
          onOpen={(r) => setOpenId(r.id)} onMove={move} onResort={resort} onResortLikes={resortLikes} onAnnounce={setAnnouncing} onArchive={archive}
          onAddTask={canManage ? (assignee) => setAddingTask({ assignee }) : null} />
      ) : view === 'announce' ? (
        <AnnounceTab requests={filtered} people={people} canManage={canManage} busyId={busyId}
          onOpen={(r) => setOpenId(r.id)} onAnnounce={setAnnouncing} onArchive={archive} />
      ) : (
        <BacklogRequestsTab requests={scoped} people={people} assignees={assignees} canManage={canManage} me={me} busyId={busyId}
          search={search} onSearch={setSearch} openIds={openIds} onToggle={toggleRow} detailProps={detailHandlers}
          filterGroups={filterGroups} filter={filter} onFilterChange={setFilter} filtering={filterIsOn(filter)}
          sortValue={requestsSort} onSortChange={setRequestsSort} likeFor={likeFor} likesLeftText={likesLeftText} />
      )}

      {open && (
        <BacklogDrawer request={open} people={people} assignees={assignees} canManage={canManage} me={me} busy={busyId === open.id}
          onClose={() => setOpenId(null)} {...detailHandlers(open)} />
      )}

      {(addingTask || (editing && isTask(editing))) && (
        <TaskModal initial={addingTask ? null : editing} assignees={assignees} me={me} presetAssignee={addingTask?.assignee}
          onSave={saveTask} onClose={() => { setAddingTask(null); setEditing(null) }} />
      )}
      {editing && !isTask(editing) && (
        <NewRequestModal initial={editing === 'new' ? null : editing} assignees={assignees} showAssign={showAssignFor(editing)}
          onSave={saveRequest} onClose={() => setEditing(null)} />
      )}
      {denying && (
        <DenyDialog request={denying} onClose={() => setDenying(null)}
          onDeny={async (note) => {
            await act(denying, 'portal_request_review', { id: denying.id, decision: 'deny', note })
            closeRow(denying.id)
            setDenying(null)
            setArchiveKey((k) => k + 1)
            doneOnRequests('Denied: moved to the Archive.')
          }} />
      )}
      {capOpen && (
        <LikeCapDialog value={likeCap} onClose={() => setCapOpen(false)} onSave={saveLikeCap} />
      )}
      {announcing && (
        <AnnounceDialog request={announcing} onClose={() => setAnnouncing(null)}
          onAnnounce={async (announced_on, announce_note, release_importance) => {
            await act(announcing, 'portal_request_move', { id: announcing.id, progress: 'live', announced_on, announce_note, release_importance })
            setAnnouncing(null)
            setSuccess(`Marked as announced: "${announcing.title}" is now Live.`)
          }} />
      )}
    </div>
  )
}
