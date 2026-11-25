import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { Skeleton } from '../shared/Skeleton'
import PhoneInput from '../shared/PhoneInput'
import { btnPrimary, btnState } from '../shared/buttonStyles'
import { useIsPhone } from '../../lib/useMediaQuery'
import { formatDate } from '../../lib/dates'
import { EVENT_ORDER_KEY, eventMoney2, guestsProblem, openTicketOf, readSession, ticketLastDay, writeSession } from '../../lib/events'
import { CheckLine, ErrorLine, EVENT_KEYFRAMES, EventBand, EventFacts, evInput, evLabel, GuestList, OrderTotal, TicketCards } from '../events/EventParts'

// The member portal's Events tab (2026-11-25), in the Growth Credits marketplace's
// style. A paying member buys tickets (bank or card on /event-pay); a complimentary
// member (Tier 3) registers free, with their corporate members and up to the event's
// free guests, and buys a ticket only for a guest past those. The server decides
// which of the two a member is and re-checks every number here.
//
// preview = 'paying' | 'complimentary': the admin Events page's Member preview. Same
// screen on made-up details; nothing can be saved or bought.

const PREVIEW_ME = { first_name: 'Alex', last_name: 'Member', email: 'alex.member@example.com', phone: '' }
const PREVIEW_CORPORATE = [{ member_number: 'p1', name: 'Sam Colleague' }, { member_number: 'p2', name: 'Jordan Partner' }]

export default function MemberEvents({ memberNumber, preview = null, previewEvent = null }) {
  const isPhone = useIsPhone()
  const [data, setData] = useState(() => preview
    ? { event: previewEvent, me: PREVIEW_ME, complimentary: preview === 'complimentary', corporate: preview === 'complimentary' ? PREVIEW_CORPORATE : [], registration: null, holds_ticket: false, orders: [] }
    : null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null) // { method } back from Stripe

  useLayoutEffect(() => {
    if (preview) return
    const snap = getLastSeen(`memberevents:${memberNumber}`)
    if (snap) setData(snap)
    load()
  }, [memberNumber])

  async function load() {
    try {
      const res = await callApi('events_member_load', { member_number: memberNumber })
      setData(res)
      setLastSeen(`memberevents:${memberNumber}`, res)
      setError('')
    } catch (e) { setError(e?.message || 'The event could not be loaded.') }
  }

  // Stripe returns the buyer to /member?event_paid=1&m=<method>. A card order is
  // booked by the webhook within seconds, so the list is read again for half a minute.
  useEffect(() => {
    if (preview) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('event_paid') !== '1') return
    const method = params.get('m')
    params.delete('event_paid'); params.delete('m')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''))
    writeSession(EVENT_ORDER_KEY, null)
    setNotice({ method })
    let live = true
    ;(async () => {
      for (let i = 0; i < 8 && live; i++) { await new Promise(r => setTimeout(r, 3000)); if (live) await load() }
    })()
    return () => { live = false }
  }, [])

  if (error && !data) return <ErrorLine>{error}</ErrorLine>
  if (!data) return <MemberEventsSkeleton inner />
  if (!data.event) return (
    <div style={{ ...section, textAlign: 'center' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--vfo-heading)' }}>No events right now</div>
      <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '6px' }}>The next event will appear here.</div>
    </div>
  )

  const { event, complimentary } = data
  return (
    <div>
      <style>{EVENT_KEYFRAMES}</style>
      {notice && <PaidNotice method={notice.method} onClose={() => setNotice(null)} isPhone={isPhone} />}
      <div style={{ borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--vfo-shadow-card)', marginBottom: '16px' }}>
        <EventBand><div style={{ padding: isPhone ? '30px 18px' : '44px 28px' }}><EventFacts event={event} /></div></EventBand>
      </div>
      <MyTickets data={data} isPhone={isPhone} />
      {complimentary && <Registration data={data} memberNumber={memberNumber} preview={!!preview} onSaved={load} isPhone={isPhone} />}
      <BuyTickets data={data} memberNumber={memberNumber} preview={!!preview} isPhone={isPhone} />
    </div>
  )
}

