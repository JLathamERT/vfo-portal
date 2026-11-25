import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import VfoWordmark from '../components/shared/VfoWordmark'
import MemberNamePicker from '../components/shared/MemberNamePicker'
import { btnPrimary, btnState } from '../components/shared/buttonStyles'
import { callApi } from '../lib/api'
import { useIsPhone } from '../lib/useMediaQuery'
import { nameHasBadChars, NAME_CHARS_CONTACT_MESSAGE } from '../lib/formatters'
import { blankPerson, EVENT_ORDER_KEY, EVENT_PUBLIC_FORM_KEY, guestsProblem, openTicketOf, personProblem, readSession, ticketLastDay, writeSession } from '../lib/events'
import { CheckLine, ErrorLine, EVENT_KEYFRAMES, EventBand, EventFacts, EV, evInput, evLabel, GuestList, OrderTotal, PersonFields, TicketCards } from '../components/events/EventParts'

// The public events page (2026-11-25): /events, no sign-in, in the Black Friday page's
// layout. Anyone buys tickets for themselves and guests; bank or card is chosen on
// /event-pay, which reads the order back from sessionStorage. Nobody is matched to a
// member here: the form asks whether they are one, or which member invited them, and
// the team confirms it in Events > Attendees.

const RETRY_MS = [1500, 3000, 6000, 10000]

