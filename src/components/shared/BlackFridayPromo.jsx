import { useEffect, useState } from 'react'
import { useIsPhone } from '../../lib/useMediaQuery'
import { pad2, promoStartsLine, splitCountdown, useGcPromo } from '../../lib/gcPromo'

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
@keyframes vfoBfShine { 0%, 55% { background-position: 150% 0 } 100% { background-position: -50% 0 } }
@media (prefers-reduced-motion: reduce) { .vfo-bf-anim { animation: none !important } }
`

// The big EXTENDED lettering for Cyber Monday (Anton, 2026-11-24): drawn here in
// the sale's own gold, not an image, so it fits every size and both themes.
export function BfExtended({ size = 24, tone = 'dark' }) {
  const [a, b, shine] = tone === 'light' ? ['#b45309', '#ea8a0c', '#ffd27a'] : [BF.gold, BF.goldDeep, '#fff6df']
  return (
    <span className="vfo-bf-anim" style={{ display: 'inline-block', fontSize: `${size}px`, fontWeight: 900, fontStyle: 'italic', letterSpacing: '0.04em', lineHeight: 1, textTransform: 'uppercase', whiteSpace: 'nowrap', paddingRight: '0.1em', backgroundImage: `linear-gradient(105deg, ${a} 0%, ${b} 42%, ${shine} 50%, ${b} 58%, ${a} 100%)`, backgroundSize: '250% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', animation: 'vfoBfShine 4.5s ease-in-out infinite' }}>
      Extended
    </span>
  )
}

// The gold tag's words in each phase.
export const bfTagText = (live, extended) => extended ? 'Cyber Monday' : live ? 'Black Friday - live now' : 'Black Friday'

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
  const { promo, phase, remainingMs, live, extended, endsLine } = useGcPromo()
  if (!promo || (phase !== 'upcoming' && phase !== 'live')) return null
  const sub = live ? endsLine : promoStartsLine(promo.starts_at)
  return (
    <>
      <style>{BF_KEYFRAMES}</style>
      <div role="button" tabIndex={0} onClick={onShop}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onShop?.() } }}
        style={{ position: 'relative', overflow: 'hidden', cursor: 'pointer', background: c.band, borderBottom: `1px solid ${c.edge}` }}>
        <div className="vfo-bf-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: `linear-gradient(100deg, transparent 0%, transparent 40%, ${c.sheen} 50%, transparent 60%, transparent 100%)`, backgroundSize: '200% 100%', animation: 'vfoBfSheen 6s linear infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '1180px', margin: '0 auto', padding: isPhone ? '10px var(--vfo-gutter)' : '10px 24px', display: 'flex', alignItems: 'center', gap: isPhone ? '10px' : '18px', flexWrap: isPhone ? 'wrap' : 'nowrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: isPhone ? '1 1 100%' : '1 1 auto' }}>
            {extended ? (
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', flexShrink: 0 }}>
                <BfExtended size={isPhone ? 20 : 27} tone={dark ? 'light' : 'dark'} />
                <span style={{ color: c.label, fontSize: '9.5px', fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Through Cyber Monday</span>
              </span>
            ) : <BfTag small={isPhone}>{live ? 'Live now' : 'Black Friday'}</BfTag>}
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
            <span className="vfo-bf-anim" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: isPhone ? '9px 10px' : '9px 16px', borderRadius: '999px', background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, color: BF.ink, fontWeight: 800, fontSize: isPhone ? '11px' : '13px', whiteSpace: 'nowrap', animation: live ? 'vfoBfPulse 2.2s ease-in-out infinite' : 'none' }}>
              {extended ? 'Shop Cyber Monday Deal' : 'Shop Black Friday Deal'}
              {!isPhone && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

// - 3 + stepper for the deal's credit count (portal banner). Fixed colours: the
// 'light' band shows on a DARK portal, where the theme's ink is near-white.
export function QtyStepper({ value, min = 1, max, onChange, tone = 'light', size = 'md' }) {
  const dark = tone === 'dark'
  const big = size === 'lg'
  const btn = (disabled) => ({
    width: big ? '46px' : '38px', height: big ? '46px' : '38px', borderRadius: '50%', border: `1px solid ${dark ? 'rgba(255,255,255,0.28)' : 'rgba(10,15,31,0.25)'}`,
    background: dark ? 'rgba(255,255,255,0.08)' : '#ffffff', color: dark ? '#fff' : BF.ink, fontSize: big ? '22px' : '18px', fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', lineHeight: 1, padding: 0,
  })
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: big ? '16px' : '12px' }}>
      <button type="button" aria-label="Fewer credits" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} style={btn(value <= min)}>-</button>
      <span style={{ minWidth: big ? '56px' : '40px', textAlign: 'center', fontSize: big ? '40px' : '28px', fontWeight: 900, letterSpacing: '-0.03em', color: dark ? '#fff' : BF.ink, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <button type="button" aria-label="More credits" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} style={btn(value >= max)}>+</button>
    </div>
  )
}

const money = (n) => '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })

// The deal above the usual packages (member portal): what the sale gives, the
// countdown, and - while it runs - a picker for 1 to the member's free credits
// left (10 per member per sale, across purchases). onBuy(n) opens the pay page.
export function BlackFridayBuyBanner({ freeLeft = null, onBuy }) {
  const isPhone = useIsPhone()
  const dark = useIsDarkTheme()
  const tone = dark ? 'light' : 'dark'
  const c = bfTone(tone)
  const { promo, phase, live, extended, endsLine, remainingMs, deal } = useGcPromo()
  const max = deal ? Math.max(0, Math.min(deal.maxFree, freeLeft ?? deal.maxFree)) : 0
  const [qty, setQty] = useState(1)
  useEffect(() => { if (max > 0 && qty > max) setQty(max) }, [max])
  if (!promo || !deal || (phase !== 'upcoming' && phase !== 'live')) return null
  const pay = qty * deal.creditPrice
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '16px', background: c.band, padding: isPhone ? '16px' : '20px 24px', marginBottom: '18px', border: `1px solid ${c.edge}` }}>
      <style>{BF_KEYFRAMES}</style>
      <div style={{ display: 'flex', alignItems: isPhone ? 'flex-start' : 'center', justifyContent: 'space-between', gap: '14px', flexDirection: isPhone ? 'column' : 'row' }}>
        <div>
          <BfTag small>{bfTagText(live, extended)}</BfTag>
          {extended && <div style={{ marginTop: '10px' }}><BfExtended size={isPhone ? 34 : 42} tone={tone} /></div>}
          <div style={{ color: c.text, fontWeight: 800, fontSize: isPhone ? '19px' : '22px', marginTop: '8px', letterSpacing: '-0.02em' }}>
            Buy 1, Get 1 <span style={{ color: c.gold }}>Free</span>
          </div>
          <div style={{ color: c.sub, fontSize: '12.5px', marginTop: '4px', lineHeight: 1.5 }}>
            Buy up to {deal.maxFree} credits at {money(deal.creditPrice)} each and get the same number free.
            <div>{live ? endsLine : promoStartsLine(promo.starts_at)}</div>
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <div style={{ color: c.label, fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>{live ? 'Ends in' : 'Starts in'}</div>
          <BfCountdown ms={remainingMs} size="md" tone={tone} />
        </div>
      </div>

      {live && (
        <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: `1px solid ${dark ? 'rgba(10,15,31,0.1)' : 'rgba(255,255,255,0.12)'}` }}>
          {max === 0 ? (
            <div style={{ color: c.text, fontSize: '14px', fontWeight: 600 }}>You've had all {deal.maxFree} free credits in this sale. Thank you!</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '14px' : '20px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: c.label, fontSize: '10.5px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: '6px' }}>Credits to buy</div>
                  <QtyStepper value={qty} max={max} onChange={setQty} tone={tone} />
                </div>
                <div>
                  <div style={{ color: c.text, fontSize: isPhone ? '20px' : '24px', fontWeight: 900, letterSpacing: '-0.02em' }}>
                    {qty * 2} <span style={{ fontSize: '14px', fontWeight: 700, color: c.sub }}>Growth Credits</span>
                  </div>
                  <div style={{ color: c.sub, fontSize: '12.5px', marginTop: '2px' }}>
                    {qty} + <span style={{ color: c.gold, fontWeight: 700 }}>{qty} free</span> for {money(pay)}
                    {freeLeft !== null && freeLeft < deal.maxFree && ` · ${freeLeft} free left`}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => onBuy?.(qty)} className="vfo-bf-anim"
                style={{ padding: '11px 22px', borderRadius: '999px', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: 800, color: BF.ink, background: `linear-gradient(135deg, ${BF.gold} 0%, ${BF.goldDeep} 100%)`, animation: 'vfoBfPulse 2.2s ease-in-out infinite', whiteSpace: 'nowrap' }}>
                Get the deal
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}