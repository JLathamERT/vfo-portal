import { useRef } from 'react'
import { departmentChipStyle } from './portalDepartments'
import { isTask } from './backlogModel'
import ScorePill from './ScorePill'
import { DueChip, TaskTag } from './TaskBits'
import { ReleaseImportancePill } from './BigNewsBadge'
import LikeButton from './LikeButton'
import { formatDate } from '../../../lib/dates'

// One request on the board or in a list, Workbench style: the title, who asked
// and when, then the key pills (departments, urgency, importance). The
// description and everything else live in the drawer. A task (Backlog 4a) has
// its Task tag before the title and a due-date chip in place of the scores.
export default function BacklogCard({ request: r, people, onOpen, draggable, onDragStart, onDragEnd, dragging, showDoneBy, footer, like }) {
  const task = isTask(r)
  const requestedFor = r.review_status === 'pending' && r.requested_assignee_admin_id != null
    ? people[r.requested_assignee_admin_id] : null
  const doneBy = showDoneBy && r.assignee_admin_id != null ? people[r.assignee_admin_id] : null
  // A task someone else gave you (Backlog 4c).
  const from = task && r.requester_admin_id !== r.assignee_admin_id
    ? (people[r.requester_admin_id] || 'a former admin') : null
  const needsWriteup = !task && r.review_status === 'approved' && !r.archived_at && r.progress === 'done' && !String(r.announcement || '').trim()
  const liveOn = r.progress === 'live' && r.live_at ? formatDate(String(r.live_at).slice(0, 10), '–') : null
  // A press on the like button never starts a drag of the card (Backlog 7a).
  const pressOnButton = useRef(false)
  return (
    <div
      data-request-id={r.id}
      draggable={draggable || undefined}
      onPointerDownCapture={(e) => { pressOnButton.current = !!e.target.closest?.('[data-no-drag]') }}
      onDragStart={draggable ? (e) => { if (pressOnButton.current) { e.preventDefault(); return } onDragStart?.(e, r) } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onOpen(r)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(r) }}
      role="button"
      tabIndex={0}
      style={{
        background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(20,45,95,0.06)', padding: '14px 15px', cursor: draggable ? 'grab' : 'pointer',
        opacity: dragging ? 0.45 : 1, minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' }}>
        {task && <TaskTag />}
        <ReleaseImportancePill request={r} />
        {like && <span style={{ marginLeft: 'auto' }}><LikeButton {...like} /></span>}
      </div>
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)', lineHeight: 1.35, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{r.title}</div>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontWeight: 600, marginTop: '5px', overflowWrap: 'anywhere' }}>
        {r.requester_name} · {formatDate(r.requested_on, '–')}
      </div>
      {(!task || (r.departments || []).length > 0 || r.due_on) && (
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '10px' }}>
          {(r.departments || []).map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}
          {task ? <DueChip request={r} /> : (
            <>
              <ScorePill label="Urgency" value={r.urgency} />
              <ScorePill label="Importance" value={r.importance} />
            </>
          )}
        </div>
      )}
      {(requestedFor || from || doneBy || needsWriteup || liveOn) && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '9px' }}>
          {requestedFor && <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600 }}>Requested for: {requestedFor}</span>}
          {from && <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600 }}>From {from}</span>}
          {doneBy && <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600 }}>Done by {doneBy}</span>}
          {liveOn && <span style={{ fontSize: '12.5px', color: '#0e8a8a', fontWeight: 700 }}>Live {liveOn}</span>}
          {needsWriteup && <span style={{ fontSize: '12.5px', color: '#c98a14', fontWeight: 700 }}>Needs its write-up</span>}
        </div>
      )}
      {footer && <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '9px' }}>{footer}</div>}
    </div>
  )
}
