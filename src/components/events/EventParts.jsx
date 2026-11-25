import logoDark from '../../assets/vfo-collective-logo.png'
import logoLight from '../../assets/vfo-collective-logo-light.png'
import PhoneInput from '../shared/PhoneInput'
import { btnDanger, btnOutline, BTN_SMALL } from '../shared/buttonStyles'
import { useIsPhone } from '../../lib/useMediaQuery'
import { EVENT_HERO_BG } from '../../lib/eventBg'
import { blankPerson, eventDatesText, eventMoney, ticketWindowText } from '../../lib/events'

// The Elite VFO Collective look (2026-11-25), shared by the member portal's Events
// tab, its admin preview and the public /events page: the event's own logo, a deep
// navy band with the logo's orange and blue, ticket cards in the Growth Credits
// package style.

export const EV = { orange: '#ff8a5a', orangeDeep: '#f26a2e', sky: '#0a94f5', blue: '#125ecc', navy: '#002973' }

export const EVENT_KEYFRAMES = `
@keyframes vfoEvSheen { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
@keyframes vfoEvIn { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes vfoEvSpin { to { transform: rotate(360deg) } }
@media (prefers-reduced-motion: reduce) { .vfo-ev-anim { animation: none !important } }
`

export const evInput = { width: '100%', padding: '11px 13px', borderRadius: '10px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '14px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', boxSizing: 'border-box' }
export const evLabel = { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--vfo-muted)', marginBottom: '6px', letterSpacing: '0.3px' }
const req = { color: '#d93025' }

export function EventLogo({ light = false, width = 300 }) {
  return <img src={light ? logoLight : logoDark} alt="Elite VFO Collective" width={width} style={{ width: `${width}px`, maxWidth: '100%', height: 'auto', display: 'block' }} />
}

function Fact({ icon, children }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '9px' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={EV.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{icon}</svg>
      {children}
    </span>
  )
}

// The band's content: logo, dates, place, and the "to be confirmed" line.
export function EventFacts({ event, big = false }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><EventLogo light width={isPhone ? 250 : big ? 430 : 340} /></div>
      <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: isPhone ? '10px 18px' : '12px 30px', marginTop: isPhone ? '22px' : '30px', fontSize: isPhone ? '15px' : big ? '19px' : '17px', fontWeight: 700, color: '#fff' }}>
        <Fact icon={<><rect x="3" y="5" width="18" height="16" rx="2.5" /><path d="M3 10h18M8 3v4M16 3v4" /></>}>{eventDatesText(event)}</Fact>
        {event.location && <Fact icon={<><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>}>{event.location}</Fact>}
      </div>
      {event.date_note && <div style={{ marginTop: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.72)' }}>{event.date_note}</div>}
      {event.description && <p style={{ fontSize: isPhone ? '14px' : '16px', color: 'rgba(255,255,255,0.8)', maxWidth: '640px', margin: '18px auto 0', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{event.description}</p>}
    </div>
  )
}

export function EventBand({ children, style }) {
  return (
    <div style={{ position: 'relative', overflow: 'hidden', background: EVENT_HERO_BG, color: '#fff', ...style }}>
      <div className="vfo-ev-anim" aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, transparent 0%, transparent 42%, rgba(255,255,255,0.07) 50%, transparent 58%, transparent 100%)', backgroundSize: '200% 100%', animation: 'vfoEvSheen 7s linear infinite', pointerEvents: 'none' }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )
}

// Early Bird / Regular / Late Registration: the one on sale stands out, the others
// are greyed until they open (or once they have ended).
export function TicketCards({ event }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : `repeat(${event.tickets.length}, minmax(0, 1fr))`, gap: isPhone ? '10px' : '14px' }}>
      {event.tickets.map(t => {
        const on = t.state === 'open'
        return (
          <div key={t.key} aria-disabled={!on}
            style={{ display: 'flex', flexDirection: 'column', borderRadius: '16px', padding: isPhone ? '16px' : '20px 18px', background: on ? 'linear-gradient(180deg, rgba(255,138,90,0.13) 0%, var(--vfo-card) 60%)' : 'var(--vfo-tint)', border: on ? `2px solid ${EV.orange}` : '1px solid var(--vfo-border-soft)', boxShadow: on ? '0 12px 28px rgba(242,106,46,0.18)' : 'none', opacity: on ? 1 : 0.62 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px', minHeight: '22px' }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--vfo-ink)' }}>{t.name}</span>
              {on
                ? <span style={{ padding: '3px 8px', borderRadius: '6px', background: `linear-gradient(135deg, ${EV.orange} 0%, ${EV.orangeDeep} 100%)`, color: '#fff', fontSize: '9.5px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>On sale now</span>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--vfo-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>}
            </div>
            <div style={{ fontSize: isPhone ? '34px' : '38px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: on ? 'var(--vfo-ink)' : 'var(--vfo-muted)' }}>{eventMoney(t.price)}</div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '4px' }}>per person</div>
            <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)', fontSize: '12.5px', fontWeight: 600, color: on ? EV.orangeDeep : 'var(--vfo-muted)' }}>{ticketWindowText(t)}</div>
          </div>
        )
      })}
    </div>
  )
}

// First name, last name, email, phone. All required.
export function PersonFields({ value, onChange, idPrefix, autoComplete = false, disabled = false }) {
  const isPhone = useIsPhone()
  const set = (k, v) => onChange({ ...value, [k]: v })
  const auto = (v) => autoComplete ? v : 'off'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: '12px 14px' }}>
      <div><label style={evLabel} htmlFor={`${idPrefix}-first`}>First name <span style={req}>*</span></label><input id={`${idPrefix}-first`} disabled={disabled} autoComplete={auto('given-name')} value={value.first_name} onChange={e => set('first_name', e.target.value)} style={evInput} /></div>
      <div><label style={evLabel} htmlFor={`${idPrefix}-last`}>Last name <span style={req}>*</span></label><input id={`${idPrefix}-last`} disabled={disabled} autoComplete={auto('family-name')} value={value.last_name} onChange={e => set('last_name', e.target.value)} style={evInput} /></div>
      <div><label style={evLabel} htmlFor={`${idPrefix}-email`}>Email <span style={req}>*</span></label><input id={`${idPrefix}-email`} type="email" disabled={disabled} autoComplete={auto('email')} value={value.email} onChange={e => set('email', e.target.value)} style={evInput} /></div>
      <div><label style={evLabel} htmlFor={`${idPrefix}-phone`}>Phone <span style={req}>*</span></label><PhoneInput id={`${idPrefix}-phone`} disabled={disabled} autoComplete={auto('tel')} value={value.phone} onChange={v => set('phone', v)} style={evInput} /></div>
    </div>
  )
}