const section = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: 'var(--vfo-card-pad)', marginBottom: '16px' }
const cardTitle = { fontSize: '16px', color: 'var(--vfo-heading)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: '18px', paddingBottom: '11px', borderBottom: '2px solid var(--vfo-heading)' }
const help = { fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.55, margin: '0 0 16px' }
const sub = { fontSize: '13px', fontWeight: 800, color: 'var(--vfo-ink)', margin: '22px 0 10px' }
const bigBtn = { ...btnPrimary, padding: '12px 24px', fontSize: '14px', borderRadius: '10px' }

const STATUS = { paid: ['Paid', 'var(--vfo-success-text)'], clearing: ['Bank payment clearing', '#b45309'], refunded: ['Refunded', 'var(--vfo-muted)'] }

// What the member holds: their complimentary registration first, then each purchase.
function MyTickets({ data, isPhone }) {
  const { orders, registration: reg, me } = data
  const free = reg ? [
    ...(reg.attending ? [`${me.first_name} ${me.last_name}`] : []),
    ...(reg.corporate_names || []).map(n => `${n} (corporate member)`),
    ...reg.guests.map(g => `${g.first_name} ${g.last_name} (guest)`),
  ] : []
  if (!orders.length && !free.length) return null
  return (
    <div style={section}>
      <div style={cardTitle}>My Tickets</div>
      <div style={{ display: 'grid', gap: '12px' }}>
        {free.length > 0 && (
          <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: isPhone ? 'column' : 'row', gap: '12px', justifyContent: 'space-between' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{free.length} x Complimentary</div>
              {free.map((n, i) => <div key={i} style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '3px' }}>{n}</div>)}
            </div>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--vfo-success-text)', flexShrink: 0 }}>Registered</div>
          </div>
        )}
        {orders.map(o => {
          const [label, color] = STATUS[o.status] || ['', 'var(--vfo-muted)']
          return (
            <div key={o.id} style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '12px', padding: '14px 16px', display: 'flex', flexDirection: isPhone ? 'column' : 'row', gap: '12px', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{o.quantity} x {o.ticket_name}</div>
                {o.people.map(p => (
                  <div key={p.id} style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '3px', textDecoration: p.cancelled ? 'line-through' : 'none' }}>{p.name}{p.kind === 'guest' ? ' (guest)' : ''}</div>
                ))}
              </div>
              <div style={{ textAlign: isPhone ? 'left' : 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--vfo-ink)' }}>${eventMoney2(o.amount_total)}</div>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color, marginTop: '3px' }}>{label}</div>
                <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px' }}>{formatDate(o.date)}</div>
                {o.refunded_amount > 0 && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '3px' }}>${eventMoney2(o.refunded_amount)} refunded</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Registration({ data, memberNumber, preview, onSaved, isPhone }) {
  const { event, me, corporate, registration: reg } = data
  const initial = () => ({
    attending: reg ? reg.attending : true, phone: me.phone || '', corporate: reg ? reg.corporate : [], guests: reg ? reg.guests : [],
  })
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const key = JSON.stringify(reg)
  const lastKey = useRef(key)
  // What the server holds changed (a save, another window): start from it again.
  useEffect(() => { if (lastKey.current !== key) { lastKey.current = key; setForm(initial()) } }, [key])
  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setSaved(''); setError('') }

  const total = (form.attending ? 1 : 0) + form.corporate.length + form.guests.length
  async function save() {
    if (preview) return
    if (!reg && total === 0) { setError('Please tick who is coming.'); return }
    if (form.attending && String(form.phone).replace(/\D/g, '').length < 10) { setError('Please enter your full phone number.'); return }
    const problem = guestsProblem(form.guests)
    if (problem) { setError(problem); return }
    setBusy(true); setError('')
    try {
      const res = await callApi('events_register', { member_number: memberNumber, ...form }, 1)
      setSaved(res.total > 0 ? `Registered: ${res.total} ${res.total === 1 ? 'person' : 'people'}. We've emailed you a confirmation.` : 'Your registration has been cancelled.')
      await onSaved()
    } catch (e) { setError(e?.message || 'Your registration could not be saved.') }
    finally { setBusy(false) }
  }

  return (
    <div style={section}>
      <div style={cardTitle}>Your Complimentary Registration</div>
      <p style={help}>Your membership includes complimentary access to the {event.name}, for you{corporate.length > 0 ? ', your corporate members' : ''} and up to {event.free_guests} guests. There is nothing to pay.</p>

      <CheckLine checked={form.attending} onChange={v => set({ attending: v })}>I'm attending ({me.first_name} {me.last_name})</CheckLine>
      {form.attending && (
        <div style={{ margin: '14px 0 0 27px', maxWidth: isPhone ? '100%' : '320px' }}>
          <label style={evLabel} htmlFor="reg-phone">Your phone <span style={{ color: '#d93025' }}>*</span></label>
          <PhoneInput id="reg-phone" value={form.phone} onChange={v => set({ phone: v })} style={evInput} />
        </div>
      )}

      {corporate.length > 0 && (
        <>
          <div style={sub}>Your corporate members</div>
          <div style={{ display: 'grid', gap: '10px' }}>
            {corporate.map(c => (
              <CheckLine key={c.member_number} checked={form.corporate.includes(c.member_number)}
                onChange={v => set({ corporate: v ? [...form.corporate, c.member_number] : form.corporate.filter(n => n !== c.member_number) })}>{c.name}</CheckLine>
            ))}
          </div>
        </>
      )}

      <div style={sub}>Your guests ({form.guests.length} of {event.free_guests})</div>
      <GuestList guests={form.guests} onChange={guests => set({ guests })} max={event.free_guests} idPrefix="reg-guest" />

      <div style={{ display: 'grid', gap: '12px', marginTop: '22px' }}>
        <ErrorLine>{error}</ErrorLine>
        {saved && <div role="status" style={{ background: 'rgba(27,146,84,0.12)', border: '1px solid rgba(27,146,84,0.35)', color: 'var(--vfo-success-text)', borderRadius: '10px', padding: '11px 14px', fontSize: '13px', fontWeight: 600 }}>{saved}</div>}
        <div><button type="button" onClick={save} disabled={busy || preview} style={btnState(bigBtn, busy || preview)}>{busy ? 'Saving...' : preview ? 'Register (preview)' : reg ? 'Save changes' : 'Register'}</button></div>
      </div>
    </div>
  )
}

function BuyTickets({ data, memberNumber, preview, isPhone }) {
  const navigate = useNavigate()
  const { event, me, complimentary, registration, holds_ticket } = data
  const ticket = openTicketOf(event)
  const [form, setForm] = useState(() => {
    const kept = !preview ? readSession(EVENT_ORDER_KEY) : null
    return kept?.source === 'portal' && kept.member_number === memberNumber
      ? { attending: !!kept.attending, phone: kept.phone || me.phone || '', guests: kept.guests || [] }
      : { attending: !complimentary && !holds_ticket, phone: me.phone || '', guests: [] }
  })
  const [error, setError] = useState('')
  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setError('') }

  const freeLeft = complimentary ? event.free_guests - (registration?.guests.length || 0) : 0
  const attending = !complimentary && !holds_ticket && form.attending
  const quantity = (attending ? 1 : 0) + form.guests.length

  function go() {
    if (preview) return
    if (quantity < 1) { setError('Please add at least one person.'); return }
    if (String(form.phone).replace(/\D/g, '').length < 10) { setError('Please enter your full phone number.'); return }
    const problem = guestsProblem(form.guests)
    if (problem) { setError(problem); return }
    writeSession(EVENT_ORDER_KEY, { source: 'portal', member_number: memberNumber, ticket_key: ticket.key, attending, phone: form.phone, guests: form.guests })
    try { sessionStorage.setItem('memberActiveTab', 'events') } catch { /* private mode */ }
    navigate('/event-pay')
  }

  return (
    <div style={section}>
      <div style={cardTitle}>{complimentary ? 'More Guests' : 'Tickets'}</div>
      {complimentary && <p style={help}>{freeLeft > 0
        ? `You have ${freeLeft} complimentary guest ${freeLeft === 1 ? 'place' : 'places'} left. Anyone past those needs a ticket.`
        : `You've used all ${event.free_guests} complimentary guest places. You can buy a ticket for anyone else.`}</p>}
      <TicketCards event={event} />

      {ticket && (!complimentary || freeLeft <= 0) && (
        <div style={{ marginTop: '24px' }}>
          {!complimentary && (holds_ticket
            ? <p style={help}>You already have your own ticket. You can buy tickets for guests here.</p>
            : <CheckLine checked={form.attending} onChange={v => set({ attending: v })}>A ticket for me ({me.first_name} {me.last_name})</CheckLine>)}
          <div style={{ margin: attending ? '14px 0 0 27px' : '14px 0 0', maxWidth: isPhone ? '100%' : '320px' }}>
            <label style={evLabel} htmlFor="buy-phone">Your phone <span style={{ color: '#d93025' }}>*</span></label>
            <PhoneInput id="buy-phone" value={form.phone} onChange={v => set({ phone: v })} style={evInput} />
          </div>
          <div style={sub}>{complimentary ? 'Who are the tickets for?' : 'Bringing guests?'}</div>
          <GuestList guests={form.guests} onChange={guests => set({ guests })} max={19} idPrefix="buy-guest" />
          <div style={{ display: 'grid', gap: '14px', marginTop: '22px' }}>
            {quantity > 0 && <OrderTotal ticket={ticket} quantity={quantity} />}
            <ErrorLine>{error}</ErrorLine>
            <div><button type="button" onClick={go} disabled={preview || quantity < 1} style={btnState(bigBtn, preview || quantity < 1)}>{preview ? 'Continue to payment (preview)' : 'Continue to payment'}</button></div>
            <div style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Next you'll choose bank (no fee) or card. {ticket.name} price: until {ticketLastDay(ticket)}.</div>
          </div>
        </div>
      )}
      {!ticket && <p style={{ ...help, margin: '16px 0 0' }}>Tickets are not on sale right now.</p>}
    </div>
  )
}

