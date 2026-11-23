import { useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../../lib/useMediaQuery'
import { btnSecondary } from '../../shared/buttonStyles'
import BacklogCard from './BacklogCard'
import { LANE_COLUMNS, PROGRESS_LABELS, bySortKey, isPool } from './backlogModel'

// The Tasks tab, per Paxton's sketch: Approved but unassigned on the left, the
// superadmin lanes (To do / Working on / Done) stacked in the middle, then the
// shared Ready to announce and Live pools (Live: Backlog 5a) on the right. Below
// 1280px the tall columns sit above and below the lanes, Live under Ready to
// announce; below 768px one lane shows at a time.
//
// Dragging a card into another column lets the server place it by priority; a
// drag up or down inside one column saves that position. A drag from Ready to
// announce into Live asks for the announced date first (the panel's move).
const colKey = (progress, assignee) => `${progress}:${isPool(progress) ? '' : (assignee ?? '')}`

// `onAddTask(assigneeId)` (superadmins, Backlog 4b / 4c): a "+" on each lane's
// To do opens the task form with that lane picked. `onAnnounce(r)` opens Mark as
// announced on a Ready to announce card; `onArchive(r)` archives a Live one.
export default function BacklogBoard({ requests, assignees, people, canManage, likeFor, onOpen, onMove, onResort, onResortLikes, onAnnounce, onArchive, onAddTask }) {
  const wide = useMediaQuery('(min-width: 1280px)')
  const tablet = useMediaQuery('(min-width: 768px)')
  const [laneId, setLaneId] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [indicator, setIndicator] = useState(null) // { key, index }

  const columns = useMemo(() => {
    const out = {}
    for (const r of requests) {
      if (r.review_status !== 'approved' || r.archived_at) continue
      const k = colKey(r.progress, r.assignee_admin_id)
      ;(out[k] ||= []).push(r)
    }
    for (const k of Object.keys(out)) out[k].sort(bySortKey)
    return out
  }, [requests])

  const dragged = draggingId != null ? requests.find((r) => r.id === draggingId) : null

  const drop = (progress, assignee, index) => {
    if (!dragged) return
    const key = colKey(progress, assignee)
    const fromKey = colKey(dragged.progress, dragged.assignee_admin_id)
    if (key !== fromKey) {
      if (progress !== 'todo' && !isPool(progress) && assignee == null) return
      onMove(dragged, progress, assignee, {})
      return
    }
    const others = (columns[key] || []).filter((r) => r.id !== dragged.id)
    const was = (columns[key] || []).findIndex((r) => r.id === dragged.id)
    if (index === was) return
    if (index < others.length) onMove(dragged, progress, assignee, { before_id: others[index].id })
    else if (others.length) onMove(dragged, progress, assignee, { after_id: others[others.length - 1].id })
  }

  const columnProps = (progress, assignee, title, extra = {}) => {
    const key = colKey(progress, assignee)
    return {
      key, colId: key, title, cards: columns[key] || [], people, canManage, likeFor, onOpen,
      draggingId, setDraggingId, indicator, setIndicator,
      onDropAt: (index) => drop(progress, assignee, index),
      onResort: canManage ? () => onResort(progress, assignee) : null,
      onResortLikes: canManage && onResortLikes ? () => onResortLikes(progress, assignee) : null,
      ...extra,
    }
  }

  // At 1280px and up Approved but unassigned is two columns wide (its cards two
  // across), so the board's two ends match: it is as wide as Ready to announce +
  // Live together (Paxton 2026-11-23).
  const unassigned = <Column {...columnProps('todo', null, 'Approved but unassigned')} tall={wide} twoCol={wide} />
  const footerBtn = { ...btnSecondary, padding: '5px 12px', fontSize: '12px' }
  const ready = (
    <Column {...columnProps('ready_to_announce', null, 'Ready to announce')} tall={wide} showDoneBy
      cardFooter={canManage ? (r) => (
        <button style={footerBtn} onClick={() => onAnnounce(r)}>Mark as announced</button>
      ) : null} />
  )
  const live = (
    <Column {...columnProps('live', null, 'Live')} tall={wide} showDoneBy
      cardFooter={canManage ? (r) => (
        <button style={footerBtn} onClick={() => onArchive(r)}>Archive</button>
      ) : null} />
  )

  const activeLane = assignees.find((a) => a.admin_id === laneId) || assignees[0]
  const lanes = (tablet ? assignees : (activeLane ? [activeLane] : [])).map((a) => (
    <div key={a.admin_id} style={{ background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', padding: '12px', minWidth: 0 }}>
      {tablet && <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--vfo-ink)', margin: '2px 4px 12px' }}>{a.name}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: tablet ? 'repeat(3, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: '12px' }}>
        {LANE_COLUMNS.map((p) => (
          <Column {...columnProps(p, a.admin_id, PROGRESS_LABELS[p])} inLane
            onAdd={p === 'todo' && onAddTask ? () => onAddTask(a.admin_id) : null} />
        ))}
      </div>
    </div>
  ))

  const lanePicker = !tablet && assignees.length > 1 && (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {assignees.map((a) => {
        const sel = activeLane?.admin_id === a.admin_id
        return (
          <button key={a.admin_id} onClick={() => setLaneId(a.admin_id)}
            style={{ padding: '7px 14px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              background: sel ? 'var(--vfo-primary)' : 'var(--vfo-card)', color: sel ? '#ffffff' : 'var(--vfo-muted)', border: `1px solid ${sel ? 'var(--vfo-primary)' : 'var(--vfo-border-soft)'}` }}>
            {a.name}
          </button>
        )
      })}
    </div>
  )

  if (wide) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', alignItems: 'stretch' }}>
        {unassigned}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>{lanes}</div>
        {ready}
        {live}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      {unassigned}
      {lanePicker}
      {lanes}
      {ready}
      {live}
    </div>
  )
}

const sortLink = { background: 'transparent', border: 'none', padding: 0, fontSize: '12px', fontWeight: 700, color: 'var(--vfo-link)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }

// `twoCol`: the cards sit two across (Approved but unassigned on a wide board).
// A drop there lands before the card under the pointer's row and side, and the
// column's border lights up instead of the between-cards line.
function Column({ colId, title, cards, people, canManage, likeFor, onOpen, draggingId, setDraggingId, indicator, setIndicator, onDropAt, onResort, onResortLikes, tall, inLane, showDoneBy, cardFooter, onAdd, twoCol }) {
  const listRef = useRef(null)
  const over = indicator?.key === colId

  const indexAt = (clientX, clientY) => {
    const els = [...(listRef.current?.querySelectorAll('[data-request-id]') || [])]
      .filter((el) => Number(el.dataset.requestId) !== draggingId)
    const i = els.findIndex((el) => {
      const b = el.getBoundingClientRect()
      if (!twoCol) return clientY < b.top + b.height / 2
      return clientY < b.top || (clientY <= b.bottom && clientX < b.left + b.width / 2)
    })
    return i === -1 ? els.length : i
  }

  const dropProps = canManage ? {
    onDragOver: (e) => {
      if (draggingId == null) return
      e.preventDefault()
      const index = indexAt(e.clientX, e.clientY)
      if (!over || indicator.index !== index) setIndicator({ key: colId, index })
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIndicator(null) },
    onDrop: (e) => {
      e.preventDefault()
      const index = indexAt(e.clientX, e.clientY)
      setIndicator(null)
      onDropAt(index)
      setDraggingId(null)
    },
  } : {}

  const visible = cards.filter((c) => c.id !== draggingId)
  const line = twoCol ? null : <div style={{ height: '3px', borderRadius: '2px', background: 'var(--vfo-primary)', margin: '-3px 0' }} />

  return (
    <div {...dropProps}
      style={{
        background: inLane ? 'var(--vfo-card)' : 'var(--vfo-tint)', border: `1px solid ${over ? 'var(--vfo-primary)' : 'var(--vfo-border-soft)'}`,
        borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0,
        minHeight: tall ? '100%' : '90px', boxSizing: 'border-box',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
          <span style={{ fontSize: '12.5px', fontWeight: 800, color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{title}</span>
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '1px 9px', borderRadius: '999px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{cards.length}</span>
          {onAdd && (
            <button type="button" onClick={onAdd} title="Add a task here" aria-label="Add a task here"
              style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-link)', fontSize: '16px', fontWeight: 700, lineHeight: 1, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, fontFamily: 'Inter, sans-serif' }}>
              +
            </button>
          )}
        </span>
        {onResort && cards.length > 1 && (
          <span style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap' }}>
            <button onClick={onResort} title="Put this column back in urgency + importance order" style={sortLink}>
              Sort by priority
            </button>
            {/* Backlog 7c: a one-time re-order; later likes don't move cards. */}
            {onResortLikes && (
              <button onClick={onResortLikes} title="Put this column in order of most likes" style={sortLink}>
                Sort by likes
              </button>
            )}
          </span>
        )}
      </div>
      <div ref={listRef} style={twoCol
        ? { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px', alignItems: 'start', minWidth: 0 }
        : { display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
        {visible.length === 0 && !over && <div style={{ fontSize: '13px', color: 'var(--vfo-faint)', padding: '8px 2px', gridColumn: '1 / -1' }}>Nothing here</div>}
        {/* The dragged card stays on the page, only hidden: a drop outside every
            column still ends the drag on it (dragend), so it snaps back. Taking it
            off the page lost that event and the card vanished until a reload. */}
        {cards.map((r) => {
          const hidden = r.id === draggingId
          const i = hidden ? -1 : visible.indexOf(r)
          return (
            <div key={r.id} style={{ display: hidden ? 'none' : 'flex', flexDirection: 'column', gap: '10px' }}>
              {!hidden && over && indicator.index === i && line}
              <BacklogCard request={r} people={people} onOpen={onOpen} showDoneBy={showDoneBy}
                draggable={canManage} like={likeFor ? likeFor(r) : null}
                onDragStart={(e, req) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(req.id)); setTimeout(() => setDraggingId(req.id), 0) }}
                onDragEnd={() => { setDraggingId(null); setIndicator(null) }}
                footer={cardFooter ? cardFooter(r) : null} />
            </div>
          )
        })}
        {over && indicator.index >= visible.length && line}
      </div>
    </div>
  )
}
