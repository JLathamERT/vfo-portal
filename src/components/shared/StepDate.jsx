// The date at the right end of every tracker step row (HOUSE_STYLE §6).
//
// Read-only everywhere (Jake 2026-11-28: no step date is hand-edited): the date
// the step's save or the system recorded, as 60px of text, MM/DD/YYYY and no
// more, ending at the row's right edge. It holds the same slot empty or not, so
// the controls and dates of every row line up. `value` is a YYYY-MM-DD string,
// or a timestamp (shown as the viewer's day).
import { formatDate, isoDay } from '../../lib/dates'

export const STEP_DATE_WIDTH = '60px'
const slotStyle = { display: 'inline-block', width: STEP_DATE_WIDTH, flexShrink: 0, fontSize: '11px', color: 'var(--vfo-muted)', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box', textAlign: 'right' }

export default function StepDate({ value }) {
  const day = isoDay(value)
  return <span className="vfo-stepdate" style={slotStyle}>{day ? formatDate(value) : ''}</span>
}
