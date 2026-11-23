import { hexA } from '../KpiKit'

// Release importance (Backlog 5b): the gold "Big news" badge on the Requests
// rows, the archive and the drawer; `ReleaseImportancePill` below shows every
// level on the Tasks board and What's new cards.
export const GOLD = '#c98a14'

export default function BigNewsBadge({ request: r, size = 'sm' }) {
  if (r?.release_importance !== 'big') return null
  const big = size === 'md'
  return (
    <span title="Release importance: Big news" style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px', whiteSpace: 'nowrap', verticalAlign: 'middle',
      padding: big ? '3px 10px' : '2px 8px', fontSize: big ? '11.5px' : '11px', fontWeight: 800, letterSpacing: '0.3px', lineHeight: 1.4,
      background: hexA(GOLD, 0.16), border: `1px solid ${hexA(GOLD, 0.6)}`, color: 'var(--vfo-gold-text)',
    }}>
      Big news
    </span>
  )
}

// Every level as a pill, on the Tasks board cards and the What's new cards
// (Paxton 2026-11-23): gold Big news, blue Normal, grey Minor.
const LEVEL_PILL = {
  big: { label: 'Big news', color: GOLD, text: 'var(--vfo-gold-text)', weight: 800 },
  normal: { label: 'Normal', color: '#125ecc', text: 'var(--vfo-link)', weight: 700 },
}
export function ReleaseImportancePill({ request: r }) {
  const level = r?.release_importance || 'normal'
  if (level === 'minor') return <MinorTag />
  const p = LEVEL_PILL[level] || LEVEL_PILL.normal
  return (
    <span title={`Release importance: ${p.label}`} style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px', whiteSpace: 'nowrap', verticalAlign: 'middle',
      padding: '2px 8px', fontSize: '11px', fontWeight: p.weight, letterSpacing: '0.3px', lineHeight: 1.4,
      background: hexA(p.color, level === 'big' ? 0.16 : 0.1), border: `1px solid ${hexA(p.color, level === 'big' ? 0.6 : 0.35)}`, color: p.text,
    }}>
      {p.label}
    </span>
  )
}

export function MinorTag() {
  return (
    <span title="Release importance: Minor" style={{
      display: 'inline-flex', alignItems: 'center', borderRadius: '999px', whiteSpace: 'nowrap', verticalAlign: 'middle',
      padding: '2px 8px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.3px', lineHeight: 1.4,
      background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: 'var(--vfo-faint)',
    }}>
      Minor
    </span>
  )
}
