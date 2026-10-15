import { useState } from 'react'
import { callApi } from '../../lib/api'
import AppearanceCard from '../shared/AppearanceCard'

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

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Account Settings</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={labelStyle}>Email</label>
          <input value={session?.email || ''} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>New Passcode</label>
            <input value={newPasscode} onChange={e => setNewPasscode(e.target.value)} placeholder="Leave blank to keep current" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Confirm Passcode</label>
            <input value={confirmPasscode} onChange={e => setConfirmPasscode(e.target.value)} placeholder="Confirm new passcode" style={inputStyle} />
          </div>
        </div>
        <button onClick={updatePasscode} style={{ padding: '10px 28px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
          Update Passcode
        </button>
        {status && <p style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
      </div>
      <AppearanceCard />
    </div>
  )
}