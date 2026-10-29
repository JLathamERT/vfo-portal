import { useEffect, useRef, useState } from 'react'
import { useIsPhone } from '../../lib/useMediaQuery'

// The client page's program dropdown (Holistic Planning ▾ MAP 1 · Regular Priorities
// · Tax Priorities · PIP Meetings, Profile ▾ …). Moved out of pages/ClientDetail.jsx
// on 2026-10-28 so the client portal's My Progress tab (portal licensing L8) draws
// the very same strip.
export default function ClientTabDropdown({ label, isActive, options, onSelect }) {
  // Opens and closes instantly (Jake, 2026-10-19): a close delay left two menus
  // open at once when moving between neighbouring tabs. The menu sits flush under
  // the button inside this wrapper, so the pointer never leaves it on the way down.
  const [open, setOpen] = useState(false)
  // Phone (2026-10-28): no hover - a tap opens and closes it, a tap anywhere else
  // closes it, and a menu that would run off the right edge opens leftwards.
  const isPhone = useIsPhone()
  const wrapRef = useRef(null)
  const [alignRight, setAlignRight] = useState(false)
  useEffect(() => {
    if (!isPhone || !open) return
    const close = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [isPhone, open])
  function handleMouseEnter() { setOpen(true) }
  function handleMouseLeave() { setOpen(false) }
  function handleTap() {
    const r = wrapRef.current?.getBoundingClientRect()
    setAlignRight(!!r && r.left + 160 > window.innerWidth - 8)
    setOpen(o => !o)
  }
  return (
    <div ref={wrapRef} style={{ position: 'relative' }} {...(isPhone ? {} : { onMouseEnter: handleMouseEnter, onMouseLeave: handleMouseLeave })}>
      <button {...(isPhone ? { onClick: handleTap, 'aria-expanded': open } : {})} style={{ padding: '7px 10px 7px 12px', background: isActive ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: isActive ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', ...(isPhone && alignRight ? { right: 0 } : { left: 0 }), background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '160px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
          {options.map(opt => (
            <button key={opt.key} onClick={() => { onSelect(opt.key); setOpen(false) }}
              style={{ display: 'block', width: '100%', padding: '8px 16px', background: 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
