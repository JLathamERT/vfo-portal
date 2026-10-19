import { useState } from 'react'

// The "Add New Client" form - the admin MSM Clients tab's layout (First / Last /
// Email / Phone, an optional additional contact, Save / Back). The caller owns the
// save: onSave(fields) resolves on success and throws with the message to show.
export default function AddClientForm({ title = 'Add New Client', onSave, onCancel, cancelLabel = 'Back' }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [showAdditional, setShowAdditional] = useState(false)
  const [addFirstName, setAddFirstName] = useState('')
  const [addLastName, setAddLastName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!firstName || !lastName || !email) { setStatus('First name, last name, and email are required.'); return }
    setSaving(true)
    setStatus('')
    try {
      const additional_contact = showAdditional && addFirstName && addLastName ? { first_name: addFirstName, last_name: addLastName, email: addEmail } : undefined
      await onSave({ first_name: firstName, last_name: lastName, email, phone, additional_contact })
    } catch (err) {
      setStatus(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>{title}</div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label><input value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label><input value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email *</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" style={inputStyle} /></div>
        <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
      </div>
      {!showAdditional && (
        <button type="button" onClick={() => setShowAdditional(true)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px dashed rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.06)', color: '#0095ff', fontWeight: 600, fontSize: '12px', cursor: 'pointer', marginBottom: '12px', fontFamily: 'Inter, sans-serif' }}>+ Add additional contact (e.g. spouse)</button>
      )}
      {showAdditional && (
        <div style={{ padding: '16px', background: 'rgba(0,149,255,0.06)', border: '1px solid rgba(0,149,255,0.2)', borderRadius: '8px', marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: '12px', color: '#0095ff', fontWeight: 600, fontStyle: 'italic' }}>Additional contact (not the primary client)</div>
            <button type="button" onClick={() => { setShowAdditional(false); setAddFirstName(''); setAddLastName(''); setAddEmail('') }} style={{ background: 'none', border: 'none', color: 'var(--vfo-muted)', fontSize: '11px', cursor: 'pointer' }}>Remove</button>
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '120px' }}><label style={labelStyle}>First Name</label><input value={addFirstName} onChange={e => setAddFirstName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '120px' }}><label style={labelStyle}>Last Name</label><input value={addLastName} onChange={e => setAddLastName(e.target.value)} style={inputStyle} /></div>
            <div style={{ flex: 1, minWidth: '160px' }}><label style={labelStyle}>Email</label><input value={addEmail} onChange={e => setAddEmail(e.target.value)} type="email" style={inputStyle} /></div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={save} disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>{cancelLabel}</button>
      </div>
      {status && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{status}</p>}
    </div>
  )
}
