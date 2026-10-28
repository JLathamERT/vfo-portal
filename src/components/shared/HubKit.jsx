import { useState } from 'react'
import { useIsPhone } from '../../lib/useMediaQuery'

// Shared "hub" UI — the completed banner, the uniform box grid, and the
// back-to-menu bar used by both the Growth Plan hub and the CIQ chooser. Keeps
// the two visually identical with one place to maintain. Portal-themed via
// var(--vfo-*) so it works in light and dark.
const MUTED = 'var(--vfo-muted)'

// Phone (2026-10-28): the boxes size to their text (a fixed 184px left each one
// mostly empty in a single column) and sit closer together.
export function HubGrid({ children }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: isPhone ? '10px' : '16px' }}>
      {children}
    </div>
  )
}

// One box. `disabled` renders a locked (non-clickable) card at reduced opacity.
export function HubCard({ title, sub, accent, status, onClick, disabled }) {
  const [hover, setHover] = useState(false)
  const isPhone = useIsPhone()
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => { if (!disabled) setHover(true) }}
      onMouseLeave={() => setHover(false)}
      style={{
        background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', overflow: 'hidden',
        textAlign: 'left', cursor: disabled ? 'default' : 'pointer', padding: 0, fontFamily: 'Inter, sans-serif',
        display: 'flex', flexDirection: 'column', width: '100%', height: isPhone ? 'auto' : '184px', opacity: disabled ? 0.55 : 1,
        transform: hover ? 'translateY(-3px)' : 'none',
        boxShadow: hover ? '0 14px 32px rgba(20,45,95,0.16)' : 'var(--vfo-shadow-card)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}>
      <div style={{ height: '4px', background: disabled ? 'var(--vfo-border-strong)' : accent, flexShrink: 0 }} />
      <div style={{ padding: isPhone ? '12px 14px' : '18px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--vfo-heading)', letterSpacing: '-0.01em', lineHeight: 1.25 }}>{title}</div>
          {!disabled && <span style={{ fontSize: '18px', color: accent, opacity: hover ? 1 : 0.4, transform: hover ? 'translateX(2px)' : 'none', transition: 'opacity 0.15s ease, transform 0.15s ease', flexShrink: 0 }}>→</span>}
        </div>
        <div style={{ fontSize: '12.5px', color: MUTED, marginTop: '6px', lineHeight: 1.4 }}>{sub}</div>
        <div style={isPhone ? { paddingTop: status ? '8px' : 0 } : { marginTop: 'auto', paddingTop: '12px', minHeight: '25px' }}>
          {status && <span style={{ display: 'inline-block', fontSize: '11px', fontWeight: 600, color: 'var(--vfo-ink-2)', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-soft)', borderRadius: '999px', padding: '3px 10px' }}>{status}</span>}
        </div>
      </div>
    </button>
  )
}

// Completed / not-yet banner. `complete` toggles the green vs neutral treatment.
export function HubBanner({ complete, title, meta }) {
  const isPhone = useIsPhone()
  const accent = complete
    ? { bg: 'linear-gradient(90deg, rgba(27,146,84,0.12) 0%, rgba(27,146,84,0.03) 100%)', border: 'rgba(27,146,84,0.30)', dotBg: '#1b9254', dotColor: '#fff', dotShadow: '0 4px 12px rgba(27,146,84,0.35)', glyph: '✓', dotBorder: 'none' }
    : { bg: 'var(--vfo-tint)', border: 'var(--vfo-border-soft)', dotBg: 'var(--vfo-card)', dotColor: 'var(--vfo-faint)', dotShadow: 'none', glyph: '•', dotBorder: '1px solid var(--vfo-border-strong)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: isPhone ? '12px 14px' : '15px 20px', borderRadius: '14px', background: accent.bg, border: `1px solid ${accent.border}`, marginBottom: isPhone ? '14px' : '22px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: accent.dotBg, border: accent.dotBorder, color: accent.dotColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0, boxShadow: accent.dotShadow }}>{accent.glyph}</div>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--vfo-heading)', letterSpacing: '-0.01em' }}>{title}</div>
        {meta && <div style={{ fontSize: '12.5px', color: MUTED, marginTop: '2px' }}>{meta}</div>}
      </div>
    </div>
  )
}

// "← {label}" pill + optional "/ {breadcrumb}" — the always-visible way back to
// the hub from a sub-view.
export function HubMenuBar({ label, breadcrumb, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
      <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 16px', borderRadius: '999px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', color: 'var(--vfo-ink)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter, sans-serif', boxShadow: 'var(--vfo-shadow-card)' }}>
        <span style={{ fontSize: '14px' }}>←</span> {label}
      </button>
      {breadcrumb && <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>/ {breadcrumb}</span>}
    </div>
  )
}
