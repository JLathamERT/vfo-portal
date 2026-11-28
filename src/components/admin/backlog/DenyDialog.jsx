import { useState } from 'react'
import { btnDanger, btnSecondary, btnState } from '../../shared/buttonStyles'
import Modal, { errorText, fieldLabel, inputStyle } from '../../shared/Modal'

// Deny needs a reason; the requester sees it in their bell and the drawer.
export default function DenyDialog({ request, onDeny, onClose }) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const ok = note.trim().length > 0 && note.trim().length <= 1000 && !saving

  const submit = async () => {
    if (!ok) return
    setSaving(true); setError('')
    try { await onDeny(note.trim()) } catch (e) { setError(e.message || 'Could not deny the request'); setSaving(false) }
  }

  return (
    <Modal title="Deny request" onClose={onClose}
      footer={(
        <>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnState(btnDanger, !ok)} disabled={!ok} onClick={submit}>{saving ? 'Denying…' : 'Deny request'}</button>
        </>
      )}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '12px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        <strong style={{ color: 'var(--vfo-ink)' }}>{request.title}</strong> · {request.requester_name}
      </div>
      <label style={fieldLabel} htmlFor="backlog-deny-reason">Reason (required)</label>
      <textarea id="backlog-deny-reason" rows={4} value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
      {error && <div style={errorText}>{error}</div>}
    </Modal>
  )
}
