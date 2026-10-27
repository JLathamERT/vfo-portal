import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'

// Every portal's tab bar (2026-10-27). Body is overflow-x: clip, so a tab past the
// right edge on a narrower window was cut off with no way to reach it (a member
// could not find Vault). When the full row stops fitting, the bar collapses to the
// current tab + a Menu button that slides in a panel listing every tab. The row
// stays rendered (hidden) so its natural width is measured against the bar's at
// every size — the switch follows each user's own tab set, not a fixed width.
//
// items: [{ key, label, active?, badge?, onSelect?, options?: items }]
//   onSelect = a pickable entry; options = a group. Every group folds, the same as
//   the bar's own dropdowns (Advisors ▾, More ▸ Accounting ▸ Members), and opens on
//   its own when it holds the active entry.

function HamburgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function Badge({ n }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '18px', height: '18px', padding: '0 5px', borderRadius: '999px', background: '#e74c3c', color: '#fff', fontSize: '11px', fontWeight: 700 }}>{n}</span>
}

const holdsActive = item => !!item.active || (item.options || []).some(holdsActive)

function DrawerEntry({ item, depth, onClose }) {
  const active = !!item.active
  return (
    <button onClick={() => { item.onSelect(); onClose() }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left', padding: depth ? `9px 12px 9px ${12 + depth * 12}px` : '11px 12px', border: 'none', borderRadius: '10px', background: active ? 'rgba(0,149,255,0.12)' : 'transparent', color: active ? 'var(--vfo-accent-text)' : 'var(--vfo-ink)', fontSize: depth ? '15px' : '17px', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--vfo-tint)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
      {item.label}{item.badge > 0 && <Badge n={item.badge} />}
    </button>
  )
}

function DrawerGroup({ item, depth, onClose }) {
  const [open, setOpen] = useState(() => holdsActive(item))
  const current = holdsActive(item)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: depth ? `9px 12px 9px ${12 + depth * 12}px` : '11px 12px', border: 'none', borderRadius: '10px', background: 'transparent', color: current ? 'var(--vfo-accent-text)' : 'var(--vfo-ink)', fontSize: depth ? '15px' : '17px', fontWeight: current ? 600 : (depth ? 500 : 400), cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--vfo-tint)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {item.label}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, opacity: 0.7, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      {open && <DrawerList items={item.options} depth={depth + 1} onClose={onClose} />}
    </div>
  )
}

function DrawerList({ items, depth, onClose }) {
  return items.map(item => item.options
    ? <DrawerGroup key={item.key} item={item} depth={depth} onClose={onClose} />
    : <DrawerEntry key={item.key} item={item} depth={depth} onClose={onClose} />)
}

function NavDrawer({ open, onClose, items }) {
  // Bumped on every open: the list remounts, so each visit starts at the top with
  // only the active entry's groups unfolded, whatever was opened last time.
  const [visit, setVisit] = useState(0)
  useLayoutEffect(() => { if (open) setVisit(v => v + 1) }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return createPortal(
    <div aria-hidden={!open} style={{ position: 'fixed', inset: 0, zIndex: 1000, pointerEvents: open ? 'auto' : 'none', fontFamily: 'Inter, sans-serif' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(8,20,45,0.45)', opacity: open ? 1 : 0, transition: 'opacity 0.2s ease' }} />
      <nav role="dialog" aria-label="Menu" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(360px, 88vw)', background: 'var(--vfo-card)', boxShadow: '-14px 0 36px rgba(20,45,95,0.18)', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.25s ease', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 16px 4px' }}>
          <button onClick={onClose} aria-label="Close menu" style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', background: 'var(--vfo-tint)', color: 'var(--vfo-ink)', fontSize: '18px', lineHeight: 1, cursor: 'pointer' }}>×</button>
        </div>
        <div key={visit} style={{ overflowY: 'auto', padding: '0 12px 24px' }}>
          <DrawerList items={items} depth={0} onClose={onClose} />
        </div>
      </nav>
    </div>,
    document.body,
  )
}

// barStyle: the bar's own look (each portal keeps its border / shadow / z-index).
// rowStyle: extra flex styles for the full row (e.g. alignItems).
// currentLabel / currentBadge: what the collapsed bar shows on the left.
export default function CollapsibleNavBar({ items, currentLabel, currentBadge, barStyle, rowStyle, children }) {
  const barRef = useRef(null)
  const rowRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  useLayoutEffect(() => {
    const bar = barRef.current, row = rowRef.current
    if (!bar || !row) return
    const measure = () => {
      const cs = getComputedStyle(bar)
      const room = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      setCollapsed(row.scrollWidth > room)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    ro.observe(row)
    return () => ro.disconnect()
  }, [])
  useEffect(() => { if (!collapsed) setDrawerOpen(false) }, [collapsed])

  return (
    <div ref={barRef} style={{ position: 'relative', borderBottom: '1px solid var(--vfo-border)', padding: '0 24px', background: 'var(--vfo-card)', ...barStyle }}>
      {collapsed && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '48px' }}>
          {currentLabel
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '14px 0', borderBottom: '2px solid var(--vfo-accent-text)', color: 'var(--vfo-accent-text)', fontSize: '14px', fontWeight: 600, fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' }}>{currentLabel}{currentBadge > 0 && <Badge n={currentBadge} />}</span>
            : <span />}
          <button onClick={() => setDrawerOpen(true)} aria-label="Open menu" aria-expanded={drawerOpen} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 4px', background: 'transparent', border: 'none', color: 'var(--vfo-ink)', fontSize: '14px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
            Menu <HamburgerIcon />
          </button>
        </div>
      )}
      {collapsed && <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} items={items} />}
      <div ref={rowRef} aria-hidden={collapsed} style={collapsed
        ? { display: 'flex', width: 'max-content', ...rowStyle, position: 'absolute', top: 0, left: barStyle?.paddingLeft ?? '24px', visibility: 'hidden', pointerEvents: 'none' }
        : { display: 'flex', width: 'max-content', ...rowStyle }}>
        {children}
      </div>
    </div>
  )
}
