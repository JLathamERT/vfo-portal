import { useLayoutEffect, useRef, useState } from 'react'
import VfoWordmark from './VfoWordmark'
import NotificationBell from '../NotificationBell'

// The ONE portal top bar (2026-10-20): every portal page and the client page draw
// this, so the bar and its buttons are identical wherever you are. The page's nav
// bar goes in `children` and sticks WITH the bar, so neither scrolls away.
// The buttons deliberately carry no fontFamily - the portal pages never set one,
// and a different font on one page is what made the right-hand group shift.
// actions: [{ key, label, onClick, tone?: 'gold', active?: bool }]
//
// Compact (2026-10-27): when the full bar does not fit (a phone), the name is
// dropped and each action becomes a round icon button (label on hover / to screen
// readers) instead of the row squashing and the buttons wrapping. Measured, not a
// fixed width: the bar overflows first, then switches; it switches back once the
// width the full bar needed is available again.

const ICON_PROPS = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }
const ACTION_ICONS = {
  settings: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  signout: (
    <svg {...ICON_PROPS}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  ),
  editor: (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  ),
}

export default function PortalHeader({ name, onTitleClick, actions = [], showBell = true, children = null }) {
  const barRef = useRef(null)
  const neededRef = useRef(0)
  const compactRef = useRef(false)
  const [compact, setCompactState] = useState(false)
  const setCompact = v => { compactRef.current = v; setCompactState(v) }
  const actionsKey = actions.map(a => a.key + ':' + a.label).join('|')
  // A new name or button set can change the width the full bar needs: start from
  // the full bar again and let the measure below decide.
  useLayoutEffect(() => { setCompact(false) }, [name, actionsKey])
  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const measure = () => {
      if (!compactRef.current) {
        if (bar.scrollWidth > bar.clientWidth) { neededRef.current = bar.scrollWidth; setCompact(true) }
      } else if (bar.clientWidth >= neededRef.current) {
        setCompact(false)
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    return () => ro.disconnect()
  }, [compact, name, actionsKey])

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 100 }}>
      {/* Above the nav bar inside this block, so the bell's dropdown paints over it. */}
      <div ref={barRef} style={{ background: 'linear-gradient(90deg, #002973 0%, #125ecc 100%)', padding: compact ? '0 16px' : '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', height: '58px', position: 'relative', zIndex: 2, boxShadow: '0 2px 12px rgba(0,41,115,0.25)' }}>
        <VfoWordmark size={compact ? 15 : 17} light onClick={onTitleClick} style={{ flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: compact ? '8px' : '12px', flexShrink: 0 }}>
          {showBell && <NotificationBell />}
          {!compact && <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.88)', fontWeight: 500, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name || ''}</span>}
          {actions.map(a => {
            const gold = a.tone === 'gold'
            const colours = gold
              ? { border: '1px solid rgba(255,205,150,0.5)', background: 'transparent', color: '#ffd9a0' }
              : { border: '1px solid rgba(255,255,255,0.32)', background: a.active ? 'rgba(255,255,255,0.18)' : 'transparent', color: '#fff' }
            return compact ? (
              <button key={a.key} onClick={a.onClick} title={a.label} aria-label={a.label}
                style={{ ...colours, width: '36px', height: '36px', padding: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
                {ACTION_ICONS[a.key] || a.label.charAt(0)}
              </button>
            ) : (
              <button key={a.key} onClick={a.onClick}
                style={{ ...colours, padding: '6px 16px', borderRadius: '99px', fontWeight: gold ? 500 : undefined, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {a.label}
              </button>
            )
          })}
        </div>
      </div>
      {children && <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>}
    </div>
  )
}
