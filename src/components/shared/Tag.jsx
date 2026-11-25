import { readable } from './readableColor'

// The one tag look (2026-11-25): a tinted pill with a thin border, never clickable.
// A button is a rounded rectangle from buttonStyles.js, so the two can't be confused.
// `color` is a hex.
export default function Tag({ color, children, style }) {
  return (
    <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 700, letterSpacing: '0.3px', lineHeight: '16px', padding: '0 8px', borderRadius: '999px', whiteSpace: 'nowrap', cursor: 'inherit', background: `${color}22`, color: readable(color), border: `1px solid ${color}4d`, fontFamily: 'Inter, sans-serif', ...style }}>
      {children}
    </span>
  )
}
