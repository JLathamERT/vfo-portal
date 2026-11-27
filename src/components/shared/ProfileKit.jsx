import { useRef } from 'react'
import { useIsPhone } from '../../lib/useMediaQuery'
import { btnPrimary, btnSecondary, btnState } from './buttonStyles'

// The profile look (2026-11-26): every person's profile - member, client,
// specialist, tax planner - and every Settings page builds its boxes from here,
// so they read as one family with the Growth Credits and Events pages. A box is a
// rounded card with an icon badge + title header over a hairline, and its facts
// sit in soft tiles. Themed through var(--vfo-*), so light and dark both work.

export const PROFILE_GRADIENT = 'linear-gradient(90deg, #002973 0%, #125ecc 55%, #0a85e8 100%)'

export const profileCardStyle = {
  background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px',
  boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden', marginBottom: '16px',
}

// Small uppercase label inside a box (a group of people, a sub-section).
export const subLabel = { fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.8px', color: 'var(--vfo-faint)', textTransform: 'uppercase' }

// Feather-style outline icons for the box headers.
const ICONS = {
  id: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="2.2" /><path d="M5.8 16c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 9h4M14.5 12.5h4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="M8.6 13.4 7.5 21l4.5-2.5 4.5 2.5-1.1-7.6" /></>,
  dollar: <><circle cx="12" cy="12" r="9" /><path d="M14.8 9.2c-.5-1-1.5-1.6-2.8-1.6-1.6 0-2.8.8-2.8 2.1 0 3 5.8 1.5 5.8 4.4 0 1.3-1.3 2.2-3 2.2-1.4 0-2.5-.6-3-1.7M12 6v1.6M12 16.3V18" /></>,
  calculator: <><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="8.5" cy="9.5" r="1.8" /><path d="m21 15.5-5-5L5 20" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.9-3.2 3.4-5 6.5-5s5.6 1.8 6.5 5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 15.3c1.7.6 2.9 2.2 3.5 4.7" /></>,
  text: <><path d="M5 6h14M5 10h14M5 14h10M5 18h7" /></>,
  contacts: <><rect x="4" y="3" width="15" height="18" rx="2.5" /><circle cx="11.5" cy="10" r="2.5" /><path d="M7.5 17c.7-1.8 2.2-2.8 4-2.8s3.3 1 4 2.8M2.5 8h3M2.5 12h3M2.5 16h3" /></>,
  note: <><path d="M14 3H6.5A2.5 2.5 0 0 0 4 5.5v13A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V9z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></>,
  alert: <><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4.5M12 17h.01" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8h2.1A4.3 4.3 0 0 0 21 10.7C21 6.4 17 3 12 3z" /><circle cx="7.5" cy="11.5" r="1.1" /><circle cx="10" cy="7.5" r="1.1" /><circle cx="14.5" cy="7.5" r="1.1" /></>,
  camera: <><path d="M4 8h3l1.8-2.5h6.4L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.6" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-4h6v4M8.5 7h.01M12 7h.01M15.5 7h.01M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01M8.5 14h.01M12 14h.01M15.5 14h.01" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z" /><path d="m9 12 2 2 4-4" /></>,
  history: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 4v4.5h4.5M12 8v4.5l3 2" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2.5" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  flag: <><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
}

export function ProfileIcon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, display: 'block' }}>
      {ICONS[name] || ICONS.id}
    </svg>
  )
}

const TONES = {
  blue: { bg: 'var(--vfo-accent-tint)', fg: 'var(--vfo-accent-text)' },
  green: { bg: 'rgba(27,146,84,0.12)', fg: 'var(--vfo-success-text)' },
  gold: { bg: 'rgba(217,119,6,0.12)', fg: 'var(--vfo-gold-text)' },
  red: { bg: 'rgba(217,48,37,0.10)', fg: '#d93025' },
}

// The round-cornered square badge that heads a box.
export function IconBadge({ icon, tone = 'blue', size = 34 }) {
  const t = TONES[tone] || TONES.blue
  return (
    <span style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), background: t.bg, color: t.fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <ProfileIcon name={icon} size={Math.round(size * 0.53)} />
    </span>
  )
}

