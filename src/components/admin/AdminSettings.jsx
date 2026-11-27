import { useState } from 'react'
import { callApi } from '../../lib/api'
import AppearanceCard from '../shared/AppearanceCard'
import PasswordInput from '../shared/PasswordInput'
import { FormGrid, formInput, formLabel, formReadOnly, ProfileCard, SettingsHeader, SETTINGS_WIDTH } from '../shared/ProfileKit'
import { btnPrimary } from '../shared/buttonStyles'

export default function AdminSettings({ onBack, session }) {
  const [newPasscode, setNewPasscode] = useState('')
  const [confirmPasscode, setConfirmPasscode] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')

  function showStatus(type, msg) {
    setStatusType(type); setStatus(msg)
    setTimeout(() => setStatus(''), 4000)
  }

  async function updatePasscode() {
    if (!newPasscode) { showStatus('error', 'Passcode is required.'); return }
    if (newPasscode !== confirmPasscode) { showStatus('error', 'Passcodes do not match.'); return }
    try {
      await callApi('update_my_passcode', { new_passcode: newPasscode })
      setNewPasscode('')
      setConfirmPasscode('')
      showStatus('success', 'Passcode updated!')
    } catch (err) { showStatus('error', err.message) }
  }

  return (
    <div style={{ maxWidth: SETTINGS_WIDTH, margin: '0 auto', padding: '32px 24px' }}>
      <SettingsHeader name={session?.name} email={session?.email} onBack={onBack} />
      <ProfileCard icon="lock" title="Account Settings" sub="Change the passcode you sign in with.">
        <form onSubmit={e => { e.preventDefault(); updatePasscode() }}>
          <div style={{ marginBottom: '14px' }}>
            <label style={formLabel} htmlFor="username">Email</label>
            <input id="username" name="email" autoComplete="username" type="email" value={session?.email || ''} readOnly style={formReadOnly} />
          </div>
          <FormGrid min={220}>
            <div>
              <label style={formLabel} htmlFor="new-password">New Passcode</label>
              <PasswordInput id="new-password" name="new-password" value={newPasscode} autoComplete="new-password" onChange={e => setNewPasscode(e.target.value)} placeholder="Leave blank to keep current" style={formInput} />
            </div>
            <div>
              <label style={formLabel} htmlFor="confirm-password">Confirm Passcode</label>
              <PasswordInput id="confirm-password" name="confirm-password" value={confirmPasscode} autoComplete="new-password" onChange={e => setConfirmPasscode(e.target.value)} placeholder="Confirm new passcode" style={formInput} />
            </div>
          </FormGrid>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', marginTop: '18px' }}>
            <button type="submit" style={btnPrimary}>Update Passcode</button>
            {status && <span style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', fontWeight: 500 }}>{status}</span>}
          </div>
        </form>
      </ProfileCard>
      <AppearanceCard />
    </div>
  )
}
