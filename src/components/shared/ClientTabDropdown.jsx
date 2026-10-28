import { useState } from 'react'

// The client page's program dropdown (Holistic Planning ▾ MAP 1 · Regular Priorities
// · Tax Priorities · PIP Meetings, Profile ▾ …). Moved out of pages/ClientDetail.jsx
// on 2026-10-28 so the client portal's My Progress tab (portal licensing L8) draws
// the very same strip.
export default function ClientTabDropdown({ label, isActive, options, onSelect }) {
  // Opens and closes instantly (Jake, 2026-10-19): a close delay left two menus
  // open at once when moving between neighbouring tabs. The menu sits flush under
  // the button inside this wrapper, so the pointer never leaves it on the way down.
  const [open, setOpen] = useState(false)
  function handleMouseEnter() { setOpen(true) }
  function handleMouseLeave() { setOpen(false) }
  return (
    <div style={{ position: 'relative' }} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <button style={{ padding: '7px 10px 7px 12px', background: isActive ? '#125ecc' : 'transparent', border: 'none', borderRadius: '999px', boxShadow: isActive ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: isActive ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
        {label}<span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, background: 'var(--vfo-card)', border: '1px solid var(--vfo-border)', borderRadius: '12px', minWidth: '160px', zIndex: 200, padding: '4px 0', boxShadow: '0 14px 36px rgba(20,45,95,0.16)' }}>
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
