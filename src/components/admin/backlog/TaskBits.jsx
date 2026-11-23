import { isOverdue, fmtDue } from './backlogModel'

// A superadmin task (Backlog 4a): the solid navy "Task" tag, and its due-date
// chip, which turns red with "Overdue" once the date has passed (until the task
// reaches Ready to announce or the archive).
export function TaskTag({ size = 'sm' }) {
  const big = size === 'md'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px', whiteSpace: 'nowrap', verticalAlign: 'middle',
      padding: big ? '3px 10px' : '2px 8px', fontSize: big ? '11.5px' : '11px', fontWeight: 800, letterSpacing: '0.3px', lineHeight: 1.4,
      background: '#002973', border: '1px solid #002973', color: '#ffffff',
    }}>
      Task
    </span>
  )
}

export function DueChip({ request: r, size = 'sm' }) {
  if (!r?.due_on) return null
  const late = isOverdue(r)
  const big = size === 'md'
  return (
    <span title={late ? 'Past its due date' : 'Due date'} style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px', whiteSpace: 'nowrap',
      padding: big ? '4px 11px' : '3px 10px', fontSize: big ? '12.5px' : '12px', fontWeight: 700, lineHeight: 1.4,
      background: late ? 'rgba(231,76,60,0.12)' : 'var(--vfo-tint)',
      border: `1px solid ${late ? 'rgba(231,76,60,0.45)' : 'var(--vfo-border-chip)'}`,
      color: late ? '#e74c3c' : 'var(--vfo-muted)',
    }}>
      {late ? `Overdue · ${fmtDue(r.due_on)}` : `Due ${fmtDue(r.due_on)}`}
    </span>
  )
}
