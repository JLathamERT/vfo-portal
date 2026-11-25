import { useState } from 'react'
import { btnOutline, btnPrimary, btnState, BTN_SMALL } from './buttonStyles'

// Clears an action-required notification by hand: the first click only asks, the
// second one clears. Used by the bell (`small`) and the Notifications page.
export default function ClearActionButton({ onClear, disabled = false, small = false }) {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const size = small ? BTN_SMALL : null

  async function confirm(e) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try { await onClear() } finally { setBusy(false); setAsking(false) }
  }

  if (!asking) {
    return (
      <button type="button" disabled={disabled} style={{ ...btnState({ ...btnOutline, ...size }, disabled), flexShrink: 0 }}
        title="Clear without completing the step"
        onClick={e => { e.stopPropagation(); setAsking(true) }}>Clear</button>
    )
  }
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0, cursor: 'default' }}>
      <span style={{ fontSize: small ? '11.5px' : '12.5px', fontWeight: 600, color: 'var(--vfo-ink)', whiteSpace: 'nowrap' }}>Are you sure?</span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" disabled={busy || disabled} onClick={confirm} style={btnState({ ...btnPrimary, ...size }, busy || disabled)}>{busy ? 'Clearing…' : 'Yes, clear'}</button>
        <button type="button" disabled={busy} onClick={e => { e.stopPropagation(); setAsking(false) }} style={btnState({ ...btnOutline, color: 'var(--vfo-muted)', ...size }, busy)}>Cancel</button>
      </div>
    </div>
  )
}
