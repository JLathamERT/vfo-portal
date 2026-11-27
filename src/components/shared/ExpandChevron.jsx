// The portal's open/close chevron (the trackers' ▼, HOUSE_STYLE §6): 10px, muted,
// turned over while open, inside a 28px square so it is easy to hit. With `onToggle`
// it is its own click target and stops the click reaching the row (a row that opens
// a plan on click keeps its chevron for the dropdown); without it the row's own click
// does the work and the chevron only shows the state.
export default function ExpandChevron({ open, onToggle, style }) {
  return (
    <span
      role={onToggle ? 'button' : undefined}
      aria-expanded={onToggle ? !!open : undefined}
      aria-label={onToggle ? (open ? 'Hide details' : 'Show details') : undefined}
      title={onToggle ? (open ? 'Hide details' : 'Show details') : undefined}
      onClick={onToggle ? e => { e.stopPropagation(); onToggle() } : undefined}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', flexShrink: 0, borderRadius: '6px', cursor: 'pointer', ...style }}
    >
      <span style={{ color: 'var(--vfo-muted)', fontSize: '10px', lineHeight: 1, transform: open ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▼</span>
    </span>
  )
}
