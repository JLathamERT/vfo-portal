import { useState } from 'react'
import { btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import BacklogModal, { errorText, fieldLabel, inputStyle } from './BacklogModal'
import { todayLocal } from './backlogModel'

// Archive a Ready to announce request: the date it was announced (required,
// today by default, never in the future) and an optional note.
export default function ArchiveDialog({ request, onArchive, onClose }) {
  const today = todayLocal()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today && note.trim().length <= 1000 && !saving

  const submit = async () => {
    if (!ok) return
    setSaving(true); setError('')
    try { await onArchive(date, note.trim()) } catch (e) { setError(e.message || 'Could not archive the request'); setSaving(false) }
  }

  return (
    <BacklogModal title="Archive request" onClose={onClose}
      footer={(
        <>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnState(btnPrimary, !ok)} disabled={!ok} onClick={submit}>{saving ? 'Archiving…' : 'Archive'}</button>
        </>
      )}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '14px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <strong style={{ color: 'var(--vfo-ink)' }}>{request.title}</strong>
      </div>
      <label style={fieldLabel} htmlFor="backlog-announced-on">Announced on</label>
      <input id="backlog-announced-on" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, maxWidth: '220px' }} />
      <label style={{ ...fieldLabel, marginTop: '14px' }} htmlFor="backlog-announce-note">Announcement note (optional)</label>
      <textarea id="backlog-announce-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, where it was announced" style={{ ...inputStyle, resize: 'vertical' }} />
      {error && <div style={errorText}>{error}</div>}
    </BacklogModal>
  )
}