// The guests on an order or a registration: one box each, Add and Remove.
export function GuestList({ guests, onChange, max, addLabel = 'Add a guest', idPrefix }) {
  const isPhone = useIsPhone()
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {guests.map((g, i) => (
        <div key={i} style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: isPhone ? '14px' : '16px 18px', background: 'var(--vfo-tint)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--vfo-ink)' }}>Guest {i + 1}</span>
            <button type="button" onClick={() => onChange(guests.filter((_, k) => k !== i))} style={{ ...btnDanger, ...BTN_SMALL }}>Remove</button>
          </div>
          <PersonFields value={g} onChange={v => onChange(guests.map((x, k) => k === i ? v : x))} idPrefix={`${idPrefix}-${i}`} />
        </div>
      ))}
      {guests.length < max && (
        <div><button type="button" onClick={() => onChange([...guests, blankPerson()])} style={btnOutline}>{addLabel}</button></div>
      )}
    </div>
  )
}

export function CheckLine({ checked, onChange, disabled = false, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', fontWeight: 600, color: 'var(--vfo-ink)', cursor: disabled ? 'default' : 'pointer', lineHeight: 1.4 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: '17px', height: '17px', marginTop: '1px', flexShrink: 0, accentColor: '#125ecc', cursor: disabled ? 'default' : 'pointer' }} />
      <span>{children}</span>
    </label>
  )
}

export function ErrorLine({ children }) {
  return children ? <div role="alert" style={{ background: 'rgba(217,48,37,0.10)', border: '1px solid rgba(217,48,37,0.32)', color: '#d93025', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{children}</div> : null
}

// The order's sum, above its Continue button.
export function OrderTotal({ ticket, quantity }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--vfo-border-soft)' }}>
      <span style={{ fontSize: '13.5px', color: 'var(--vfo-muted)' }}>{quantity} x {ticket.name} at {eventMoney(ticket.price)}</span>
      <span style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--vfo-ink)' }}>{eventMoney(ticket.price * quantity)}</span>
    </div>
  )
}
