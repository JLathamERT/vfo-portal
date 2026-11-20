import { useEffect, useState } from 'react'
import { useIsPhone } from '../../lib/useMediaQuery'
import { pad2, promoDayLabel, promoLastDayLabel, splitCountdown, useGcPromo } from '../../lib/gcPromo'

// The Black Friday look (2026-11-20): a near-black band with the portal's blue
// glow and one warm gold accent for the deal. Used by the member portal's strip
// under the header, the Growth Credits buy panel, and the public /black-friday
// page. Nothing renders once the sale has ended or when there is no sale.

export const BF = {
  ink: '#0a0f1f',
  ink2: '#121a33',
  gold: '#ffc145',
  goldDeep: '#ff9f1c',
  sky: '#0a85e8',
  blue: '#125ecc',
  navy: '#002973',
}

// The portal's theme (lib/theme.js puts data-theme on <html>). In dark mode the
// band flips to a LIGHT version so it still stands out (Jake, 2026-11-20).
export function useIsDarkTheme() {
  const read = () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark'
  const [dark, setDark] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// Colours for the band: 'dark' = the near-black band (light portal, public page);
// 'light' = the bright band shown on a dark portal.
export function bfTone(tone) {
  if (tone === 'light') return {
    band: 'radial-gradient(120% 180% at 85% 0%, rgba(10,133,232,0.18) 0%, rgba(10,133,232,0) 55%), radial-gradient(90% 160% at 0% 100%, rgba(255,193,69,0.22) 0%, rgba(255,193,69,0) 60%), linear-gradient(120deg, #ffffff 0%, #f4f8ff 55%, #fff6e3 100%)',
    text: BF.ink, sub: 'rgba(10,15,31,0.62)', label: 'rgba(10,15,31,0.6)', gold: '#d97706',
    cellBg: 'rgba(10,15,31,0.05)', cellBorder: 'rgba(10,15,31,0.12)', cellText: BF.ink, cellLabel: 'rgba(10,15,31,0.55)',
    edge: 'rgba(217,119,6,0.45)', sheen: 'rgba(255,255,255,0.6)',
  }
  return {
    band: `radial-gradient(120% 180% at 85% 0%, rgba(10,133,232,0.45) 0%, rgba(10,133,232,0) 55%), radial-gradient(90% 160% at 0% 100%, rgba(18,94,204,0.35) 0%, rgba(18,94,204,0) 60%), linear-gradient(120deg, ${BF.ink} 0%, ${BF.ink2} 55%, #0d2350 100%)`,
    text: '#fff', sub: 'rgba(255,255,255,0.65)', label: 'rgba(255,255,255,0.7)', gold: BF.gold,
    cellBg: 'rgba(255,255,255,0.07)', cellBorder: 'rgba(255,255,255,0.14)', cellText: '#fff', cellLabel: 'rgba(255,255,255,0.6)',
    edge: 'rgba(255,193,69,0.35)', sheen: 'rgba(255,255,255,0.07)',
  }
}

export const BF_KEYFRAMES = `
@keyframes vfoBfSheen { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes vfoBfPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255,193,69,0.55) } 50% { box-shadow: 0 0 0 6px rgba(255,193,69,0) } }
@media (prefers-reduced-motion: reduce) { .vfo-bf-anim { animation: none !important } }
`

export function BfTag({ children = 'Black Friday', small }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: small ? '3px 9px' : '4px 11px', borderRadius: '6px', background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, color: BF.ink, fontSize: small ? '10px' : '11px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// Segmented countdown: 06 DAYS 14 HRS 22 MIN 10 SEC.
export function BfCountdown({ ms, size = 'md', tone = 'dark' }) {
  const c = bfTone(tone)
  const { days, hours, minutes, seconds } = splitCountdown(ms)
  const big = size === 'lg'
  const sm = size === 'sm'
  const cell = (value, label) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: big ? '74px' : sm ? '36px' : '46px', padding: big ? '12px 8px 9px' : sm ? '4px 4px 3px' : '6px 6px 5px', borderRadius: big ? '14px' : '8px', background: c.cellBg, border: `1px solid ${c.cellBorder}`, backdropFilter: 'blur(4px)' }}>
      <span style={{ fontSize: big ? '38px' : sm ? '15px' : '19px', fontWeight: 800, color: c.cellText, lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{pad2(value)}</span>
      <span style={{ fontSize: big ? '10.5px' : '8.5px', fontWeight: 700, color: c.cellLabel, letterSpacing: '1.2px', marginTop: big ? '6px' : '3px' }}>{label}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: big ? '10px' : sm ? '4px' : '6px' }} aria-label={`${days} days ${hours} hours ${minutes} minutes ${seconds} seconds`}>
      {cell(days, 'DAYS')}{cell(hours, 'HRS')}{cell(minutes, 'MIN')}{cell(seconds, 'SEC')}
    </div>
  )
}