// One box: icon badge + title (+ a muted line, + an action on the right), a
// hairline, then the body. `tone="red"` is the Danger Zone. `flush` drops the body
// padding for a box whose content brings its own (a table, a list of rows).
export function ProfileCard({ icon, title, sub, action, tone = 'blue', children, style, bodyStyle, flush = false, id }) {
  const isPhone = useIsPhone()
  // No children = a title-bar-only box (the program header when not editing).
  const hasBody = children !== undefined && children !== null && children !== false
  return (
    <section id={id} style={{ ...profileCardStyle, ...style }}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: isPhone ? '13px 16px' : '15px 22px', borderBottom: hasBody ? '1px solid var(--vfo-border-soft)' : 'none', flexWrap: 'wrap' }}>
          {icon && <IconBadge icon={icon} tone={tone} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '15.5px', fontWeight: 800, letterSpacing: '-0.01em', color: tone === 'red' ? '#d93025' : 'var(--vfo-heading)', lineHeight: 1.25 }}>{title}</div>
            {sub && !isPhone && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '2px', lineHeight: 1.45 }}>{sub}</div>}
          </div>
          {action && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>{action}</div>}
          {/* On a phone a long intro under the title leaves the icon floating beside a
              paragraph, so the intro takes its own full-width line under the row. */}
          {sub && isPhone && <div style={{ flexBasis: '100%', fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '-4px', lineHeight: 1.45 }}>{sub}</div>}
        </div>
      )}
      {hasBody && <div style={{ padding: flush ? 0 : (isPhone ? '12px' : 'var(--vfo-card-pad)'), ...bodyStyle }}>{children}</div>}
    </section>
  )
}

// The facts of a box, in tiles. Phone: two short tiles side by side.
export function FieldGrid({ children, min = 190, phoneCols = 2, style }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? `repeat(${phoneCols}, minmax(0, 1fr))` : `repeat(auto-fill, minmax(${min}px, 1fr))`, gap: isPhone ? '8px' : '10px', ...style }}>
      {children}
    </div>
  )
}

const isEmpty = (v) => v == null || v === '' || v === '—' || v === false

// One fact: a small label over its value, in a soft tile. An empty value shows a
// faint dash. `wide` spans the whole grid row (a long website, a note).
// `nowrap` keeps the value on one line (emails, websites). Lay those out in a
// grid wide enough to hold them (FieldGrid min 360, one per row on a phone); the
// "…" cut is only a last resort for an unusually long address.
export function Field({ label, children, wide = false, nowrap = false, style }) {
  const isPhone = useIsPhone()
  const empty = isEmpty(children)
  const oneLine = nowrap && !empty
  // A one-line value too long for half a row (a long email) takes the whole row
  // rather than being cut.
  const long = oneLine && String(typeof children === 'string' ? children : (children?.props?.children ?? '')).length > 34
  return (
    <div style={{ background: 'var(--vfo-input)', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: isPhone ? '9px 12px' : '10px 14px', minWidth: 0, gridColumn: wide || long ? '1 / -1' : undefined, ...style }}>
      <div style={subLabel}>{label}</div>
      <div title={oneLine && typeof children === 'string' ? children : undefined}
        style={{ fontSize: oneLine && isPhone ? '13.5px' : '14.5px', color: empty ? 'var(--vfo-faint)' : 'var(--vfo-ink)', fontWeight: 600, marginTop: '4px', lineHeight: 1.4, ...(oneLine ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : { wordBreak: 'break-word' }) }}>{empty ? '—' : children}</div>
    </div>
  )
}

// A coloured dot + its words (status, engagement, Paused).
export function DotText({ color, children, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', ...style }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
      {children}
    </span>
  )
}

// Circle of initials (no photo) for a person tile.
export function Initials({ name, size = 34 }) {
  const text = (name || '?').split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: Math.round(size * 0.34), flexShrink: 0 }}>{text}</span>
  )
}

// A person's name for a profile header: First Last, with the preferred name in
// quotes on the line below, a little smaller (2026-11-26). No preferred name (or
// one that is just the first name) is First Last alone; no first/last falls back.
export function PersonName({ first, last, preferred, fallback = '' }) {
  const f = (first || '').trim()
  const l = (last || '').trim()
  const p = (preferred || '').trim()
  const full = [f, l].filter(Boolean).join(' ') || fallback
  if (!p || p.toLowerCase() === f.toLowerCase()) return full
  return <>{full}<span style={{ display: 'block', fontSize: '0.74em', fontWeight: 700, letterSpacing: '-0.01em', marginTop: '2px' }}>"{p}"</span></>
}