export default function EventsPage() {
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [event, setEvent] = useState(undefined) // undefined = no answer yet
  const [missed, setMissed] = useState(0)
  const [slow, setSlow] = useState(false)
  const formRef = useRef(null)
  const paid = params.get('paid') === '1'
  const paidMethod = params.get('m')

  // No answer is not "no event": it is asked for again until the server answers.
  useEffect(() => {
    if (event !== undefined) return
    let live = true
    callApi('events_public_load', {}, 1).then(r => { if (live) setEvent(r?.event || null) })
      .catch(() => { if (live) setTimeout(() => live && setMissed(m => m + 1), RETRY_MS[Math.min(missed, RETRY_MS.length - 1)]) })
    return () => { live = false }
  }, [missed, event])
  useEffect(() => { const t = setTimeout(() => setSlow(true), 12000); return () => clearTimeout(t) }, [])
  useEffect(() => { document.title = event ? `${event.name} | VFO` : 'Events | VFO' }, [event])
  useEffect(() => { if (paid) { writeSession(EVENT_ORDER_KEY, null); writeSession(EVENT_PUBLIC_FORM_KEY, null) } }, [paid])

  const loading = event === undefined
  const offline = loading && (missed >= 2 || slow)
  const ticket = openTicketOf(event)
  // Only while the server answers. No event (the events switch Off) is a short band and a
  // plain card, like the Black Friday page with no sale.
  const topOnly = loading

  const [form, setForm] = useState(() => ({ buyer: blankPerson(), attending: true, guests: [], claimed_link: '', claimed_member_name: '', ...readSession(EVENT_PUBLIC_FORM_KEY, {}) }))
  const [error, setError] = useState('')
  const set = (patch) => { setForm(f => ({ ...f, ...patch })); setError('') }
  const quantity = (form.attending ? 1 : 0) + form.guests.length

  function submit(e) {
    e.preventDefault()
    setError('')
    const problem = personProblem(form.buyer, 'Your details')
      || (nameHasBadChars(form.buyer.first_name) || nameHasBadChars(form.buyer.last_name) ? NAME_CHARS_CONTACT_MESSAGE : '')
      || (!form.claimed_link ? 'Please tell us whether you are an ERT member.' : '')
      || (form.claimed_link === 'invited' && !form.claimed_member_name ? 'Please choose the member who invited you.' : '')
      || (quantity < 1 ? 'Please add at least one person.' : '')
      || guestsProblem(form.guests)
    if (problem) { setError(problem); return }
    writeSession(EVENT_PUBLIC_FORM_KEY, form)
    writeSession(EVENT_ORDER_KEY, { source: 'public', ticket_key: ticket.key, buyer: form.buyer, attending: form.attending, guests: form.guests, claimed_link: form.claimed_link, claimed_member_name: form.claimed_link === 'none' ? '' : form.claimed_member_name })
    navigate('/event-pay')
  }

  const hero = (
    <EventBand style={topOnly ? { minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : {}}>
      <div style={{ height: '58px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid rgba(255,255,255,0.08)' }}><VfoWordmark size={17} light /></div>
      <div className="vfo-ev-anim" key={loading ? 'loading' : 'ready'} style={{ animation: loading && !offline ? 'none' : 'vfoEvIn 0.45s ease-out', maxWidth: '920px', margin: '0 auto', padding: isPhone ? '36px var(--vfo-gutter) 44px' : '64px 24px 72px', textAlign: 'center' }}>
        {offline ? (
          <div role="alert">
            <h1 style={{ fontSize: isPhone ? '24px' : '32px', fontWeight: 900, margin: '0 0 12px' }}>We're having trouble connecting</h1>
            <p style={{ fontSize: isPhone ? '14px' : '16px', color: 'rgba(255,255,255,0.78)', margin: 0, lineHeight: 1.5 }}>Please check your internet connection. This page keeps trying on its own.</p>
          </div>
        ) : loading ? (
          <div className="vfo-ev-anim" role="status" aria-label="Loading" style={{ animation: 'vfoEvIn 0.3s ease-out 0.5s both' }}>
            <div className="vfo-ev-anim" style={{ width: '30px', height: '30px', margin: '0 auto', borderRadius: '50%', border: '3px solid rgba(255,138,90,0.25)', borderTopColor: EV.orange, animation: 'vfoEvSpin 0.8s linear infinite' }} />
          </div>
        ) : !event ? (
          <h1 style={{ fontSize: isPhone ? '30px' : '44px', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '6px 0 0' }}>Events</h1>
        ) : (
          <>
            <EventFacts event={event} big />
            {ticket && !paid && (
              <button type="button" onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                style={{ marginTop: isPhone ? '26px' : '34px', padding: '13px 30px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 800, color: '#fff', background: `linear-gradient(135deg, ${EV.orange} 0%, ${EV.orangeDeep} 100%)`, boxShadow: '0 8px 24px rgba(242,106,46,0.35)' }}>Get your tickets</button>
            )}
          </>
        )}
      </div>
    </EventBand>
  )

  let body = null
  if (!loading && !event && !paid) {
    body = (
      <div style={card}>
        <h2 style={{ fontSize: '20px', fontWeight: 800, textAlign: 'center', margin: '0 0 8px' }}>There are no events open right now</h2>
        <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', textAlign: 'center', margin: 0 }}>Upcoming events will appear here.</p>
      </div>
    )
  } else if (!loading && paid) {
    body = (
      <div style={card}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'rgba(27,146,84,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1b9254" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h2 style={{ fontSize: '22px', fontWeight: 800, textAlign: 'center', margin: '0 0 10px' }}>{paidMethod === 'ach' ? 'Thank you, your order is in' : "You're going"}</h2>
        <p style={{ fontSize: '14px', color: 'var(--vfo-muted)', textAlign: 'center', lineHeight: 1.6, margin: 0 }}>
          {paidMethod === 'ach'
            ? "Your bank payment is on its way. It usually takes 3-5 business days to clear, and your tickets are confirmed once it does. We've emailed you a confirmation."
            : "Your card payment has been processed and your tickets are confirmed. We've emailed your invoice and receipt."}
        </p>
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button type="button" onClick={() => { params.delete('paid'); params.delete('m'); setParams(params) }} style={{ background: 'none', border: 'none', color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Buy more tickets</button>
        </div>
      </div>
    )
  } else if (event) {
    body = (
      <>
        <div ref={formRef} style={{ ...card, marginBottom: '22px', scrollMarginTop: '16px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '16px' }}>Tickets</div>
          <TicketCards event={event} />
          {!ticket && <p style={{ ...helpText, margin: '16px 0 0' }}>Tickets are not on sale right now.</p>}
          <p style={{ ...helpText, margin: '16px 0 0' }}>Some ERT memberships include complimentary registration. If yours does, please sign in to your <a href="/member/login?next=%2Fmember%3Ftab%3Devents" style={{ color: 'var(--vfo-link)', fontWeight: 600 }}>VFO portal</a> and register on the Events tab instead.</p>
        </div>
        {ticket && (
          <form onSubmit={submit} style={card} noValidate>
            <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '14px' }}>Your details</div>
            <PersonFields value={form.buyer} onChange={buyer => set({ buyer })} idPrefix="ev-buyer" autoComplete />
            <div style={{ marginTop: '16px' }}><CheckLine checked={form.attending} onChange={v => set({ attending: v })}>I'm attending</CheckLine></div>

            <div style={subTitle}>Are you an ERT member? <span style={{ color: '#d93025' }}>*</span></div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {[['member', "Yes, I'm a member"], ['invited', 'No, a member invited me'], ['none', 'No']].map(([v, label]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="radio" name="ev-link" checked={form.claimed_link === v} onChange={() => set({ claimed_link: v, claimed_member_name: '' })} style={{ width: '17px', height: '17px', accentColor: '#125ecc', cursor: 'pointer' }} />
                  {label}
                </label>
              ))}
            </div>
            {(form.claimed_link === 'member' || form.claimed_link === 'invited') && (
              <div style={{ marginTop: '14px' }}>
                <div style={evLabel}>{form.claimed_link === 'member' ? 'Your name, from the member list (optional)' : <>Which member invited you? <span style={{ color: '#d93025' }}>*</span></>}</div>
                <MemberNamePicker key={form.claimed_link} value={form.claimed_member_name} inputStyle={evInput} onPick={n => set({ claimed_member_name: n })} onClear={() => set({ claimed_member_name: '' })}
                  search={async q => { try { return { ok: true, data: await callApi('events_member_search', { q }, 1) } } catch (e) { return { ok: false, data: { error: e?.message } } } }} />
              </div>
            )}

            <div style={subTitle}>Bringing guests?</div>
            <GuestList guests={form.guests} onChange={guests => set({ guests })} max={19} idPrefix="ev-guest" />

            <div style={{ display: 'grid', gap: '14px', marginTop: '24px' }}>
              {quantity > 0 && <OrderTotal ticket={ticket} quantity={quantity} />}
              <ErrorLine>{error}</ErrorLine>
              <button type="submit" disabled={quantity < 1} style={btnState({ ...btnPrimary, width: '100%', padding: '15px', fontSize: '15px', fontWeight: 800, borderRadius: '12px', background: `linear-gradient(135deg, ${EV.orange} 0%, ${EV.orangeDeep} 100%)`, boxShadow: '0 8px 24px rgba(242,106,46,0.3)' }, quantity < 1)}>Continue to payment</button>
              <div style={{ fontSize: '12px', color: 'var(--vfo-faint)', textAlign: 'center' }}>Next you'll choose bank or card. {ticket.name} price: until {ticketLastDay(ticket)}. Payments are processed securely by Stripe.</div>
            </div>
          </form>
        )}
      </>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--vfo-page)', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
      <style>{EVENT_KEYFRAMES}</style>
      {hero}
      {body && (
        <div className="vfo-ev-anim" style={{ animation: 'vfoEvIn 0.45s ease-out', maxWidth: '820px', margin: isPhone ? '-18px auto 0' : '-34px auto 0', padding: `0 ${isPhone ? 'var(--vfo-gutter)' : '24px'} 48px`, position: 'relative' }}>{body}</div>
      )}
    </div>
  )
}

const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '18px', boxShadow: 'var(--vfo-shadow-card)', padding: 'var(--vfo-card-pad)' }
const helpText = { fontSize: '13px', color: 'var(--vfo-muted)', lineHeight: 1.55 }
const subTitle = { fontSize: '14px', fontWeight: 800, color: 'var(--vfo-ink)', margin: '26px 0 12px' }
