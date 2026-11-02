import { useEffect, useState } from 'react'
import { callApi } from '../../lib/api'
import { EmailTemplatesSkeleton } from '../shared/Skeleton'
import { TEMPLATE_META } from '../shared/templateMeta'

// Team Notification Emails (2026-11-02) — the people the "Team" recipient on an
// email template reaches (team_notification_recipients; the TEAM token in
// utils/email-recipients.ts). Today that is the team emails sent when an advisor or
// accountant is created at the end of onboarding. Editing this list never touches
// anyone's admin login. The server refuses to remove the last person.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const inputStyle = { padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '12px', fontFamily: 'Inter, sans-serif', minWidth: 0 }
const saveBtn = busy => ({ padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: busy ? 'default' : 'pointer', border: '1px solid rgba(27,146,84,0.4)', background: 'rgba(27,146,84,0.12)', color: 'var(--vfo-success-text)', fontWeight: 600, opacity: busy ? 0.6 : 1, whiteSpace: 'nowrap' })
const quietBtn = { padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid var(--vfo-border-strong)', background: 'transparent', color: 'var(--vfo-muted)', fontWeight: 600, whiteSpace: 'nowrap' }
const blueBtn = { padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(0,149,255,0.4)', background: 'rgba(0,149,255,0.1)', color: '#0095ff', fontWeight: 600, whiteSpace: 'nowrap' }
const redBtn = { padding: '6px 14px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', border: '1px solid rgba(217,48,37,0.4)', background: 'rgba(217,48,37,0.08)', color: '#d93025', fontWeight: 600, whiteSpace: 'nowrap' }

function templateLabel(pipeline, name) {
  const hit = (TEMPLATE_META[pipeline] || []).find(([n]) => n === name)
  if (!hit) return `${pipeline} / ${name}`
  const label = hit[1].replace(/^Internal — /, '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function PersonRow({ person, onlyOne, busy, onSave, onRemove }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(person.name)
  const [email, setEmail] = useState(person.email)
  const [err, setErr] = useState('')

  async function save() {
    const n = name.trim(), e = email.trim().toLowerCase()
    if (!n) { setErr('Enter a name'); return }
    if (!EMAIL_RE.test(e)) { setErr('Enter a valid email'); return }
    const msg = await onSave({ id: person.id, name: n, email: e })
    if (msg) setErr(msg); else { setErr(''); setEditing(false) }
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      {editing ? (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={name} onChange={e => { setName(e.target.value); setErr('') }} placeholder="Name" style={{ ...inputStyle, flex: '1 1 160px' }} />
          <input value={email} onChange={e => { setEmail(e.target.value); setErr('') }} placeholder="Email" style={{ ...inputStyle, flex: '2 1 220px' }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }} />
          <button onClick={save} disabled={busy} style={saveBtn(busy)}>{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setEditing(false); setName(person.name); setEmail(person.email); setErr('') }} style={quietBtn}>Cancel</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{person.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', wordBreak: 'break-all' }}>{person.email}</div>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setEditing(true)} style={blueBtn}>Edit</button>
            <button onClick={() => onRemove(person)} disabled={busy || onlyOne} title={onlyOne ? 'The list needs at least one person' : undefined}
              style={{ ...redBtn, opacity: busy || onlyOne ? 0.5 : 1, cursor: busy || onlyOne ? 'default' : 'pointer' }}>Remove</button>
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: '12px', color: '#d93025', fontWeight: 600, marginTop: '6px' }}>{err}</div>}
    </div>
  )
}

export default function TeamNotificationEmailsPanel() {
  const [people, setPeople] = useState([])
  const [admins, setAdmins] = useState([])
  const [usedBy, setUsedBy] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [addErr, setAddErr] = useState('')
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const data = await callApi('team_notify_list_load')
      setPeople(data.recipients || [])
      setAdmins(data.admins || [])
      setUsedBy(data.used_by || [])
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  // Returns an error message, or '' once saved.
  async function change(payload, doneMsg) {
    setBusy(true); setSavedMsg('')
    try {
      const data = await callApi('team_notify_list_save', payload)
      setPeople(data.recipients || [])
      setSavedMsg(doneMsg)
      setTimeout(() => setSavedMsg(''), 2500)
      return ''
    } catch (err) { return err.message || String(err) }
    finally { setBusy(false) }
  }

  async function add() {
    const n = newName.trim(), e = newEmail.trim().toLowerCase()
    if (!n) { setAddErr('Enter a name'); return }
    if (!EMAIL_RE.test(e)) { setAddErr('Enter a valid email'); return }
    const msg = await change({ op: 'add', name: n, email: e }, `Added ${n}`)
    if (msg) setAddErr(msg); else { setAddErr(''); setNewName(''); setNewEmail('') }
  }

  async function remove(person) {
    if (!window.confirm(`Remove ${person.name} (${person.email}) from the team notification emails?`)) return
    const msg = await change({ op: 'remove', id: person.id }, `Removed ${person.name}`)
    if (msg) setError(msg); else setError('')
  }

  function pickAdmin(email) {
    const a = admins.find(x => x.email === email)
    if (!a) return
    setNewName(a.name || ''); setNewEmail(a.email || ''); setAddErr('')
  }

  if (loading) return <EmailTemplatesSkeleton />

  const onList = new Set(people.map(p => p.email.toLowerCase()))
  const addable = admins.filter(a => a.email && !onList.has(a.email.toLowerCase()))

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2 style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '-0.02em', fontSize: '24px', color: 'var(--vfo-ink)', margin: '0 0 8px 0' }}>Team Notification Emails</h2>
      <p style={{ fontSize: '13px', color: 'var(--vfo-muted)', margin: '0 0 24px' }}>
        The people who receive the internal team emails. Any email template whose recipients include "Team" goes to everyone on
        this list. Changing the list does not change anyone's admin login.
      </p>

      {error && <div style={{ color: '#d93025', fontWeight: 500, fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      <div style={{ marginBottom: '14px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-card)', boxShadow: '0 2px 8px rgba(20,45,95,0.04)', padding: '14px 18px' }}>
        <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, letterSpacing: '0.4px', marginBottom: '6px' }}>SENT TO THIS LIST</div>
        {usedBy.length === 0
          ? <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', fontStyle: 'italic' }}>No email template uses "Team" at the moment.</div>
          : <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', color: 'var(--vfo-ink)', lineHeight: 1.7 }}>
              {usedBy.map(t => <li key={`${t.pipeline}/${t.template_name}`}>{templateLabel(t.pipeline, t.template_name)}</li>)}
            </ul>}
      </div>

      <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-card)', boxShadow: '0 2px 8px rgba(20,45,95,0.04)', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>People</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {savedMsg && <span style={{ fontSize: '12px', color: 'var(--vfo-success-text)', fontWeight: 600 }}>{savedMsg}</span>}
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '999px', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-muted)' }}>{people.length}</span>
          </span>
        </div>

        {people.map(p => (
          <PersonRow key={`${p.id}:${p.name}:${p.email}`} person={p} onlyOne={people.length <= 1} busy={busy}
            onSave={row => change({ op: 'update', ...row }, `Saved ${row.name}`)} onRemove={remove} />
        ))}

        <div style={{ paddingTop: '14px' }}>
          <div style={{ fontSize: '11px', color: '#0095ff', fontWeight: 600, letterSpacing: '0.4px', marginBottom: '6px' }}>ADD A PERSON</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {addable.length > 0 && (
              <select value="" onChange={e => pickAdmin(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px' }}>
                <option value="">Pick an admin…</option>
                {addable.map(a => <option key={a.email} value={a.email}>{a.name} ({a.email})</option>)}
              </select>
            )}
            <input value={newName} onChange={e => { setNewName(e.target.value); setAddErr('') }} placeholder="Name" style={{ ...inputStyle, flex: '1 1 160px' }} />
            <input value={newEmail} onChange={e => { setNewEmail(e.target.value); setAddErr('') }} placeholder="Email" style={{ ...inputStyle, flex: '2 1 220px' }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <button onClick={add} disabled={busy} style={saveBtn(busy)}>Add</button>
          </div>
          {addErr && <div style={{ fontSize: '12px', color: '#d93025', fontWeight: 600, marginTop: '6px' }}>{addErr}</div>}
        </div>
      </div>
    </div>
  )
}
