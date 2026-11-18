import { departmentChipStyle } from './portalDepartments'
import { fmtDate } from './backlogModel'
import ScorePill from './ScorePill'

// One request on the board or in a list, Workbench style: the title, who asked
// and when, then the key pills (departments, urgency, importance). The
// description and everything else live in the drawer.
export default function BacklogCard({ request: r, people, onOpen, draggable, onDragStart, onDragEnd, dragging, showDoneBy, footer }) {
  const requestedFor = r.review_status === 'pending' && r.requested_assignee_admin_id != null
    ? people[r.requested_assignee_admin_id] : null
  const doneBy = showDoneBy && r.assignee_admin_id != null ? people[r.assignee_admin_id] : null
  const needsWriteup = r.review_status === 'approved' && !r.archived_at && r.progress === 'done' && !String(r.announcement || '').trim()
  return (
    <div
      data-request-id={r.id}
      draggable={draggable || undefined}
      onDragStart={draggable ? (e) => onDragStart?.(e, r) : undefined}
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
      <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)', lineHeight: 1.35, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{r.title}</div>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', fontWeight: 600, marginTop: '5px', overflowWrap: 'anywhere' }}>
        {r.requester_name} · {fmtDate(r.requested_on)}
      </div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '10px' }}>
        {(r.departments || []).map((d) => <span key={d} style={departmentChipStyle(d)}>{d}</span>)}
        <ScorePill label="Urgency" value={r.urgency} />
        <ScorePill label="Importance" value={r.importance} />
      </div>
      {(requestedFor || doneBy || needsWriteup) && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '9px' }}>
          {requestedFor && <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600 }}>Requested for: {requestedFor}</span>}
          {doneBy && <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', fontWeight: 600 }}>Done by {doneBy}</span>}
          {needsWriteup && <span style={{ fontSize: '12.5px', color: '#c98a14', fontWeight: 700 }}>Needs its write-up</span>}
        </div>
      )}
      {footer && <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '9px' }}>{footer}</div>}
    </div>
  )
}