// The top of a profile: the gradient strip, a soft wash behind the avatar and
// name, and a strip of key facts along the bottom. `facts` = [{ label, value }]
// (a null value is left out); `alerts` = dot lines that must be seen (Paused,
// Suspended); `action` sits top right.
export function ProfileHero({ eyebrow, name, avatar, meta, facts = [], alerts, action }) {
  const isPhone = useIsPhone()
  const shown = facts.filter(f => f && f.value != null && f.value !== '' && f.value !== false)
  return (
    <div style={{ ...profileCardStyle, marginBottom: isPhone ? '14px' : '20px' }}>
      <div style={{ height: '4px', background: PROFILE_GRADIENT }} />
      <div style={{ background: 'linear-gradient(135deg, var(--vfo-accent-tint) 0%, transparent 70%)', padding: isPhone ? '16px' : '22px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '14px' : '18px', flexWrap: isPhone ? 'nowrap' : 'wrap' }}>
          {avatar && <div style={{ borderRadius: '50%', padding: '3px', background: 'var(--vfo-card)', boxShadow: '0 6px 18px rgba(18,94,204,0.22)', flexShrink: 0, display: 'flex' }}>{avatar}</div>}
          <div style={{ minWidth: isPhone ? 0 : '200px', flex: 1 }}>
            {eyebrow && <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', color: '#0095ff', textTransform: 'uppercase', marginBottom: '4px' }}>{eyebrow}</div>}
            <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '-0.03em', fontSize: isPhone ? '22px' : '26px', color: 'var(--vfo-heading)', lineHeight: 1.15, wordBreak: 'break-word' }}>{name}</div>
            {meta && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>{meta}</div>}
            {alerts && <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--vfo-ink)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>{alerts}</div>}
          </div>
          {action && !isPhone && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>{action}</div>}
        </div>
        {action && isPhone && <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>{action}</div>}
      </div>
      {shown.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? `repeat(${Math.min(2, shown.length)}, minmax(0, 1fr))` : `repeat(${shown.length}, minmax(0, 1fr))`, borderTop: '1px solid var(--vfo-border-soft)' }}>
          {shown.map((f, i) => (
            <div key={f.label} style={{
              padding: isPhone ? '11px 16px' : '13px 24px', minWidth: 0,
              borderLeft: (isPhone ? i % 2 : i) ? '1px solid var(--vfo-border-soft)' : 'none',
              borderTop: isPhone && i >= 2 ? '1px solid var(--vfo-border-soft)' : 'none',
              // Phone: an odd last fact takes the whole row, not half of it beside a gap.
              ...(isPhone && shown.length > 2 && shown.length % 2 === 1 && i === shown.length - 1 ? { gridColumn: '1 / -1' } : {}),
            }}>
              <div style={subLabel}>{f.label}</div>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--vfo-ink)', marginTop: '4px', overflowWrap: 'anywhere', lineHeight: 1.35 }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---- Edit forms (Edit Profile, Settings): the Events form look ----

export const formLabel = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--vfo-muted)', marginBottom: '6px', letterSpacing: '0.3px' }
export const formInput = { width: '100%', padding: '10px 13px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '14px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', boxSizing: 'border-box' }
export const formReadOnly = { ...formInput, background: 'var(--vfo-tint)', color: 'var(--vfo-muted)', cursor: 'not-allowed' }

// Inputs side by side, wrapping on narrow screens.
export function FormGrid({ children, min = 220, style }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}px, 100%), 1fr))`, gap: '14px', ...style }}>{children}</div>
}

// One choice from a few (Revenue Share / Money Mapping, On / Off): the chosen one
// is the primary button, the rest secondary. `blocked(value)` greys one out.
// On a phone the choices share one row, each as wide as its words, so three never wrap 2 / 1.
export function ChoiceButtons({ options, value, onChange, disabled = false, blocked }) {
  const isPhone = useIsPhone()
  return (
    <div style={isPhone ? { display: 'flex', gap: '6px' } : { display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(([v, label, title]) => {
        const active = value === v
        const off = disabled || (blocked && blocked(v))
        return (
          <button key={String(v)} type="button" disabled={off} title={title}
            onClick={() => { if (!active) onChange(v) }}
            style={btnState({ ...(active ? btnPrimary : btnSecondary), ...(isPhone ? { flex: '1 1 auto', padding: '8px 8px', fontSize: '12.5px', whiteSpace: 'nowrap' } : { padding: '8px 18px', fontSize: '13px' }) }, off && !active)}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

// The house on/off switch.
export function Switch({ on, onClick, disabled = false, color = '#125ecc', label }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled} onClick={onClick}
      style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', padding: 0, background: on ? color : 'var(--vfo-border-strong)', cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative', flexShrink: 0, opacity: disabled ? 0.55 : 1, transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: '2px', left: on ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
    </button>
  )
}

// A setting in a tile: title + hint on the left, its control on the right.
export function SettingRow({ title, hint, children, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '12px 14px', border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', background: 'var(--vfo-input)', ...style }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{title}</div>
        {hint && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.45 }}>{hint}</div>}
      </div>
      {children}
    </div>
  )
}

// The sticky Save bar under an edit form.
export function SaveBar({ dirty, saving, onSave, disabled = false, status, statusType = 'success', label = 'Save Changes', savingLabel = 'Saving…', children }) {
  return (
    <div style={{ position: 'sticky', bottom: 0, zIndex: 5, background: 'var(--vfo-page)', borderTop: '1px solid var(--vfo-border)', padding: '14px 0', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <button type="button" onClick={onSave} disabled={saving || disabled} style={{ ...btnState(btnPrimary, saving || disabled), padding: '10px 26px', fontSize: '14px', cursor: saving ? 'wait' : (disabled ? 'not-allowed' : 'pointer') }}>{saving ? savingLabel : label}</button>
      {children}
      {dirty && <span style={{ fontSize: '13px', color: 'var(--vfo-gold-text)', fontWeight: 600 }}>You have unsaved changes</span>}
      {status && <span style={{ color: statusType === 'success' ? 'var(--vfo-success-text)' : '#d93025', fontSize: '13px', fontWeight: 500 }}>{status}</span>}
    </div>
  )
}

// A page's title: a small blue eyebrow over the heading (Client Overview's).
export function PageHeading({ eyebrow, title, action, style }) {
  return (
    <div style={{ marginBottom: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap', ...style }}>
      <div>
        {eyebrow && <p style={{ fontSize: '12px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>{eyebrow}</p>}
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--vfo-heading)', margin: '4px 0 0', fontFamily: 'Inter, sans-serif', letterSpacing: '-0.02em' }}>{title}</h2>
      </div>
      {action}
    </div>
  )
}

// ---- Settings pages (every portal) ----

export const SETTINGS_WIDTH = '720px'

// The top of a Settings page: who is signed in.
// Settings' Back (2026-11-26, Jake): back to the page Settings was opened from.
// A page on another route (the client page, the planner's member view) leaves its
// address here before it sends you to Settings; opening Settings inside a portal
// clears it, and the portal puts back the tab it was on.
const SETTINGS_RETURN_KEY = 'settingsReturnTo'
// The page's router state rides along (the planner member view's "Back to Client"
// reads where it came from out of it).
export function rememberSettingsReturn() {
  sessionStorage.setItem(SETTINGS_RETURN_KEY, JSON.stringify({ to: window.location.pathname + window.location.search, state: window.history.state?.usr ?? null }))
}
export function forgetSettingsReturn() { sessionStorage.removeItem(SETTINGS_RETURN_KEY) }
// The remembered page { to, state }, used once (null when Settings was opened inside the portal).
export function takeSettingsReturn() {
  const raw = sessionStorage.getItem(SETTINGS_RETURN_KEY)
  sessionStorage.removeItem(SETTINGS_RETURN_KEY)
  try { const back = JSON.parse(raw); return back?.to ? back : null } catch { return null }
}

// A portal's Settings switch: `open()` as Settings opens inside the portal (it
// forgets any other page's address and keeps the scroll), `back(restore)` on Back:
// to the page that sent you here, else `restore()` puts the portal's view back and
// the scroll returns to where it was.
export function useSettingsReturn(navigate) {
  const scrollY = useRef(0)
  return {
    open() { forgetSettingsReturn(); scrollY.current = window.scrollY; window.scrollTo(0, 0) },
    back(restore) {
      const page = takeSettingsReturn()
      if (page) { navigate(page.to, { state: page.state }); return }
      restore()
      const y = scrollY.current
      setTimeout(() => window.scrollTo(0, y), 0)
    },
  }
}

export function BackLink({ onClick, children = 'Back', style }) {
  return (
    <button type="button" onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', padding: '4px 0', marginBottom: '12px', color: 'var(--vfo-accent-text)', fontSize: '13.5px', fontWeight: 600, fontFamily: 'Inter, sans-serif', cursor: 'pointer', ...style }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
      {children}
    </button>
  )
}

export function SettingsHeader({ name, email, eyebrow = 'Settings', onBack }) {
  const isPhone = useIsPhone()
  return (
    <>
      {onBack && <BackLink onClick={onBack} />}
      <ProfileHero eyebrow={eyebrow} name={name || email || 'Your account'}
        avatar={<Initials name={name || email} size={isPhone ? 52 : 64} />}
        facts={[{ label: 'Signed in as', value: email }]} />
    </>
  )
}
