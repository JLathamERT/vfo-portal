import { useState } from 'react'
import { btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import BacklogModal, { errorText, fieldLabel, inputStyle } from './BacklogModal'
import { RELEASE_IMPORTANCE, todayLocal } from './backlogModel'

// Mark as announced (Backlog 5a): a Ready to announce item goes Live with the
// date it was announced (required, today by default, never in the future), an
// optional note and its Release importance (Backlog 5b, pre-set to the item's
// current level). Only superadmins ever see this dialog.
export default function AnnounceDialog({ request, onAnnounce, onClose }) {
  const today = todayLocal()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [importance, setImportance] = useState(request.release_importance || 'normal')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today && note.trim().length <= 1000 && !saving

  const submit = async () => {
    if (!ok) return
    setSaving(true); setError('')
    try { await onAnnounce(date, note.trim(), importance) } catch (e) { setError(e.message || 'Could not mark it as announced'); setSaving(false) }
  }

  return (
    <BacklogModal title="Mark as announced" onClose={onClose}
      footer={(
        <>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnState(btnPrimary, !ok)} disabled={!ok} onClick={submit}>{saving ? 'Saving…' : 'Mark as announced'}</button>
        </>
      )}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '14px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <strong style={{ color: 'var(--vfo-ink)' }}>{request.title}</strong>
        <div style={{ marginTop: '4px' }}>It moves to Live.</div>
      </div>
      <label style={fieldLabel} htmlFor="backlog-announced-on">Announced on</label>
      <input id="backlog-announced-on" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, maxWidth: '220px' }} />
      <label style={{ ...fieldLabel, marginTop: '14px' }} htmlFor="backlog-announce-note">Announcement note (optional)</label>
      <textarea id="backlog-announce-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, where it was announced" style={{ ...inputStyle, resize: 'vertical' }} />
      <label style={{ ...fieldLabel, marginTop: '14px' }} htmlFor="backlog-release-importance">Release importance</label>
      <select id="backlog-release-importance" value={importance} onChange={(e) => setImportance(e.target.value)} style={{ ...inputStyle, maxWidth: '220px' }}>
        {RELEASE_IMPORTANCE.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      {error && <div style={errorText}>{error}</div>}
    </BacklogModal>
  )
}
