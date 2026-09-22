// One date formatter for every DISPLAY site in the portal: MM/DD/YYYY.
//
// NOT for an <input type="date"> value and NOT for a sort or comparison key —
// those must stay ISO (YYYY-MM-DD) or they silently break.
//
// A YYYY-MM-DD prefix is formatted by string surgery, never through `new Date()`:
// `new Date('2026-09-22')` parses as UTC midnight and renders in the browser's
// local zone, which prints the 21st for anyone west of Greenwich. Taking the
// first ten characters keeps the day byte-identical to the `split('T')[0]` /
// `slice(0, 10)` this replaces — only the format changes.
export function formatDate(value) {
  if (!value) return ''
  const s = String(value)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[2]}/${m[3]}/${m[1]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
}

// Same day, with a time appended — for the handful of places that render a
// stamp rather than a date. Falls back to the plain date when there is no time
// part to show.
export function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return formatDate(value)
  return `${formatDate(value)} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}
