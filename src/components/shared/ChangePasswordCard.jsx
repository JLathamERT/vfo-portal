import { useState } from 'react'
import { callApi, getSession } from '../../lib/api'
import PasswordInput from './PasswordInput'
import { FormGrid, formInput, formLabel, ProfileCard } from './ProfileKit'
import { btnPrimary, btnState } from './buttonStyles'

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
    <ProfileCard icon="lock" title="Change Passcode" sub="At least 6 characters.">
      <form onSubmit={save}>
        <input id="username" name="email" autoComplete="username" type="email" value={getSession()?.email || ''} readOnly tabIndex={-1} style={hiddenFieldStyle} />
        <FormGrid min={220}>
          <div>
            <label style={formLabel} htmlFor="new-password">New Passcode</label>
            <PasswordInput id="new-password" name="new-password" value={passcode} onChange={e => setPasscode(e.target.value)} autoComplete="new-password" style={formInput} />
          </div>
          <div>
            <label style={formLabel} htmlFor="confirm-password">Confirm Passcode</label>
            <PasswordInput id="confirm-password" name="confirm-password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" style={formInput} />
          </div>
        </FormGrid>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '18px' }}>
          <button type="submit" disabled={busy} style={btnState(btnPrimary, busy)}>{busy ? 'Saving…' : 'Update Passcode'}</button>
          {msg && <span style={{ fontSize: '13px', fontWeight: 500, color: msg.ok ? 'var(--vfo-success-text)' : '#d93025' }}>{msg.text}</span>}
        </div>
      </form>
    </ProfileCard>
  )
}

const hiddenFieldStyle = { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', border: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }
