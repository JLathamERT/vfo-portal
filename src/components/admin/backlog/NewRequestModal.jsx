import { useState } from 'react'
import { btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import BacklogModal, { errorText, fieldLabel, inputStyle } from './BacklogModal'
import { PORTAL_DEPARTMENTS, departmentChipStyle } from './portalDepartments'

const SCORES = [1, 2, 3, 4, 5]
const MAX_TEXT = 4000
const MAX_TITLE = 140

// + New request, and Edit on a request (the requester's own while pending, or
// any request for a superadmin). Name and date come from the session server-side.
// Assign to is the requester's optional pick and only shows when they may set it.
export default function NewRequestModal({ initial, assignees, showAssign, onSave, onClose }) {
  const editing = !!initial
  const [title, setTitle] = useState(initial?.title || '')
  const [departments, setDepartments] = useState(initial?.departments || [])
  const [urgency, setUrgency] = useState(initial?.urgency ?? '')
  const [importance, setImportance] = useState(initial?.importance ?? '')
  const [text, setText] = useState(initial?.request_text || '')
  const [assignTo, setAssignTo] = useState(initial?.requested_assignee_admin_id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = (name) => setDepartments((d) => d.includes(name) ? d.filter((x) => x !== name) : [...d, name])
  const trimmed = text.trim()
  const titleTrim = title.replace(/\s+/g, ' ').trim()
  const missing = [
    !titleTrim && 'a title',
    departments.length === 0 && 'a department',
    urgency === '' && 'urgency',
    importance === '' && 'importance',
    !trimmed && 'a description',
  ].filter(Boolean)
  const canSave = missing.length === 0 && trimmed.length <= MAX_TEXT && titleTrim.length <= MAX_TITLE && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError('')
    try {
      const ordered = PORTAL_DEPARTMENTS.map((d) => d.name).filter((n) => departments.includes(n))
      await onSave({
        title: titleTrim,
        departments: ordered,
        urgency: Number(urgency),
        importance: Number(importance),
        request_text: trimmed,
        requested_assignee_admin_id: showAssign && assignTo !== '' ? Number(assignTo) : null,
      })
    } catch (e) {
      setError(e.message || 'Could not save the request')
      setSaving(false)
    }
  }

  return (
    <BacklogModal title={editing ? 'Edit request' : 'New portal request'} onClose={onClose} width={560}
      footer={(
        <>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnState(btnPrimary, !canSave)} disabled={!canSave} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Submit request'}</button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={fieldLabel} htmlFor="backlog-title">Title</label>
          <input id="backlog-title" type="text" autoComplete="off" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="A short name for the change" style={{ ...inputStyle, fontSize: '15px', fontWeight: 700 }} />
        </div>

        <div>
          <span style={fieldLabel}>Department</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {PORTAL_DEPARTMENTS.map((d) => {
              const on = departments.includes(d.name)
              return (
                <button key={d.name} type="button" onClick={() => toggle(d.name)} aria-pressed={on}
                  style={{ ...(on ? departmentChipStyle(d.name) : { display: 'inline-flex', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, lineHeight: 1.4, background: 'transparent', color: 'var(--vfo-muted)' }),
                    border: on ? '2px solid var(--vfo-primary)' : '2px solid var(--vfo-border-mid)', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                  {d.name}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <ScoreSelect label="Urgency" value={urgency} onChange={setUrgency} />
          <ScoreSelect label="Importance" value={importance} onChange={setImportance} />
        </div>

        <div>
          <label style={fieldLabel} htmlFor="backlog-request-text">Description</label>
          <textarea id="backlog-request-text" value={text} onChange={(e) => setText(e.target.value)} rows={6}
            placeholder="What should change in the portal, and where?" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ fontSize: '11.5px', color: trimmed.length > MAX_TEXT ? '#e74c3c' : 'var(--vfo-faint)', textAlign: 'right', marginTop: '4px' }}>{trimmed.length} / {MAX_TEXT}</div>
        </div>

        {showAssign && (
          <div style={{ borderTop: '1px dashed var(--vfo-border-mid)', paddingTop: '14px', opacity: 0.85 }}>
            <label style={{ ...fieldLabel, color: 'var(--vfo-faint)' }} htmlFor="backlog-assign-to">Assign to (optional)</label>
            <select id="backlog-assign-to" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={{ ...inputStyle, color: 'var(--vfo-muted)' }}>
              <option value="">No one (recommended)</option>
              {assignees.map((a) => <option key={a.admin_id} value={a.admin_id}>{a.name}</option>)}
            </select>
            <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', marginTop: '6px', lineHeight: 1.45 }}>
              Optional — only pick someone if they asked you to. Jake and Paxton normally assign requests themselves.
            </div>
          </div>
        )}

        {missing.length > 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Still needed: {missing.join(', ')}.</div>}
        {error && <div style={errorText}>{error}</div>}
      </div>
    </BacklogModal>
  )
}

function ScoreSelect({ label, value, onChange }) {
  const id = `backlog-${label.toLowerCase()}`
  return (
    <div>
      <label style={fieldLabel} htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle}>
        <option value="">Pick 1–5</option>
        {SCORES.map((n) => <option key={n} value={n}>{n}{n === 1 ? ' = Low' : n === 5 ? ' = High' : ''}</option>)}
      </select>
      <div style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '4px' }}>1 = Low … 5 = High</div>
    </div>
  )
}
