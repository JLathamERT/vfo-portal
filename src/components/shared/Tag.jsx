import { statusPillStyle } from './statusColors'

// The one tag look (2026-11-25): a tinted pill with a thin border, never clickable.
// A button is a rounded rectangle from buttonStyles.js, so the two can't be confused.
// `color` is a hex. ListPill and statusPillStyle draw the same look (one style).
export default function Tag({ color, children, style }) {
  return (
    <span style={{ ...statusPillStyle(color), cursor: 'inherit', ...style }}>
      {children}
    </span>
  )
}
