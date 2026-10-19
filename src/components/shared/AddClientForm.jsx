import { useState } from 'react'
import { Link } from 'react-router-dom'
import PhoneInput from './PhoneInput'
import { cleanText, formatPersonName, phoneIncomplete, nameHasTwoPeople, TWO_PEOPLE_MESSAGE, TWO_PEOPLE_CONTACT_MESSAGE } from '../../lib/formatters'

// The "Add New Client" form - the admin MSM Clients tab's layout (First / Last /
// Email / Phone, an optional additional contact, Save / Back), shared by the admin
// MSM Clients tab, the member Client Overview and the CIQ tab. The caller owns the
// save: onSave(fields) resolves on success and throws on failure.
//
// 2026-10-19: names tidy when the box is left and spaces are trimmed
// (src/lib/formatters.js, mirrored on the server); the phone shapes itself; an
// additional contact needs both names; a 409 duplicate reply (the server's
// utils/client-duplicates.ts) shows the clash - an email clash blocks, a name clash
// offers "Add anyway" (re-sent with allow_duplicate_name).
export default function AddClientForm({
  title = 'Add New Client', onSave, onCancel, cancelLabel = 'Back', saveLabel = 'Save',
  showPhone = true, profileBase = null,
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [showAdditional, setShowAdditional] = useState(false)
  const [addFirstName, setAddFirstName] = useState('')
  const [addLastName, setAddLastName] = useState('')
  const [addEmail, setAddEmail] = useState('')
  const [status, setStatus] = useState('')
  const [duplicate, setDuplicate] = useState(null)
  const [saving, setSaving] = useState(false)

  async function save(allowDuplicateName = false) {
    const f = formatPersonName(firstName), l = formatPersonName(lastName), em = cleanText(email)
    setFirstName(f); setLastName(l); setEmail(em)
    const af = formatPersonName(addFirstName), al = formatPersonName(addLastName), ae = cleanText(addEmail)
    setAddFirstName(af); setAddLastName(al); setAddEmail(ae)
    setDuplicate(null)
    if (!f || !l || !em) { setStatus('First name, last name, and email are required.'); return }
    if (nameHasTwoPeople(f) || nameHasTwoPeople(l)) { setShowAdditional(true); setStatus(TWO_PEOPLE_MESSAGE); return }
    if (showPhone && phoneIncomplete(phone)) { setStatus('Enter the full 10-digit phone number, or leave it blank.'); return }
    const withContact = showAdditional && (af || al || ae)
    if (withContact && (!af || !al)) { setStatus('The additional contact needs a first and last name.'); return }
    if (withContact && (nameHasTwoPeople(af) || nameHasTwoPeople(al))) { setStatus(TWO_PEOPLE_CONTACT_MESSAGE); return }
    setSaving(true)
    setStatus('')
    try {
      await onSave({
        first_name: f, last_name: l, email: em,
        ...(showPhone ? { phone: cleanText(phone) } : {}),
        additional_contact: withContact ? { first_name: af, last_name: al, email: ae } : undefined,
        ...(allowDuplicateName ? { allow_duplicate_name: true } : {}),
      })
    } catch (err) {
      if (err?.status === 409 && err?.data?.duplicate) setDuplicate({ ...err.data.duplicate, message: err.message })
      else setStatus(err.message)
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '14px', width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }
  const labelStyle = { fontSize: '12px', color: 'var(--vfo-muted)', display: 'block', marginBottom: '6px' }
  const sectionStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '24px', marginBottom: '20px' }
  const nameBox = (value, set) => (
    <input value={value} onChange={e => set(e.target.value)} onBlur={() => set(formatPersonName(value))} style={inputStyle} />
  )
  const isNameClash = duplicate?.kind === 'name'

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>{title}</div>
      <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>First Name *</label>{nameBox(firstName, setFirstName)}</div>
        <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Last Name *</label>{nameBox(lastName, setLastName)}</div>
        <div style={{ flex: 1, minWidth: '180px' }}><label style={labelStyle}>Email *</label><input value={email} onChange={e => setEmail(e.target.value)} onBlur={() => setEmail(cleanText(email))} type="email" style={inputStyle} /></div>
        {showPhone && <div style={{ flex: 1, minWidth: '140px' }}><label style={labelStyle}>Phone</label><PhoneInput value={phone} onChange={setPhone} style={inputStyle} /></div>}
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
            <div style={{ flex: 1, minWidth: '120px' }}><label style={labelStyle}>First Name *</label>{nameBox(addFirstName, setAddFirstName)}</div>
            <div style={{ flex: 1, minWidth: '120px' }}><label style={labelStyle}>Last Name *</label>{nameBox(addLastName, setAddLastName)}</div>
            <div style={{ flex: 1, minWidth: '160px' }}><label style={labelStyle}>Email</label><input value={addEmail} onChange={e => setAddEmail(e.target.value)} onBlur={() => setAddEmail(cleanText(addEmail))} type="email" style={inputStyle} /></div>
          </div>
        </div>
      )}
      {duplicate && (
        <div style={{ padding: '12px 14px', marginBottom: '12px', borderRadius: '8px', fontSize: '13px', lineHeight: 1.5,
          background: isNameClash ? 'rgba(224,103,23,0.10)' : 'rgba(217,48,37,0.08)',
          border: `1px solid ${isNameClash ? 'rgba(224,103,23,0.35)' : 'rgba(217,48,37,0.3)'}`,
          color: isNameClash ? 'var(--vfo-ink)' : '#d93025' }}>
          <div>{duplicate.message}</div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
            {profileBase && duplicate.client_id && (
              <Link to={`${profileBase}/${duplicate.client_id}?tab=home`} style={{ color: 'var(--vfo-link)', fontWeight: 600, fontSize: '12.5px' }}>Open {duplicate.name || 'that client'}</Link>
            )}
            {isNameClash && (
              <button type="button" onClick={() => save(true)} disabled={saving} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #e06717', background: 'transparent', color: '#e06717', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}>Add anyway</button>
            )}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" onClick={() => save(false)} disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : saveLabel}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={{ padding: '8px 20px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: 'var(--vfo-muted)', fontSize: '13px', cursor: 'pointer' }}>{cancelLabel}</button>
      </div>
      {status && <p style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginTop: '8px' }}>{status}</p>}
    </div>
  )
}
