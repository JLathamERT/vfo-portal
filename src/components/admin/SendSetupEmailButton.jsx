import { useState } from 'react'
import { callApi } from '../../lib/api'
import { btnPrimary, btnState } from '../shared/buttonStyles'

// Admin "Send account-setup email" button — drafts a Gmail with a /set-password
// link so the person chooses their own passcode. Used in the member, specialist,
// and client Settings tabs. Creates a DRAFT (admin reviews + sends from Gmail).
export default function SendSetupEmailButton({ loginType, subjectId, hint }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { ok, text }

  async function send() {
    setBusy(true); setMsg(null)
    try {
      const d = await callApi('send_login_setup_email', { login_type: loginType, subject_id: subjectId })
      if (d.success) setMsg({ ok: true, text: `Setup email drafted to ${d.email}. Review and send it from Gmail.` })
      else setMsg({ ok: false, text: d.error || 'Could not draft the email.' })
    } catch (e) { setMsg({ ok: false, text: e.message || 'Could not draft the email.' }) }
    setBusy(false)
  }

  return (
    <div>
      <button onClick={send} disabled={busy} style={btnState(btnPrimary, busy)}>
        {busy ? 'Drafting…' : 'Send account-setup email'}
      </button>
      {hint && <p style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '10px', marginBottom: 0 }}>{hint}</p>}
      {msg && <p style={{ fontSize: '13px', marginTop: '10px', marginBottom: 0, color: msg.ok ? '#1f9d55' : '#d93025' }}>{msg.text}</p>}
    </div>
  )
}
