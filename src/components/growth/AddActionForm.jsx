import { useState } from 'react'
import { inputStyle, miniLabel, Radios, NameCombo, formTileStyle, phoneFormStyle } from './ui'
import { useIsPhone } from '../../lib/useMediaQuery'
import { btnPrimary, btnSecondary, btnState } from '../shared/buttonStyles'

const LEVELS = [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }]

// Reusable "add a priority / sub-task" form: free-text + Owned By / Assisted By /
// Value / Effort. There is NO parent picker — whether this is a top-level priority
// or a sub-task is decided by WHERE the form is opened (the caller adds the
// parent_action_id in onSubmit). onSubmit receives { action_text, owned_by,
// assisted_by, value_level, effort_level }. Owned By / Assisted By are the same
// name dropdown as the plan's rows (`namePool` + `adminSet` from buildNamePool;
// Jake 2026-11-27), and whatever name is in the box is what gets saved.
export default function AddActionForm({ onSubmit, onCancel, submitLabel = 'Add to Plan', idKey = 'add', placeholder = 'Describe the priority…', namePool = [], adminSet }) {
  const [text, setText] = useState('')
  const [owned, setOwned] = useState('')
  const [assisted, setAssisted] = useState('')
  const [value, setValue] = useState('medium')
  const [effort, setEffort] = useState('medium')
  const [busy, setBusy] = useState(false)
  const isPhone = useIsPhone()

  async function submit() {
    if (!text.trim()) { alert('Enter the text first.'); return }
    setBusy(true)
    try {
      await onSubmit({ action_text: text.trim(), owned_by: owned, assisted_by: assisted, value_level: value, effort_level: effort })
    } catch (e) { alert(e?.message || 'Failed to add'); setBusy(false) }
  }

  return (
    <div style={isPhone ? phoneFormStyle : formTileStyle}>
      <div style={{ marginBottom: '12px' }}>
        <div style={miniLabel}>Description</div>
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', minHeight: '48px', resize: 'vertical' }} />
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <div style={{ flex: '1 1 180px' }}><div style={miniLabel}>Owned By</div><NameCombo value={owned} onChange={setOwned} people={namePool} adminSet={adminSet} placeholder="Type or pick a name" /></div>
        <div style={{ flex: '1 1 180px' }}><div style={miniLabel}>Assisted By</div><NameCombo value={assisted} onChange={setAssisted} people={namePool} adminSet={adminSet} placeholder="Type or pick a name" /></div>
      </div>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div><div style={miniLabel}>Value</div><div style={{ display: 'flex', gap: '14px' }}><Radios name={`v_${idKey}`} value={value} onChange={setValue} options={LEVELS} /></div></div>
        <div><div style={miniLabel}>Effort</div><div style={{ display: 'flex', gap: '14px' }}><Radios name={`e_${idKey}`} value={effort} onChange={setEffort} options={LEVELS} /></div></div>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={submit} disabled={busy} style={btnState(btnPrimary, busy)}>{busy ? 'Adding…' : submitLabel}</button>
        {onCancel && <button onClick={onCancel} disabled={busy} style={btnState(btnSecondary, busy)}>Cancel</button>}
      </div>
    </div>
  )
}
