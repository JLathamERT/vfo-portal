// A client's one status (2026-11-23): worked out by the server from their programs
// (shown_status, while the client_auto_status switch is On), except Lost, which is set
// by hand and stops every payment. With the switch off shown_status is not sent and the
// hand-set status shows as before. Hex, not theme vars: callers build tints from it.
export const CLIENT_STATUS = {
  pending: { label: 'Pending', hex: '#0a85e8' },
  active: { label: 'Active', hex: '#1b9254' },
  paused: { label: 'Paused', hex: '#e06717' },
  next_tax_year: { label: 'Next tax year', hex: '#e2542c' },
  inactive: { label: 'Inactive', hex: '#6b7a90' },
  lost: { label: 'Lost', hex: '#e74c3c' },
  removed: { label: 'Removed', hex: '#9b1c1c' },
}
export const CLIENT_STATUS_LABELS = Object.values(CLIENT_STATUS).map(s => s.label)

export const clientStatusKey = (c) => String(c?.shown_status || c?.status || '').toLowerCase()

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
export const clientStatusLabel = (status) => CLIENT_STATUS[String(status || '').toLowerCase()]?.label || cap(status)
export const clientStatusHex = (status) => CLIENT_STATUS[String(status || '').toLowerCase()]?.hex

// The tinted pill's background + text colour, as Client Overview draws it.
export function clientStatusColors(status) {
  const key = String(status || '').toLowerCase()
  if (key === 'active') return { bg: 'rgba(27,146,84,0.13)', color: 'var(--vfo-success-text)' }
  if (key === 'inactive') return { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)' }
  const hex = CLIENT_STATUS[key]?.hex
  return hex ? { bg: `${hex}22`, color: hex } : { bg: 'var(--vfo-tint)', color: 'var(--vfo-muted)' }
}
