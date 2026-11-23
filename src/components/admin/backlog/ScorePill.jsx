import { hexA } from '../KpiKit'

// Urgency / importance as a coloured pill: grey 1, blue 2, amber 3, orange 4,
// red 5. An imported row with no score shows a dash on an outline pill.
// `numberOnly` drops the label from the pill (a table column already names it).
const SCORE_COLORS = { 1: '#8a9bbd', 2: '#0a85e8', 3: '#c98a14', 4: '#e06717', 5: '#e74c3c' }

export default function ScorePill({ label, value, size = 'sm', numberOnly = false }) {
  const color = SCORE_COLORS[value]
  const big = size === 'md'
  return (
    <span title={`${label}: ${value ?? 'not set'} of 5`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '999px', whiteSpace: 'nowrap',
        padding: big ? '4px 11px' : '3px 10px', fontSize: big ? '12.5px' : '12px', fontWeight: 700, lineHeight: 1.4,
        background: color ? hexA(color, 0.14) : 'transparent',
        border: `1px solid ${color ? hexA(color, 0.45) : 'var(--vfo-border-mid)'}`,
        color: color || 'var(--vfo-faint)',
      }}>
      {numberOnly ? null : <>{label} </>}<span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{value ?? '–'}</span>
    </span>
  )
}
