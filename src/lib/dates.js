// One date formatter for every DISPLAY site in the portal: MM/DD/YYYY, and
// MM/DD/YYYY h:mm AM/PM for a stamp with its time (HOUSE_STYLE §1, Jake 2026-11-27).
//
// NOT for an <input type="date"> value and NOT for a sort or comparison key —
// those must stay ISO (YYYY-MM-DD) or they silently break.
//
// Two kinds of value come in:
// - A calendar DATE ("2026-09-22", or a date with a time but no zone) is
//   formatted by string surgery, never through `new Date()`: `new Date('2026-09-22')`
//   parses as UTC midnight and renders in the browser's local zone, which prints
//   the 21st for anyone west of Greenwich.
// - A MOMENT (a timestamptz such as created_at / paid_at, which always carries
//   "Z" or "+00:00") shows the day it was where the viewer is. Its first ten
//   characters are the UTC day, which is tomorrow for anything after 7 pm Eastern.
//
// `empty` is what an empty value shows: '' by default, '—' in a table cell.

const MOMENT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$/i
const pad = n => String(n).padStart(2, '0')

function localDay(d) {
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
}

export function formatDate(value, empty = '') {
  if (value === null || value === undefined || value === '') return empty
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? empty : localDay(value)
  const s = String(value).trim()
  if (MOMENT.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return localDay(d)
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[2]}/${m[3]}/${m[1]}`
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return localDay(d)
}

// The same rules, as the YYYY-MM-DD an <input type="date"> (StepDate) holds:
// a calendar date as stored, a moment as the viewer's own day.
export function isoDay(value) {
  if (value === null || value === undefined || value === '') return ''
  const s = String(value).trim()
  if (MOMENT.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

// The same day with its time, in the viewer's zone. A bare date has no time to
// show, so it falls back to the plain date.
export function formatDateTime(value, empty = '') {
  if (value === null || value === undefined || value === '') return empty
  const s = value instanceof Date ? null : String(value).trim()
  if (s !== null && /^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDate(s, empty)
  const d = value instanceof Date ? value : new Date(s)
  if (Number.isNaN(d.getTime())) return formatDate(value, empty)
  return `${localDay(d)} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
}
