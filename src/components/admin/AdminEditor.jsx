import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import PasswordInput from '../shared/PasswordInput'
import { Skeleton } from '../shared/Skeleton'
import { GATED_ADMIN_TABS } from './adminTabs'

export default function AdminEditor({ onBack }) {
  const [admins, setAdmins] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPasscode, setNewPasscode] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(true)
  const [savingTabs, setSavingTabs] = useState({})   // email -> bool

  useEffect(() => { loadAdmins() }, [])

  async function loadAdmins() {
    try {
      const data = await callApi('load_admins')
      setAdmins(data.admins || [])
    } catch (err) {
      showStatus('error', err.message)
    } finally {
      setLoading(false)
    }
  }

  function showStatus(type, msg) {
    setStatusType(type)
    setStatus(msg)
    setTimeout(() => setStatus(''), 4000)
  }

  async function createAdmin() {
    if (!newEmail || !newName || !newPasscode) { showStatus('error', 'All fields are required.'); return }
    try {
      const res = await callApi('create_admin', { email: newEmail, name: newName, passcode: newPasscode })
      setNewEmail(''); setNewName(''); setNewPasscode('')
      // Staging only: the server also makes the person's own test member.
      const tm = res?.test_member
      if (tm?.error) showStatus('error', `Admin created, but their test member could not be made: ${tm.error}`)
      else if (tm?.member_number) showStatus('success', `Admin created. Their test member is ${tm.member_number}: they sign in to the member portal with the same email and password.`)
      else showStatus('success', 'Admin created!')
      loadAdmins()
    } catch (err) { showStatus('error', err.message) }
  }

  async function deleteAdmin(email) {
    try {
      const res = await callApi('delete_admin', { email })
      // Staging only: the server also removes the person's test member.
      showStatus('success', res?.test_member_removed ? `Admin removed, and their test member ${res.test_member_removed} with its clients.` : 'Admin removed.')
      loadAdmins()
    } catch (err) { showStatus('error', err.message) }
  }

  async function toggleTab(admin, tabKey) {
    const current = admin.allowed_tabs || []
    const next = current.includes(tabKey) ? current.filter(t => t !== tabKey) : [...current, tabKey]
    // Optimistic update
    setAdmins(list => list.map(a => a.email === admin.email ? { ...a, allowed_tabs: next } : a))
    setSavingTabs(s => ({ ...s, [admin.email]: true }))
    try {
      await callApi('admin_update_tabs', { email: admin.email, allowed_tabs: next })
    } catch (err) {
      // Revert on failure
      setAdmins(list => list.map(a => a.email === admin.email ? { ...a, allowed_tabs: current } : a))
      showStatus('error', err.message)
    } finally {
      setSavingTabs(s => { const n = { ...s }; delete n[admin.email]; return n })
    }
  }

  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Admin</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <input value={newEmail} autoComplete="off" onChange={e => setNewEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input value={newName} autoComplete="off" onChange={e => setNewName(e.target.value)} placeholder="Name" style={inputStyle} />
          <PasswordInput value={newPasscode} autoComplete="new-password" onChange={e => setNewPasscode(e.target.value)} placeholder="Passcode" style={inputStyle} />
        </div>
        <button onClick={createAdmin} style={{ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
          Create Admin
        </button>
        {status && <p style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Current Admins</div>
        <p style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '0 0 16px' }}>
          Every tab is open to every admin, except the four below. Tick a box to turn one on for an admin. They see it the next time they sign in.
        </p>
        {loading && [0, 1, 2].map(i => <div key={i} style={{ padding: '14px 0', borderTop: '1px solid var(--vfo-border-soft)' }}><Skeleton width={150} height={14} /><Skeleton width={210} height={11} style={{ margin: '7px 0 12px' }} /><Skeleton width="80%" height={22} /></div>)}
        {admins.map(admin => {
          // load_admins marks every email on the backend's superadmin list.
          const isSuper = admin.is_superadmin === true
          const tabs = admin.allowed_tabs || []
          return (
            <div key={admin.email} style={{ padding: '14px 0', borderBottom: '1px solid var(--vfo-tint)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isSuper ? 0 : '10px' }}>
                <div>
                  <span style={{ fontSize: '14px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{admin.name}</span>
                  <span style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginLeft: '12px' }}>{admin.email}</span>
                  {isSuper && <span style={{ fontSize: '11px', color: '#0a85e8', fontWeight: 700, marginLeft: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Superadmin · all tabs</span>}
                </div>
                {!isSuper && (
                  <button onClick={() => deleteAdmin(admin.email)}
                    style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)', background: 'transparent', color: '#e74c3c', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>
                    Remove
                  </button>
                )}
              </div>
              {!isSuper && (
                <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {GATED_ADMIN_TABS.map(t => (
                    <label key={t.key} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--vfo-ink)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={tabs.includes(t.key)} disabled={!!savingTabs[admin.email]} onChange={() => toggleTab(admin, t.key)} style={{ accentColor: '#125ecc', cursor: 'pointer' }} />
                      {t.label}
                    </label>
                  ))}
                  {savingTabs[admin.email] && <span style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Saving…</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
