import { useState } from 'react'
import { callApi } from '../../lib/api'
import { getSession } from '../../lib/api'
import { VisibilityBadge, noteTint, SaveVisibilityButtons } from './NoteVisibility'
import { formatDate } from '../../lib/dates'

export function PhaseNotesButton({ count, isOpen, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--vfo-border-chip)', background: isOpen ? 'rgba(0,149,255,0.15)' : 'var(--vfo-tint)', color: isOpen ? '#0095ff' : 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
      Notes{count > 0 && <span style={{ background: '#0095ff', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600' }}>{count}</span>}
    </button>
  )
}

// `phaseName` is the phase notes are WRITTEN under. `phaseNames` optionally
// widens what's READ back, for a card that merges several stored phases into
// one thread (the tax track's Tax 5) — new notes still land on `phaseName`, but
// notes filed under the merged-away phase stay visible.
export function PhaseNotesPanel({ clientId, phaseName, phaseNames, tabName, programName, notes, onNotesChange }) {
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const session = getSession()

  const readPhases = (phaseNames && phaseNames.length) ? phaseNames : [phaseName]
  const phaseNotes = (notes || []).filter(n => readPhases.includes(n.phase_name) && n.tab_name === tabName)

  async function addNote(visibility) {
    if (!newNote.trim()) return
    setSaving(true)
    try {
      const result = await callApi('add_client_note', { client_id: clientId, phase_name: phaseName, tab_name: tabName, program_name: programName || null, note_text: newNote.trim(), created_by: session?.name || 'Admin', visibility })
      onNotesChange([result.note, ...notes])
      setNewNote('')
    } catch (err) { console.error(err) }
    finally { setSaving(false) }
  }

  async function updateNote(noteId, visibility) {
    if (!editText.trim()) return
    try {
      const result = await callApi('update_client_note', { note_id: noteId, note_text: editText.trim(), visibility })
      onNotesChange(notes.map(n => n.id === noteId ? result.note : n))
      setEditingId(null)
    } catch (err) { console.error(err) }
  }

  async function deleteNote(noteId) {
    try {
      await callApi('delete_client_note', { note_id: noteId })
      onNotesChange(notes.filter(n => n.id !== noteId))
    } catch (err) { console.error(err) }
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--vfo-border-chip)', padding: '12px 18px', background: 'var(--vfo-tint)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
        <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." rows={2} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
        <SaveVisibilityButtons onSave={addNote} saving={saving} disabled={!newNote.trim()} size="sm" />
      </div>
      {phaseNotes.length === 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', padding: '4px 0' }}>No notes yet</div>}
      {phaseNotes.map(note => (
        <div key={note.id} style={{ padding: '8px 10px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
          {editingId === note.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.4)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                <SaveVisibilityButtons onSave={(v) => updateNote(note.id, v)} disabled={!editText.trim()} size="sm" hint={false} />
                <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '4px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by} · {formatDate(note.created_at)}</span>
                <VisibilityBadge visibility={note.visibility} />
                <button onClick={() => { setEditingId(note.id); setEditText(note.note_text) }} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#0095ff', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Edit</button>
                <button onClick={() => deleteNote(note.id)} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Delete</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}