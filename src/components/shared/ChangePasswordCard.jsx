import { useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import PasswordInput from './PasswordInput'

// Self-service change-passcode card for the specialist, client and tax-planner
// portals. The action (specialist_update_login / client_update_login /
// tax_planner_update_login) is scoped server-side to the caller's own session —
// the body carries only the new passcode.
//
// It is a real <form> with a submit button and a clip-hidden readOnly username
// field on purpose: a password manager cannot offer to UPDATE a saved entry for
// a form it can't identify, so it keeps re-filling the old passcode after a
// change. See gotcha #354.
export default function ChangePasswordCard({ action }) {
  const [passcode, setPasscode] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  async function save(e) {
    e.preventDefault()
    if (passcode.length < 6) { setMsg({ ok: false, text: 'Passcode must be at least 6 characters.' }); return }
    if (passcode !== confirm) { setMsg({ ok: false, text: 'Passcodes do not match.' }); return }
    setBusy(true); setMsg(null)
    try {
      const d = await callApi(action, { passcode })
      if (d.success) { setMsg({ ok: true, text: 'Passcode updated.' }); setPasscode(''); setConfirm('') }
      else setMsg({ ok: false, text: d.error || 'Could not update.' })
    } catch (e) { setMsg({ ok: false, text: e.message || 'Could not update.' }) }
    setBusy(false)
  }

  return (
    <form onSubmit={save} style={{ maxWidth: '460px', margin: '0 auto', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', padding: '24px' }}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Change Passcode</div>
      <input id="username" name="email" autoComplete="username" type="email" value={getSession()?.email || ''} readOnly tabIndex={-1} style={hiddenFieldStyle} />
      <label style={labelStyle}>New Passcode (min 6 characters)</label>
      <PasswordInput id="new-password" name="new-password" value={passcode} onChange={e => setPasscode(e.target.value)} autoComplete="new-password" style={inputStyle} />
      <label style={{ ...labelStyle, marginTop: '14px' }}>Confirm Passcode</label>
      <PasswordInput id="confirm-password" name="confirm-password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={inputStyle} />
      {msg && <p style={{ fontSize: '13px', marginTop: '12px', marginBottom: 0, color: msg.ok ? '#1f9d55' : '#d93025' }}>{msg.text}</p>}
      <button type="submit" disabled={busy} style={{ marginTop: '18px', padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: busy ? 'default' : 'pointer' }}>{busy ? 'Saving…' : 'Update Passcode'}</button>
    </form>
  )
}

const labelStyle = { fontSize: '13px', color: 'var(--vfo-muted)', marginBottom: '6px', fontWeight: 500, display: 'block' }
const hiddenFieldStyle = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
const inputStyle = { padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
