// Shared UI for the internal-vs-member-visible note treatment (Phase 3).
//
//  • VisibilityBadge  — an "Internal" (amber) or "Shared with member" (teal)
//    pill; the two colors are reserved for visibility (no other note tag uses
//    them) so the state reads at a glance.
//  • noteTint         — matching subtle row-background hue per visibility.
//  • SaveVisibilityButtons — the two-button save row: "Save internal" (default)
//    and "Save & share with member". onSave receives ('internal' | 'shared').

const TEAL = '#0d9488'
const AMBER = '#b45309'

export function VisibilityBadge({ visibility, style }) {
  const shared = visibility === 'shared'
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
      background: shared ? 'rgba(13,148,136,0.12)' : 'rgba(180,83,9,0.12)',
      color: shared ? TEAL : AMBER,
      border: shared ? '1px solid rgba(13,148,136,0.35)' : '1px solid rgba(180,83,9,0.35)',
      ...style,
    }}>
      {shared ? 'Shared with member' : 'Internal'}
    </span>
  )
}

// "Member" pill on a note a member wrote (client_notes.author_type, 2026-11-12),
// shown on both portals. Violet: teal/amber mean visibility, and navy vanishes
// on the dark theme's navy surface.
export function MemberBadge({ style }) {
  return (
    <span style={{
      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
      background: 'rgba(124,92,214,0.14)', color: '#7c5cd6', border: '1px solid rgba(124,92,214,0.45)',
      ...style,
    }}>
      Member
    </span>
  )
}

export const isMemberNote = (note) => note?.author_type === 'member'

// Row-background hue matching the badge, for whole-note rows/cards.
export function noteTint(visibility) {
  return visibility === 'shared' ? 'rgba(13,148,136,0.05)' : 'rgba(180,83,9,0.045)'
}

// Two-button save row. `saving` disables both; `disabled` (e.g. empty text)
// also disables. `size` = 'sm' for the compact inline variant.
export function SaveVisibilityButtons({ onSave, saving = false, disabled = false, size = 'md', hint = true, internalLabel = 'Save internal', sharedLabel = 'Save & share with member' }) {
  const pad = size === 'sm' ? '6px 12px' : '8px 16px'
  const font = size === 'sm' ? '11px' : '12px'
  const off = saving || disabled
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => onSave('internal')} disabled={off}
          style={{ padding: pad, borderRadius: '8px', background: off ? '#93b4e8' : 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', border: 'none', color: '#fff', fontSize: font, cursor: off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
          {saving ? 'Saving...' : internalLabel}
        </button>
        <button onClick={() => onSave('shared')} disabled={off}
          style={{ padding: pad, borderRadius: '8px', background: off ? 'rgba(27,146,84,0.4)' : 'linear-gradient(135deg, #1b9254 0%, #23b268 100%)', border: 'none', boxShadow: off ? 'none' : '0 2px 8px rgba(27,146,84,0.28)', color: '#fff', fontSize: font, cursor: off ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter, sans-serif' }}>
          {saving ? 'Saving...' : sharedLabel}
        </button>
      </div>
      {hint && <span style={{ fontSize: '10.5px', color: 'var(--vfo-faint)' }}>{typeof hint === 'string' ? hint : 'Internal notes stay private to the team. Shared notes appear in the member portal.'}</span>}
    </div>
  )
}
