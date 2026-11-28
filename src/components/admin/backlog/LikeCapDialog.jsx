import { useState } from 'react'
import { btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import Modal, { errorText, fieldLabel, inputStyle } from '../../shared/Modal'

// Backlog 7b (superadmins): how many likes each person can have on open
// requests. Lowering it removes nobody's likes.
export default function LikeCapDialog({ value, onSave, onClose }) {
  const [cap, setCap] = useState(String(value || 5))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const n = Number(cap)
  const ok = /^\d+$/.test(cap.trim()) && n >= 1 && n <= 20 && !saving

  const submit = async () => {
    if (!ok) return
    setSaving(true); setError('')
    try { await onSave(n) } catch (e) { setError(e.message || 'Could not save'); setSaving(false) }
  }

  return (
    <Modal title="Likes per person" onClose={onClose} width={420}
      footer={(
        <>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnState(btnPrimary, !ok)} disabled={!ok} onClick={submit}>{saving ? 'Saving…' : 'Save'}</button>
        </>
      )}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
        Each person, you included, can like this many requests that are waiting for review, in To do or in Working on. A like comes back once its request is done.
      </div>
      <label style={fieldLabel} htmlFor="backlog-like-cap">Likes per person (1 to 20)</label>
      <input id="backlog-like-cap" type="number" min={1} max={20} step={1} value={cap}
        onChange={(e) => setCap(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        style={{ ...inputStyle, width: '120px' }} />
      {error && <div style={errorText}>{error}</div>}
    </Modal>
  )
}
