import { useState } from 'react'
import { getTheme, setTheme } from '../../lib/theme'
import { useIsPhone } from '../../lib/useMediaQuery'
import { btnPrimary, btnSecondary } from './buttonStyles'
import { ProfileCard } from './ProfileKit'

// Light/dark mode picker shown in every portal's Settings area. The choice is
// per-device (localStorage) — no backend involved.
const SUN = <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>
const MOON = <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />

function Option({ active, dark, title, sub, onClick }) {
  const isPhone = useIsPhone()
  // Phone: a small two-button switch, the way ChoiceButtons reads there.
  if (isPhone) return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{ ...(active ? btnPrimary : btnSecondary), flex: '1 1 0', padding: '8px 10px', fontSize: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dark ? MOON : SUN}</svg>
      {title}
    </button>
  )
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{ flex: '1 1 200px', padding: '14px 16px', borderRadius: '12px', border: active ? '2px solid var(--vfo-sky)' : '1px solid var(--vfo-border-soft)', margin: active ? 0 : '1px', background: 'var(--vfo-input)', boxShadow: active ? '0 8px 20px rgba(0,149,255,0.16)' : 'none', color: 'var(--vfo-ink)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <span style={{ width: '40px', height: '40px', borderRadius: '11px', flexShrink: 0, border: '1px solid var(--vfo-border-strong)', background: dark ? 'linear-gradient(135deg, #001b4f 0%, #002973 100%)' : 'linear-gradient(135deg, #ffffff 0%, #f4f7fd 100%)', color: dark ? '#8cc8ff' : '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{dark ? MOON : SUN}</svg>
      </span>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>{title}</span>
        <span style={{ display: 'block', fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{sub}</span>
      </span>
      {active && (
        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--vfo-sky)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
      )}
    </button>
  )
}

export default function AppearanceCard() {
  const [theme, setThemeState] = useState(getTheme())

  function pick(next) {
    setTheme(next)
    setThemeState(next)
  }

  return (
    <ProfileCard icon="palette" title="Appearance" sub="Saved on this device — the portal will remember your choice next time you sign in.">
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <Option active={theme === 'light'} title="Light" sub="The classic look" onClick={() => pick('light')} />
        <Option active={theme === 'dark'} dark title="Dark" sub="VFO navy" onClick={() => pick('dark')} />
      </div>
    </ProfileCard>
  )
}
