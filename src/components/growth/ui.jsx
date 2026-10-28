// Shared style tokens + tiny atoms for the Growth Plan views (portal vibe).
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useIsPhone } from '../../lib/useMediaQuery'

export const NAVY = '#002973', BLUE = '#125ecc', INK = 'var(--vfo-ink)', MUTED = 'var(--vfo-muted)'
export const GREEN = '#1b9254', AMBER = '#e06717', GREY = 'var(--vfo-muted)'

export const inputStyle = { padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: INK, fontSize: '13px', fontFamily: 'Inter, sans-serif' }
export const cardStyle = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '18px', overflow: 'hidden' }
export const accentStrip = { height: '3px', background: 'linear-gradient(90deg, #125ecc 0%, #0a85e8 100%)' }
export const eyebrowLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase' }
export const miniLabel = { fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--vfo-faint)', marginBottom: '6px' }
export const pillSolid = { padding: '9px 20px', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', boxShadow: '0 4px 14px rgba(18,94,204,0.32)', whiteSpace: 'nowrap' }
export const pillOutline = { padding: '8px 16px', borderRadius: '999px', border: `1px solid ${BLUE}`, background: 'transparent', color: BLUE, fontWeight: 600, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }
export const pillGhost = { padding: '11px 20px', borderRadius: '999px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: MUTED, fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }

// Rounded pill tab switcher used by the member Growth Plan tabs and the admin
// One Page Plan "Add Priorities" switcher. `tabs` = [{ key, label }].
// Phone: smaller pills, so the three member tabs sit on one row.
export function GrowthTabs({ tabs, active, onChange }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ display: 'flex', gap: isPhone ? '6px' : '8px', flexWrap: 'wrap' }}>
      {tabs.map(t => {
        const on = active === t.key
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            padding: isPhone ? '6px 12px' : '8px 18px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
            fontSize: isPhone ? '12px' : '13px', fontWeight: on ? 700 : 600, whiteSpace: 'nowrap',
            border: on ? 'none' : '1px solid var(--vfo-border-strong)',
            background: on ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : '#fff',
            color: on ? '#fff' : MUTED,
          }}>{isPhone && t.phoneLabel ? t.phoneLabel : t.label}</button>
        )
      })}
    </div>
  )
}

export function NumBadge({ n }) {
  return <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-chip)', color: MUTED, fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
}

// Vertical radio set (wrap in a flex-row container to lay them out inline).
export function Radios({ name, value, onChange, options }) {
  return (
    <>
      {options.map(o => {
        const on = value === o.value
        const color = o.color || BLUE
        return (
          <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', cursor: 'pointer', fontWeight: on ? 700 : 500, color: on ? color : 'var(--vfo-muted)', marginBottom: '6px', whiteSpace: 'nowrap' }}>
            <input type="radio" name={name} checked={on} onChange={() => onChange(o.value)} style={{ accentColor: color }} />
            {o.label}
          </label>
        )
      })}
    </>
  )
}

export function GrowthNeed({ text, cta, onClick }) {
  return (
    <div style={{ padding: '44px', textAlign: 'center', color: MUTED }}>
      <div style={{ fontSize: '14px', marginBottom: cta ? '14px' : 0, lineHeight: 1.5 }}>{text}</div>
      {cta && <button onClick={onClick} style={pillOutline}>{cta}</button>}
    </div>
  )
}

// Bottom step navigation: ← Back (left, optional) + a primary forward action
// (right, optional). `secondary` renders next to Back (e.g. a counts line).
export function StepNav({ onBack, onNext, nextLabel = 'Continue →', busy, secondary }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginTop: '10px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {onBack && <button onClick={onBack} disabled={busy} style={pillGhost}>← Back</button>}
        {secondary}
      </div>
      {onNext && <button onClick={onNext} disabled={busy} style={{ ...pillSolid, padding: '12px 28px', fontSize: '14px', opacity: busy ? 0.7 : 1 }}>{busy ? 'Saving…' : nextLabel}</button>}
    </div>
  )
}

// Merge a plan-local name list with the system admin names into one deduped,
// sorted pool (admins listed alongside typed names). Returns { pool, adminSet }
// where adminSet (lowercased) lets NameCombo tag which options are real admins.
export function buildNamePool(planNames = [], adminNames = []) {
  const admins = adminNames.filter(n => n && n.trim()).map(n => n.trim())
  const adminSet = new Set(admins.map(n => n.toLowerCase()))
  const seen = new Set(admins.map(n => n.toLowerCase()))
  const pool = [...admins]
  for (const n of planNames) {
    const t = (n || '').trim()
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); pool.push(t) }
  }
  pool.sort((a, b) => a.localeCompare(b))
  return { pool, adminSet }
}

// Styled name combobox — pick an existing name from the pool (plan-local names +
// every admin in the system, admins tagged) or type a new one. The menu is
// portaled to <body> so a card's overflow:hidden can't clip it, positioned to
// the input via its viewport rect (closes on scroll/resize). `onCommit(value)`
// fires on pick and on blur so callers can persist the committed value.
export function NameCombo({ value, onChange, onCommit, people = [], adminSet, placeholder }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState(null)
  const inputRef = useRef(null)
  const menuRef = useRef(null)

  function openMenu() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect())
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    // Close when the PAGE scrolls (the fixed menu would drift from the input),
    // but NOT when the scroll happens inside the menu's own list.
    const onScroll = (e) => { if (menuRef.current && menuRef.current.contains(e.target)) return; setOpen(false) }
    const onResize = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const q = (value || '').trim().toLowerCase()
  const filtered = people.filter(n => n.toLowerCase().includes(q))
  const exact = people.some(n => n.toLowerCase() === q)

  function pick(name) { onChange(name); if (onCommit) onCommit(name); setOpen(false) }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); if (!open) openMenu() }}
        onFocus={openMenu}
        onClick={openMenu}
        onBlur={() => { if (onCommit) onCommit(value); setOpen(false) }}
        placeholder={placeholder}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', paddingRight: '30px' }}
      />
      <span onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openMenu() }}
        style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--vfo-faint)', cursor: 'pointer' }}>▼</span>
      {open && rect && createPortal(
        <div ref={menuRef} style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, maxHeight: '224px', overflowY: 'auto', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '10px', boxShadow: '0 12px 30px rgba(20,45,95,0.18)', zIndex: 1000, fontFamily: 'Inter, sans-serif' }}>
          {filtered.map(n => <ComboOpt key={n} label={n} isAdmin={adminSet?.has(n.toLowerCase())} active={n.toLowerCase() === q} onPick={() => pick(n)} />)}
          {q && !exact && <ComboOpt label={`+ Add "${value.trim()}"`} accent topBorder={filtered.length > 0} onPick={() => pick(value.trim())} />}
          {!filtered.length && !q && <div style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--vfo-faint)' }}>No names yet — type to add one.</div>}
        </div>, document.body)}
    </div>
  )
}

function ComboOpt({ label, onPick, active, accent, topBorder, isAdmin }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseDown={e => { e.preventDefault(); onPick() }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: accent ? BLUE : INK, fontWeight: (accent || active) ? 700 : 500, background: hover ? 'var(--vfo-tint)' : (active ? 'var(--vfo-page)' : 'var(--vfo-card)'), borderTop: topBorder ? '1px solid var(--vfo-tint)' : 'none' }}>
      <span>{label}</span>
      {isAdmin && <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', color: '#fff', background: BLUE, borderRadius: '5px', padding: '2px 6px', flexShrink: 0 }}>Admin</span>}
    </div>
  )
}
