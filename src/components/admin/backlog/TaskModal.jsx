import { useState } from 'react'
import { btnPrimary, btnSecondary, btnState } from '../../shared/buttonStyles'
import Modal, { errorText, fieldLabel, inputStyle } from '../../shared/Modal'
import { PORTAL_DEPARTMENTS, departmentChipStyle } from './portalDepartments'

const MAX_TEXT = 4000
const MAX_TITLE = 140
const TITLE_WARN = 120

// + Add task, and Edit on a task (Backlog 4b): superadmins only. A task has a
// title and a description, optional departments and an optional due date (a
// past date is allowed), and no urgency, importance or review. The creator and
// the date come from the session server-side. Adding one picks whose lane it
// goes in (Backlog 4c): Me by default, or the other superadmin; never no one.
// Editing never moves it (that is the Move card or a drag).
export default function TaskModal({ initial, assignees = [], me, presetAssignee, onSave, onClose }) {
  const editing = !!initial
  const [assignTo, setAssignTo] = useState(String(presetAssignee ?? me?.admin_id ?? ''))
  const [title, setTitle] = useState(initial?.title || '')
  const [departments, setDepartments] = useState(initial?.departments || [])
  const [text, setText] = useState(initial?.request_text || '')
  const [due, setDue] = useState(initial?.due_on ? String(initial.due_on).slice(0, 10) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = (name) => setDepartments((d) => d.includes(name) ? d.filter((x) => x !== name) : [...d, name])
  const trimmed = text.trim()
  const titleTrim = title.replace(/\s+/g, ' ').trim()
  const missing = [!titleTrim && 'a title', !trimmed && 'a description'].filter(Boolean)
  const canSave = missing.length === 0 && trimmed.length <= MAX_TEXT && titleTrim.length <= MAX_TITLE && !saving

  const save = async () => {
    if (!canSave) return
    setSaving(true); setError('')
    try {
      await onSave({
        title: titleTrim,
        request_text: trimmed,
        departments: PORTAL_DEPARTMENTS.map((d) => d.name).filter((n) => departments.includes(n)),
        due_on: due || null,
        ...(editing || assignTo === '' ? {} : { assignee_admin_id: Number(assignTo) }),
      })
    } catch (e) {
      setError(e.message || 'Could not save the task')
      setSaving(false)
    }
  }

  return (
    <Modal title={editing ? 'Edit task' : 'Add task'} onClose={onClose} width={560}
      footer={(
        <>
          <button style={btnSecondary} onClick={onClose}>Cancel</button>
          <button style={btnState(btnPrimary, !canSave)} disabled={!canSave} onClick={save}>
            {saving ? (editing ? 'Saving…' : 'Adding…') : (editing ? 'Save' : 'Add task')}
          </button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={fieldLabel} htmlFor="backlog-task-title">Title</label>
          <input id="backlog-task-title" type="text" autoComplete="off" maxLength={MAX_TITLE} value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="A short name for the task" style={{ ...inputStyle, fontSize: '15px', fontWeight: 700 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '11.5px', marginTop: '4px' }}>
            <span style={{ color: 'var(--vfo-faint)' }}>A short name for the task. Put the details in the description.</span>
            <span style={{ flexShrink: 0, fontWeight: title.length >= TITLE_WARN ? 700 : 400, color: title.length >= MAX_TITLE ? '#e74c3c' : title.length >= TITLE_WARN ? '#c98a14' : 'var(--vfo-faint)' }}>{title.length} / {MAX_TITLE}</span>
          </div>
        </div>

        {!editing && (
          <div style={{ maxWidth: '280px' }}>
            <label style={fieldLabel} htmlFor="backlog-task-assign">Assign to</label>
            <select id="backlog-task-assign" value={assignTo} onChange={(e) => setAssignTo(e.target.value)} style={inputStyle}>
              {[...assignees].sort((a, b) => (a.admin_id === me?.admin_id ? -1 : b.admin_id === me?.admin_id ? 1 : 0)).map((a) => (
                <option key={a.admin_id} value={String(a.admin_id)}>{a.admin_id === me?.admin_id ? `Me (${a.name})` : a.name}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label style={fieldLabel} htmlFor="backlog-task-text">Description</label>
          <textarea id="backlog-task-text" value={text} onChange={(e) => setText(e.target.value)} rows={5}
            placeholder="What needs doing?" style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
          <div style={{ fontSize: '11.5px', color: trimmed.length > MAX_TEXT ? '#e74c3c' : 'var(--vfo-faint)', textAlign: 'right', marginTop: '4px' }}>{trimmed.length} / {MAX_TEXT}</div>
        </div>

        <div>
          <span style={fieldLabel}>Departments (optional)</span>
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

        <div style={{ maxWidth: '220px' }}>
          <label style={fieldLabel} htmlFor="backlog-task-due">Due date (optional)</label>
          <input id="backlog-task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} />
        </div>

        {missing.length > 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-faint)' }}>Still needed: {missing.join(', ')}.</div>}
        {error && <div style={errorText}>{error}</div>}
      </div>
    </Modal>
  )
}
