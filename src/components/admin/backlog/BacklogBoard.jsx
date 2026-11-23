import { useMemo, useRef, useState } from 'react'
import { useMediaQuery } from '../../../lib/useMediaQuery'
import { btnSecondary } from '../../shared/buttonStyles'
import BacklogCard from './BacklogCard'
import { LANE_COLUMNS, PROGRESS_LABELS, bySortKey } from './backlogModel'

// The Tasks tab, per Paxton's sketch: Approved but unassigned on the left, the
// superadmin lanes (To do / Working on / Done) stacked in the middle, the shared
// Ready to announce pool on the right. Below 1280px the two tall columns sit
// above and below the lanes; below 768px one lane shows at a time.
//
// Dragging a card into another column lets the server place it by priority; a
// drag up or down inside one column saves that position.
const colKey = (progress, assignee) => `${progress}:${progress === 'ready_to_announce' ? '' : (assignee ?? '')}`

// `onAddTask(assigneeId)` (superadmins, Backlog 4b / 4c): a "+" on each lane's
// To do opens the task form with that lane picked.
export default function BacklogBoard({ requests, assignees, people, canManage, onOpen, onMove, onResort, onArchive, onAddTask }) {
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
      if (progress !== 'todo' && progress !== 'ready_to_announce' && assignee == null) return
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
      key, colId: key, title, cards: columns[key] || [], people, canManage, onOpen,
      draggingId, setDraggingId, indicator, setIndicator,
      onDropAt: (index) => drop(progress, assignee, index),
      onResort: canManage ? () => onResort(progress, assignee) : null,
      ...extra,
    }
  }

  const unassigned = <Column {...columnProps('todo', null, 'Approved but unassigned')} tall={wide} />
  const ready = (
    <Column {...columnProps('ready_to_announce', null, 'Ready to announce')} tall={wide} showDoneBy
      cardFooter={canManage ? (r) => (
        <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px' }} onClick={() => onArchive(r)}>Archive</button>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr)', gap: '16px', alignItems: 'stretch' }}>
        {unassigned}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>{lanes}</div>
        {ready}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
      {unassigned}
      {lanePicker}
      {lanes}
      {ready}
    </div>
  )
}

function Column({ colId, title, cards, people, canManage, onOpen, draggingId, setDraggingId, indicator, setIndicator, onDropAt, onResort, tall, inLane, showDoneBy, cardFooter, onAdd }) {
  const listRef = useRef(null)
  const over = indicator?.key === colId

  const indexAt = (clientY) => {
    const els = [...(listRef.current?.querySelectorAll('[data-request-id]') || [])]
      .filter((el) => Number(el.dataset.requestId) !== draggingId)
    const i = els.findIndex((el) => { const b = el.getBoundingClientRect(); return clientY < b.top + b.height / 2 })
    return i === -1 ? els.length : i
  }

  const dropProps = canManage ? {
    onDragOver: (e) => {
      if (draggingId == null) return
      e.preventDefault()
      const index = indexAt(e.clientY)
      if (!over || indicator.index !== index) setIndicator({ key: colId, index })
    },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setIndicator(null) },
    onDrop: (e) => {
      e.preventDefault()
      const index = indexAt(e.clientY)
      setIndicator(null)
      onDropAt(index)
      setDraggingId(null)
    },
  } : {}

  const visible = cards.filter((c) => c.id !== draggingId)
  const line = <div style={{ height: '3px', borderRadius: '2px', background: 'var(--vfo-primary)', margin: '-3px 0' }} />

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
          <button onClick={onResort} title="Put this column back in urgency + importance order"
            style={{ background: 'transparent', border: 'none', padding: 0, fontSize: '12px', fontWeight: 700, color: 'var(--vfo-link)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Sort by priority
          </button>
        )}
      </div>
      <div ref={listRef} style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }}>
        {visible.length === 0 && !over && <div style={{ fontSize: '13px', color: 'var(--vfo-faint)', padding: '8px 2px' }}>Nothing here</div>}
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
                draggable={canManage}
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
