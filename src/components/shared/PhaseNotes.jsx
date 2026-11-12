import { useState } from 'react'
import { callApi } from '../../lib/api'
import { getSession } from '../../lib/api'
import { VisibilityBadge, noteTint, SaveVisibilityButtons, MemberBadge, isMemberNote } from './NoteVisibility'
import { formatDate } from '../../lib/dates'

export function PhaseNotesButton({ count, isOpen, onClick }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick() }} style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--vfo-border-chip)', background: isOpen ? 'rgba(0,149,255,0.15)' : 'var(--vfo-tint)', color: isOpen ? '#0095ff' : 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
      Notes{count > 0 && <span style={{ background: '#0095ff', color: '#fff', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '600' }}>{count}</span>}
    </button>
  )
}

// A note written inside ONE Regular Priority / ONE tax plan carries its id
// (client_notes.priority_track_id / tax_plan_id, 2026-10-02); `scope` is
// { priority_track_id: id } or { tax_plan_id: id }. In scope = that same id, or
// NO id at all (a note from before the change shows everywhere, by decision).
// Counts and panels must both use this, so the badge matches the list.
export function noteInScope(note, scope) {
  if (!scope) return true
  return Object.entries(scope).every(([key, id]) => note[key] == null || String(note[key]) === String(id))
}

// `phaseName` is the phase notes are WRITTEN under. `phaseNames` optionally
// widens what's READ back, for a card that merges several stored phases into
// one thread (the tax track's Tax 5) — new notes still land on `phaseName`, but
// notes filed under the merged-away phase stay visible.
//
// `memberMode` (the member portal, 2026-11-12): the member reads the team's
// shared notes (the only ones the member loader returns) and adds their own,
// which always go to the team (member_client_note_*). They edit / delete only
// notes they wrote. `canAdd` false (a mirrored client, a Tier 1 member) shows the
// thread without the add box; the server refuses those writes anyway. On the
// admin side a member's note carries the Member tag and can be deleted, never
// edited.
export function PhaseNotesPanel({ clientId, phaseName, phaseNames, tabName, programName, notes, onNotesChange, scope = null, memberMode = false, canAdd = true }) {
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [error, setError] = useState('')
  const session = getSession()

  const readPhases = (phaseNames && phaseNames.length) ? phaseNames : [phaseName]
  const phaseNotes = (notes || []).filter(n => readPhases.includes(n.phase_name) && n.tab_name === tabName && noteInScope(n, scope))

  const ownNote = (note) => isMemberNote(note) && String(note.author_member_number ?? '') === String(session?.member_number ?? '')
  const canEdit = (note) => memberMode ? ownNote(note) : !isMemberNote(note)
  const canDelete = (note) => memberMode ? ownNote(note) : true

  async function addNote(visibility) {
    if (!newNote.trim()) return
    setSaving(true)
    setError('')
    try {
      const base = { client_id: clientId, phase_name: phaseName, tab_name: tabName, program_name: programName || null, note_text: newNote.trim(), ...(scope || {}) }
      const result = memberMode
        ? await callApi('member_client_note_add', base)
        : await callApi('add_client_note', { ...base, created_by: session?.name || 'Admin', visibility })
      onNotesChange([result.note, ...notes])
      setNewNote('')
    } catch (err) { console.error(err); setError(err.message || 'Your note was not saved. Try again.') }
    finally { setSaving(false) }
  }

  async function updateNote(noteId, visibility) {
    if (!editText.trim()) return
    setError('')
    try {
      const result = memberMode
        ? await callApi('member_client_note_update', { note_id: noteId, note_text: editText.trim() })
        : await callApi('update_client_note', { note_id: noteId, note_text: editText.trim(), visibility })
      onNotesChange(notes.map(n => n.id === noteId ? result.note : n))
      setEditingId(null)
    } catch (err) { console.error(err); setError(err.message || 'Your change was not saved. Try again.') }
  }

  async function deleteNote(noteId) {
    setError('')
    try {
      await callApi(memberMode ? 'member_client_note_delete' : 'delete_client_note', { note_id: noteId })
      onNotesChange(notes.filter(n => n.id !== noteId))
    } catch (err) { console.error(err); setError(err.message || 'The note was not deleted. Try again.') }
  }

  return (
    <div onClick={e => e.stopPropagation()} style={{ borderTop: '1px solid var(--vfo-border-chip)', padding: '12px 18px', background: 'var(--vfo-tint)' }}>
      {canAdd ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
          <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add a note..." rows={2} style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
          {memberMode
            ? <MemberSaveButton onSave={() => addNote('shared')} saving={saving} disabled={!newNote.trim()} hint="Your note is visible to the VFO team." />
            : <SaveVisibilityButtons onSave={addNote} saving={saving} disabled={!newNote.trim()} size="sm" />}
        </div>
      ) : (
        <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginBottom: '8px' }}>View only. Notes from the client's team are shown below.</div>
      )}
      {error && <div style={{ fontSize: '12px', color: '#e74c3c', marginBottom: '8px' }}>{error}</div>}
      {phaseNotes.length === 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', padding: '4px 0' }}>No notes yet</div>}
      {phaseNotes.map(note => (
        <div key={note.id} style={{ padding: '8px 10px', marginBottom: '4px', borderRadius: '8px', border: '1px solid var(--vfo-border-soft)', background: noteTint(note.visibility) }}>
          {editingId === note.id ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(0,149,255,0.4)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', resize: 'vertical' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                {memberMode
                  ? <MemberSaveButton onSave={() => updateNote(note.id)} disabled={!editText.trim()} label="Save" />
                  : <SaveVisibilityButtons onSave={(v) => updateNote(note.id, v)} disabled={!editText.trim()} size="sm" hint={false} />}
                <button onClick={() => setEditingId(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '13px', color: 'var(--vfo-ink)', lineHeight: '1.5', marginBottom: '4px', whiteSpace: 'pre-wrap' }}>{note.note_text}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>{note.created_by} · {formatDate(note.created_at)}</span>
                {isMemberNote(note) ? <MemberBadge /> : !memberMode && <VisibilityBadge visibility={note.visibility} />}
                {canEdit(note) && <button onClick={() => { setEditingId(note.id); setEditText(note.note_text) }} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#0095ff', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Edit</button>}
                {canDelete(note) && <button onClick={() => deleteNote(note.id)} style={{ padding: '2px 8px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '11px', cursor: 'pointer' }}>Delete</button>}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  )
}

// The member's one save button: their notes always go to the team. Same green
// as SaveVisibilityButtons' shared button.
function MemberSaveButton({ onSave, saving = false, disabled = false, label = 'Save note', hint = null }) {
  const off = saving || disabled
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div>
        <button onClick={onSave} disabled={off}
          style={{ padding: '6px 12px', borderRadius: '8px', background: off ? 'rgba(27,146,84,0.4)' : 'linear-gradient(135deg, #1b9254 0%, #23b268 100%)', border: 'none', boxShadow: off ? 'none' : '0 2px 8px rgba(27,146,84,0.28)', color: '#fff', fontSize: '11px', cursor: off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
          {saving ? 'Saving...' : label}
        </button>
      </div>
      {hint && <span style={{ fontSize: '10.5px', color: 'var(--vfo-faint)' }}>{hint}</span>}
    </div>
  )
}