// The strip under the member portal's header, on every tab. Click = go to the
// Growth Credits marketplace. Dark band on a light portal, light band on a dark one.
export function BlackFridayStrip({ onShop }) {
  const isPhone = useIsPhone()
  const dark = useIsDarkTheme()
  const c = bfTone(dark ? 'light' : 'dark')
  const { promo, phase, remainingMs } = useGcPromo()
  if (!promo || (phase !== 'upcoming' && phase !== 'live')) return null
  const live = phase === 'live'
  const sub = live
    ? `Ends ${promoLastDayLabel(promo.ends_at)} at midnight PT`
    : `${promoDayLabel(promo.starts_at)} to ${promoLastDayLabel(promo.ends_at)}`
  return (
    <>
      <style>{BF_KEYFRAMES}</style>
      <div role="button" tabIndex={0} onClick={onShop}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShop?.() } }}
        style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', background: c.band, borderBottom: `1px solid ${c.edge}` }}>
        <div className="vfo-bf-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `linear-gradient(100deg, transparent 0%, transparent 40%, ${c.sheen} 50%, transparent 60%, transparent 100%)`, backgroundSize: '200% 100%', animation: 'vfoBfSheen 6s linear infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '1180px', margin: '0 auto', padding: isPhone ? '10px var(--vfo-gutter)' : '10px 24px', display: 'flex', alignItems: 'center', gap: isPhone ? '10px' : '18px', flexWrap: isPhone ? 'wrap' : 'nowrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: isPhone ? '1 1 100%' : '1 1 auto' }}>
            <BfTag small={isPhone}>{live ? 'Live now' : 'Black Friday'}</BfTag>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: c.text, fontWeight: 800, fontSize: isPhone ? '14px' : '15.5px', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                Buy 1, Get 1 <span style={{ color: c.gold }}>Free</span> on Growth Credits
              </div>
              <div style={{ color: c.sub, fontSize: '12px', marginTop: '2px' }}>{sub}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '10px' : '16px', flexShrink: 0, ...(isPhone ? { width: '100%', justifyContent: 'space-between' } : {}) }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {!isPhone && <span style={{ color: c.label, fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{live ? 'Ends in' : 'Starts in'}</span>}
              <BfCountdown ms={remainingMs} size={isPhone ? 'sm' : 'md'} tone={dark ? 'light' : 'dark'} />
            </div>
            <span className="vfo-bf-anim" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: isPhone ? '8px 12px' : '9px 16px', borderRadius: '999px', background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, color: BF.ink, fontWeight: 800, fontSize: '13px', whiteSpace: 'nowrap', animation: live ? 'vfoBfPulse 2.2s ease-in-out infinite' : 'none' }}>
              {live ? 'Shop the deal' : 'See the deal'}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

// The deal banner above the packages (member portal): what the sale gives, and
// which deals this member has already used.
export function BlackFridayBuyBanner({ claimed = [] }) {
  const isPhone = useIsPhone()
  const dark = useIsDarkTheme()
  const c = bfTone(dark ? 'light' : 'dark')
  const { promo, phase, remainingMs, plannedBonusFor } = useGcPromo()
  if (!promo || (phase !== 'upcoming' && phase !== 'live')) return null
  const live = phase === 'live'
  const deals = Object.keys(promo.bonus || {}).map(Number).filter(n => plannedBonusFor(n) > 0).sort((a, b) => a - b)
  const used = [...claimed].sort((a, b) => a - b)
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', background: c.band, padding: isPhone ? '16px' : '20px 24px', marginBottom: '18px', border: `1px solid ${c.edge}` }}>
      <div style={{ display: 'flex', alignItems: isPhone ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '14px', flexDirection: isPhone ? 'column' : 'row' }}>
        <div>
          <BfTag small>{live ? 'Black Friday - live now' : 'Black Friday'}</BfTag>
          <div style={{ color: c.text, fontWeight: 800, fontSize: isPhone ? '19px' : '22px', marginTop: '8px', letterSpacing: '-0.02em' }}>
            Buy 1, Get 1 <span style={{ color: c.gold }}>Free</span>
          </div>
          <div style={{ color: c.sub, fontSize: '12.5px', marginTop: '4px', lineHeight: 1.5 }}>
            {deals.map(n => `${n} + ${n} free`).join(' and ')}, each deal once per member.
            {!live && ` Starts ${promoDayLabel(promo.starts_at)}, 12:00am PT.`}
            {live && ` Ends ${promoLastDayLabel(promo.ends_at)} at midnight PT.`}
            {used.length > 0 && ` You've used the ${used.map(n => `${n}-credit`).join(' and ')} deal.`}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: c.label, fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>{live ? 'Ends in' : 'Starts in'}</div>
          <BfCountdown ms={remainingMs} size="md" tone={dark ? 'light' : 'dark'} />
        </div>
      </div>
    </div>
  )
}