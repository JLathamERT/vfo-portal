import { useState, useEffect } from 'react'
import { callApi, getSession } from '../../lib/api'

// The three superadmin-managed "other" tabs Jake can grant to another admin.
// Keys must match the tab keys used by AdminPortal + the backend TAB_ACTIONS map.
const TAB_OPTIONS = [
  { key: 'member_overview', label: 'Member Overview' },
  { key: 'client_overview', label: 'Client Overview' },
  { key: 'client_overview_warnings', label: 'Client Overview Warnings' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'automation', label: 'Automation & Config' },
  { key: 'growth_credits', label: 'Growth Credits' },
  { key: 'faq_editor', label: 'FAQ Editor' },
]

export default function AdminEditor({ onBack }) {
  const [admins, setAdmins] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPasscode, setNewPasscode] = useState('')
  const [status, setStatus] = useState('')
  const [statusType, setStatusType] = useState('success')
  const [loading, setLoading] = useState(true)
  const [savingTabs, setSavingTabs] = useState({})   // email -> bool

  const myEmail = (getSession()?.email || '').toLowerCase()

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
      await callApi('create_admin', { email: newEmail, name: newName, passcode: newPasscode })
      setNewEmail(''); setNewName(''); setNewPasscode('')
      showStatus('success', 'Admin created!')
      loadAdmins()
    } catch (err) { showStatus('error', err.message) }
  }

  async function deleteAdmin(email) {
    try {
      await callApi('delete_admin', { email })
      showStatus('success', 'Admin removed.')
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
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px' }}>
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>Add Admin</div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" style={inputStyle} />
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name" style={inputStyle} />
          <input value={newPasscode} onChange={e => setNewPasscode(e.target.value)} placeholder="Passcode" style={inputStyle} />
        </div>
        <button onClick={createAdmin} style={{ padding: '10px 24px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
          Create Admin
        </button>
        {status && <p style={{ color: statusType === 'success' ? '#1b9254' : '#d93025', fontSize: '13px', marginTop: '12px' }}>{status}</p>}
      </div>

      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>Current Admins</div>
        <p style={{ fontSize: '12px', color: 'var(--vfo-faint)', margin: '0 0 16px' }}>
          The four key tabs (Advisors, Accountants, Strategic Members, Specialists) are open to every admin. Tick the boxes below to grant an admin access to any of the three managed tabs.
        </p>
        {loading && <p style={{ color: 'var(--vfo-muted)', fontSize: '14px' }}>Loading...</p>}
        {admins.map(admin => {
          const isSuper = admin.email.toLowerCase() === myEmail
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
                  {TAB_OPTIONS.map(t => (
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
