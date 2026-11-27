// Shared style tokens + tiny atoms for the Growth Plan views. The look is the
// house one (2026-11-27 refresh): ProfileKit boxes and form fields, buttonStyles
// buttons, the one Tag, and the Accounting sub-tab pills.
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import SubTabs from '../shared/SubTabs'
import { btnPrimary, btnSecondary, btnOutline, btnState } from '../shared/buttonStyles'
import { formInput, profileCardStyle, subLabel } from '../shared/ProfileKit'
import Tag from '../shared/Tag'

export const NAVY = '#002973', BLUE = '#125ecc', INK = 'var(--vfo-ink)', MUTED = 'var(--vfo-muted)'
export const GREEN = '#1b9254', AMBER = '#e06717', GREY = 'var(--vfo-muted)'

// ProfileKit's form field, without its full width (callers size it), a size
// smaller so the dense step rows and table cells keep their room.
const { width: _w, ...formField } = formInput
export const inputStyle = { ...formField, padding: '8px 11px', fontSize: '13px' }
export const cardStyle = profileCardStyle
export const eyebrowLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase' }
export const miniLabel = { ...subLabel, marginBottom: '6px' }
// An inline form inside a box (add a priority, add a sub-task): a soft tile on a
// computer; on a phone just a hairline above it, so its fields do not sit behind
// the page gutter + box padding + tile padding (TEAM_RULES section 9, no double padding).
export const formTileStyle = { background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '14px 16px' }
export const phoneFormStyle = { borderTop: '1px solid var(--vfo-border-soft)', paddingTop: '12px' }
// A list row's hairline: none on the first row (the box header already draws one).
export const rowRule = (i) => ({ borderTop: i > 0 ? '1px solid var(--vfo-border-soft)' : 'none' })

// The page's sub-tabs: the round pills of AccountingCombinedPanel. `tabs` =
// [{ key, label, phoneLabel? }]. Phone: smaller pills, so the three member tabs
// sit on one row.
export function GrowthTabs({ tabs, active, onChange }) {
  return <SubTabs tabs={tabs} active={active} onChange={onChange} style={{ marginBottom: 0 }} />
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
      {cta && <button onClick={onClick} style={btnOutline}>{cta}</button>}
    </div>
  )
}

// The step's big buttons (Continue, Generate Score): the primary button at the
// size of ProfileKit's SaveBar.
export const BTN_LARGE = { padding: '10px 26px', fontSize: '14px' }

// Bottom step navigation: ← Back (left, optional) + a primary forward action
// (right, optional). `secondary` renders next to Back (e.g. a counts line).
export function StepNav({ onBack, onNext, nextLabel = 'Continue →', busy, secondary }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', marginTop: '10px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        {onBack && <button onClick={onBack} disabled={busy} style={btnState({ ...btnSecondary, ...BTN_LARGE }, busy)}>← Back</button>}
        {secondary}
      </div>
      {onNext && <button onClick={onNext} disabled={busy} style={btnState({ ...btnPrimary, ...BTN_LARGE }, busy)}>{busy ? 'Saving…' : nextLabel}</button>}
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
  // The list narrows only to what was typed since it opened: opening it on a
  // picked name shows every name again, so another can be chosen (Jake 2026-11-27).
  const [typed, setTyped] = useState(false)
  const inputRef = useRef(null)
  const menuRef = useRef(null)

  function openMenu() {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect())
    if (!open) setTyped(false)
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
  const filtered = typed ? people.filter(n => n.toLowerCase().includes(q)) : people
  const exact = people.some(n => n.toLowerCase() === q)

  function pick(name) { onChange(name); if (onCommit) onCommit(name); setOpen(false) }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); if (!open) openMenu(); setTyped(true) }}
        onFocus={openMenu}
        onClick={openMenu}
        onBlur={() => { if (onCommit) onCommit(value); setOpen(false) }}
        placeholder={placeholder}
        title={value || undefined}
        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', paddingRight: '30px' }}
      />
      <span onMouseDown={e => { e.preventDefault(); open ? setOpen(false) : openMenu() }}
        style={{ position: 'absolute', right: '11px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--vfo-faint)', cursor: 'pointer' }}>▼</span>
      {open && rect && createPortal(
        // Sized to the room on screen (2026-11-27): under the box, or above it when
        // there is more room there, and never past the window's edge, so the list
        // always scrolls inside itself (scrolling the page closes it). Its own
        // scroll does not carry on into the page, and pressing its scrollbar does
        // not take the focus from the box (which would close it).
        <div ref={menuRef} onMouseDown={e => e.preventDefault()} style={{ position: 'fixed', ...menuPlace(rect), left: rect.left, width: rect.width, overflowY: 'auto', overscrollBehavior: 'contain', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-strong)', borderRadius: '10px', boxShadow: '0 12px 30px rgba(20,45,95,0.18)', zIndex: 1000, fontFamily: 'Inter, sans-serif' }}>
          {filtered.map(n => <ComboOpt key={n} label={n} isAdmin={adminSet?.has(n.toLowerCase())} active={n.toLowerCase() === q} onPick={() => pick(n)} />)}
          {typed && q && !exact && <ComboOpt label={`+ Add "${value.trim()}"`} accent topBorder={filtered.length > 0} onPick={() => pick(value.trim())} />}
          {!filtered.length && !q && <div style={{ padding: '11px 14px', fontSize: '12px', color: 'var(--vfo-faint)' }}>No names yet — type to add one.</div>}
        </div>, document.body)}
    </div>
  )
}

// Where the name list opens: below the box with up to 224px, or above it when
// below has under 160px and above has more.
function menuPlace(rect) {
  const gap = 4, edge = 8, full = 224
  const below = window.innerHeight - rect.bottom - gap - edge
  const above = rect.top - gap - edge
  if (below >= Math.min(full, 160) || below >= above) return { top: rect.bottom + gap, maxHeight: Math.max(96, Math.min(full, below)) }
  return { bottom: window.innerHeight - rect.top + gap, maxHeight: Math.min(full, above) }
}

function ComboOpt({ label, onPick, active, accent, topBorder, isAdmin }) {
  const [hover, setHover] = useState(false)
  return (
    <div onMouseDown={e => { e.preventDefault(); onPick() }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer', color: accent ? BLUE : INK, fontWeight: (accent || active) ? 700 : 500, background: hover ? 'var(--vfo-tint)' : (active ? 'var(--vfo-page)' : 'var(--vfo-card)'), borderTop: topBorder ? '1px solid var(--vfo-tint)' : 'none' }}>
      <span>{label}</span>
      {isAdmin && <Tag color={BLUE} style={{ flexShrink: 0 }}>Admin</Tag>}
    </div>
  )
}
