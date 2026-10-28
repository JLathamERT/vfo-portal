// An email address that, when it must wrap (a narrow phone column), breaks just
// before the @ - "ianwelhamall" / "@gmail.com" - never mid-word. A part still
// too long for its column falls back to breaking anywhere.
export default function EmailText({ email, style }) {
  const s = String(email || '')
  const at = s.indexOf('@')
  return (
    <span style={{ overflowWrap: 'anywhere', ...style }}>
      {at > 0 ? <>{s.slice(0, at)}<wbr />{s.slice(at)}</> : s}
    </span>
  )
}
