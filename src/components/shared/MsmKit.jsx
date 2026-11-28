import { VisibilityBadge, noteTint } from './NoteVisibility'
import { btnDanger, BTN_SMALL } from './buttonStyles'
import { formatDate } from '../../lib/dates'

// The MSM Home pieces shared by the admin's and the member's view (2026-11-26), so
// the two read the same.

const tile = { background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '11px 14px' }

// Meeting History: one tile per meeting, the type, then date and who ran it, then
// the note. `onDelete` (admin) adds a Delete button; `showVisibility` the note's
// Internal / Shared badge.
export function MeetingHistoryList({ meetings, onDelete, showVisibility = false }) {
  if (!meetings.length) return <div style={{ color: 'var(--vfo-muted)', fontSize: '13.5px' }}>No meetings logged yet.</div>
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {meetings.map(m => (
        <div key={m.id} style={{ ...tile, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {m.meeting_type}
              {showVisibility && m.notes && <VisibilityBadge visibility={m.visibility} />}
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px' }}>
              {formatDate(m.meeting_date)}{m.conducted_by ? ` · ${m.conducted_by}` : ''}
            </div>
            {m.notes && <div style={{ fontSize: '13px', color: 'var(--vfo-ink-2)', marginTop: '6px', lineHeight: 1.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.notes}</div>}
          </div>
          {onDelete && (
            <button type="button" onClick={() => onDelete(m.id)} style={{ ...btnDanger, ...BTN_SMALL, flexShrink: 0 }}>Delete</button>
          )}
        </div>
      ))}
    </div>
  )
}

// A tile you click to open something (the member's programs): name, then a chevron.
export function LinkTile({ children, onClick }) {
  return (
    <button type="button" onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,149,255,0.45)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(20,45,95,0.10)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--vfo-border-soft)'; e.currentTarget.style.boxShadow = 'none' }}
      style={{ ...tile, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--vfo-link)', transition: 'border-color 120ms ease, box-shadow 120ms ease' }}>
      <span style={{ minWidth: 0 }}>{children}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}><polyline points="9 6 15 12 9 18" /></svg>
    </button>
  )
}

// Program Notes, every program's notes in one list (2026-11-26, Jake: program
// notes live on the MSM Home, general notes on the profile). Admin: all notes,
// tinted and badged Internal / Shared. Member: the shared ones the server sends.
// `hideProgram` drops the program pill when the list is one program's own.
export function ProgramNotesList({ notes, showVisibility = false, hideProgram = false, emptyText = 'No program notes yet.' }) {
  if (!notes.length) return <div style={{ color: 'var(--vfo-muted)', fontSize: '13.5px' }}>{emptyText}</div>
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {notes.map(note => (
        <div key={note.id} style={{ ...tile, background: showVisibility ? noteTint(note.visibility) : tile.background }}>
          <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', lineHeight: 1.55, marginBottom: '6px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{note.note_text}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--vfo-muted)' }}>
            <span>{note.created_by}</span>
            <span>·</span>
            <span>{formatDate(note.created_at)}</span>
            {note.program_name && !hideProgram && <span style={{ fontSize: '10.5px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(0,149,255,0.12)', color: 'var(--vfo-accent-text)', fontWeight: 600 }}>{note.program_name}</span>}
            {showVisibility && <VisibilityBadge visibility={note.visibility} />}
          </div>
        </div>
      ))}
    </div>
  )
}
