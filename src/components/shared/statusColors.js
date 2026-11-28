import { readable } from './readableColor'

// A person's status colour - members (elite_status), specialists and tax planners
// (status) - for every dot, pill and KPI tile: Active green, Lost red, Removed
// DARK red (2026-10-28; Removed was grey on most screens). Hex, not a theme var,
// because callers build tints from it (`${colour}22`).
export const STATUS_COLORS = { Active: '#1b9254', Lost: '#e74c3c', Removed: '#9b1c1c' }

export function statusColor(status, fallback = 'var(--vfo-faint)') {
  return STATUS_COLORS[status] || fallback
}

// The tag look (shared/Tag.jsx) as a style, for a status pill drawn on a plain
// span: ListPill, a phone list card, a plan status. One look for every pill (Issue
// #661 part 6, 2026-11-28; it was 11px / 600 with no border before). Takes any
// hex; a theme var falls back to a neutral tint.
export function statusPillStyle(color) {
  const hex = typeof color === 'string' && color.startsWith('#')
  return {
    display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', lineHeight: '16px', padding: '0 8px', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'Inter, sans-serif',
    background: hex ? `${color}22` : 'var(--vfo-tint)',
    color: hex ? readable(color) : 'var(--vfo-muted)',
    border: `1px solid ${hex ? `${color}4d` : 'var(--vfo-border-chip)'}`,
  }
}
