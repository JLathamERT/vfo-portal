import { readable } from './readableColor'

// A person's status colour - members (elite_status), specialists and tax planners
// (status) - for every dot, pill and KPI tile: Active green, Lost red, Removed
// DARK red (2026-10-28; Removed was grey on most screens). Hex, not a theme var,
// because callers build tints from it (`${colour}22`).
export const STATUS_COLORS = { Active: '#1b9254', Lost: '#e74c3c', Removed: '#9b1c1c' }

export function statusColor(status, fallback = 'var(--vfo-faint)') {
  return STATUS_COLORS[status] || fallback
}

// The small tinted status pill beside a name on a phone list card (the card
// pattern Jake picked 2026-10-28). Takes any hex; a theme var falls back to a
// neutral tint.
export function statusPillStyle(color) {
  const hex = typeof color === 'string' && color.startsWith('#')
  return {
    fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0,
    background: hex ? `${color}1f` : 'var(--vfo-tint)',
    color: hex ? readable(color) : 'var(--vfo-muted)',
  }
}
