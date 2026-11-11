import { useLayoutEffect, useRef, useState } from 'react'
import { msmTypeCounts } from './msmMeetingTypes'

const line = 'var(--vfo-border)'
const GAP = 8

// The Meeting Summary's combined MSM counter: one count per meeting type side
// by side, split by a faint line, then a faint rule and the title at the bottom
// like every other counter. The type labels are a touch smaller than the
// title (Paxton, 2026-11-11) so equal halves fit a 1280-wide admin tile. The
// two halves are equal so the split sits under the title's middle. A tighter
// box sizes each half to its label, and only a box too narrow for both labels
// on one line stacks the counts, so no word breaks.
export default function MsmMeetingsCounter({ meetings, numberStyle, labelStyle, ruleInset = 0 }) {
  const counts = msmTypeCounts(meetings)
  const boxRef = useRef(null)
  const [layout, setLayout] = useState('equal')

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const room = box.getBoundingClientRect().width
      if (!room) return
      const widths = [...box.querySelectorAll('[data-msm-label]')].map(el => el.getBoundingClientRect().width)
      const extra = GAP * 2 + 1 - 2
      setLayout(Math.max(...widths) * 2 + extra <= room ? 'equal'
        : widths[0] + widths[1] + extra <= room ? 'fit'
        : 'stacked')
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  const stacked = layout === 'stacked'

  const half = ([label, count]) => (
    <div key={label} style={{ minWidth: 0, textAlign: 'center' }}>
      <div style={numberStyle}>{count}</div>
      <div data-msm-label style={{ ...labelStyle, fontSize: '10px', letterSpacing: '0.5px', marginTop: '3px', whiteSpace: 'nowrap', display: 'inline-block' }}>{label}</div>
    </div>
  )

  return (
    <div ref={boxRef} style={{ textAlign: 'center' }}>
      {stacked ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {half(counts[0])}
          <div style={{ height: '1px', background: line, margin: `0 ${ruleInset}px` }} />
          {half(counts[1])}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: layout === 'fit' ? 'auto 1px auto' : 'minmax(0, 1fr) 1px minmax(0, 1fr)', justifyContent: 'center', columnGap: `${GAP}px`, alignItems: 'center' }}>
          {half(counts[0])}
          <div style={{ width: '1px', alignSelf: 'stretch', background: line }} />
          {half(counts[1])}
        </div>
      )}
      <div style={{ height: '1px', background: line, margin: `6px ${ruleInset}px` }} />
      <div style={labelStyle}>MSM Meetings</div>
    </div>
  )
}
