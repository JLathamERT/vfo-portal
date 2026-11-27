import { DotText, Field } from './ProfileKit'
import { btnSecondary, btnState, BTN_SMALL } from './buttonStyles'

// The admin's Stripe Account tile on a profile's Revenue Details (2026-11-26):
// the account id, its LIVE status from Stripe (member_connect_status /
// specialist_connect_status, the same check) and Refresh. Shared by the member
// and specialist profiles so the two always read the same.

// connectStatus: the status call's answer, null while it has not answered.
export function connectPill(loading, connectStatus) {
  const state = (loading || !connectStatus) ? 'loading' : (connectStatus.status || 'unavailable')
  return state === 'complete' ? { dot: '#16a34a', label: 'Account Set up' }
    : state === 'eligible_capped' ? { dot: '#f59e0b', label: 'Account setup — payouts eligible to $3,000' }
    : state === 'pending' ? { dot: '#dc2626', label: 'Setup pending' }
    : state === 'mode_mismatch' ? { dot: 'var(--vfo-faint)', label: `Status unavailable (account created in ${connectStatus.found_in_sandbox ? 'sandbox' : 'live'} mode)` }
    : state === 'loading' ? { dot: 'var(--vfo-faint)', label: 'Checking status…' }
    : { dot: 'var(--vfo-faint)', label: 'Status unavailable' }
}

// `note` sits above the row (a borrowed account), `labelSuffix` follows the
// status words, `children` are extra buttons after Refresh (Unlink).
export default function StripeAccountField({ label = 'Stripe Account', acctId, loading, connectStatus, onRefresh, note, labelSuffix = '', msg, msgType = 'success', children }) {
  const pill = connectPill(loading, connectStatus)
  return (
    <Field label={label}>
      {note && <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--vfo-ink-2)', lineHeight: 1.5, marginTop: '2px' }}>{note}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '7px' }}>
        <span style={{ fontSize: '12.5px', fontWeight: 500, color: 'var(--vfo-ink-2)', fontFamily: 'monospace', padding: '5px 10px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-chip)', borderRadius: '8px' }}>{acctId}</span>
        <DotText color={pill.dot} style={{ fontSize: '13px', whiteSpace: 'normal' }}>{pill.label}{labelSuffix}</DotText>
        <button type="button" onClick={onRefresh} disabled={loading}
          style={{ ...btnState({ ...btnSecondary, ...BTN_SMALL }, loading), cursor: loading ? 'wait' : 'pointer' }}>
          Refresh
        </button>
        {children}
      </div>
      {msg && <p style={{ fontSize: '12px', fontWeight: 500, margin: '8px 0 0', color: msgType === 'success' ? 'var(--vfo-success-text)' : '#d93025' }}>{msg}</p>}
    </Field>
  )
}