function PaidNotice({ method, onClose, isPhone }) {
  const bank = method === 'ach'
  const tone = bank ? { line: 'linear-gradient(90deg, #d97706 0%, #fbbf24 100%)', bg: 'rgba(217,119,6,0.12)', fg: '#d97706' } : { line: 'linear-gradient(90deg, #1b9254 0%, #34c47c 100%)', bg: 'rgba(27,146,84,0.12)', fg: '#1b9254' }
  return (
    <div role="status" style={{ position: 'relative', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ height: '4px', background: tone.line }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: isPhone ? '12px' : '16px', padding: isPhone ? '14px 40px 14px 16px' : '16px 48px 16px 22px' }}>
        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: tone.bg, color: tone.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{bank ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : <path d="M5 12.5l4.5 4.5L19 7.5" />}</svg>
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--vfo-heading)' }}>{bank ? 'Your bank payment is on its way' : "You're going"}</div>
          <div style={{ fontSize: '13px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.5 }}>{bank
            ? "Your tickets are confirmed once it clears, usually in 3-5 business days. We'll email your invoice and receipt then."
            : "Your card payment has been processed. Your tickets appear below in a few seconds, and we've emailed your invoice and receipt."}</div>
        </div>
      </div>
      <button type="button" onClick={onClose} aria-label="Dismiss" style={{ position: 'absolute', top: '14px', right: '12px', width: '28px', height: '28px', borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--vfo-muted)', cursor: 'pointer' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  )
}

export function MemberEventsSkeleton({ inner = false }) {
  const isPhone = useIsPhone()
  const body = (
    <>
      <Skeleton width="100%" height={isPhone ? 190 : 240} style={{ borderRadius: '16px', marginBottom: '16px' }} />
      <div style={section}>
        <Skeleton width={110} height={16} style={{ marginBottom: '22px' }} />
        <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: '14px' }}>
          {[0, 1, 2].map(i => <Skeleton key={i} width="100%" height={150} style={{ borderRadius: '16px' }} />)}
        </div>
        <Skeleton width={200} height={14} style={{ marginTop: '24px' }} />
        <Skeleton width={170} height={40} style={{ marginTop: '20px', borderRadius: '10px' }} />
      </div>
    </>
  )
  return inner ? body : <div style={{ maxWidth: '980px', margin: '0 auto', padding: 'var(--vfo-gutter)' }}>{body}</div>
}
