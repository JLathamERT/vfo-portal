import { useEffect, useState } from 'react'
import TokenShell from '../components/shared/TokenShell'
import { callApi, getSession } from '../lib/api'
import { EVENT_ORDER_KEY, eventCardTotal, eventMoney2 as fmt, openTicketOf, readSession } from '../lib/events'

// /event-pay (2026-11-25): the bank-or-card choice for event tickets, in the house
// pay-page style (a copy of GrowthCreditsPayPage). The order waits in sessionStorage
// 'eventOrder', written by the member portal's Events tab (source 'portal' ->
// events_create_checkout) or the public /events page (source 'public' ->
// events_public_checkout). Prices are display only; the server re-prices every checkout.

export default function EventPayPage() {
  const [order] = useState(() => readSession(EVENT_ORDER_KEY))
  const session = getSession()
  const isPublic = order?.source === 'public'
  const member = !isPublic && session?.role === 'member' && session?.member_number ? session : null
  const [event, setEvent] = useState(undefined) // undefined = loading
  const [status, setStatus] = useState('ready')
  const [error, setError] = useState('')
  const [hoveredOption, setHoveredOption] = useState(null)

  useEffect(() => {
    callApi('events_public_load', {}, 3).then(r => setEvent(r?.event || null)).catch(() => setEvent('failed'))
  }, [])

  const backHref = isPublic ? '/events' : '/member?tab=events'
  const backLabel = isPublic ? 'Back to the event' : 'Back to Events'
  if (!order) return <Message icon="!" tone="red" title="Your order is missing" text="Please start again from the event page." backHref="/events" backLabel="Go to the event" />
  if (!isPublic && (!member || member.member_number !== order.member_number)) return <Message icon="i" tone="grey" title="Please sign in" text="Sign in to your VFO portal to buy tickets." backHref="/member/login" backLabel="Go to sign in" />
  if (event === undefined) return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Loading…</p>
    </TokenShell>
  )
  if (event === 'failed') return <Message icon="!" tone="grey" title="We're having trouble connecting" text="Please check your internet connection and try again." backHref="/event-pay" backLabel="Try again" />
  const ticket = openTicketOf(event)
  if (!ticket) return <Message icon="i" tone="grey" title="Tickets are not on sale" text="Tickets are not on sale right now." backHref={backHref} backLabel={backLabel} />
  if (order.ticket_key && order.ticket_key !== ticket.key) return <Message icon="i" tone="grey" title="That ticket is no longer on sale" text={`${ticket.name} tickets are on sale now. Please go back and continue from there.`} backHref={backHref} backLabel={backLabel} />

  const guests = order.guests || []
  const quantity = guests.length + (order.attending ? 1 : 0)
  if (quantity < 1) return <Message icon="!" tone="red" title="Something went wrong" text="This order has nobody on it." backHref={backHref} backLabel={backLabel} />
  const price = ticket.price * quantity
  const firstName = isPublic ? order.buyer?.first_name : String(member.name || '').split(' ')[0]
  const cardTotal = eventCardTotal(price)
  const cardFee = Math.round((cardTotal - price) * 100) / 100
  const rows = [{ label: `${quantity} x ${ticket.name}`, value: `$${fmt(price)}`, valueColor: 'var(--vfo-ink-2)' }]

  async function handleChoice(method) {
    setStatus('redirecting')
    try {
      const common = { payment_method: method, ticket_key: ticket.key, attending: !!order.attending, guests }
      const res = isPublic
        ? await callApi('events_public_checkout', { ...order.buyer, ...common, claimed_link: order.claimed_link, claimed_member_name: order.claimed_member_name }, 1)
        : await callApi('events_create_checkout', { member_number: member.member_number, phone: order.phone, ...common }, 1)
      if (res.url) { window.location.href = res.url; return }
      setError('Failed to start the secure payment.')
      setStatus('error')
    } catch (e) {
      setError(e?.message || 'Failed to start the secure payment.')
      setStatus('error')
    }
  }

  if (status === 'redirecting') return (
    <TokenShell>
      <p style={{ color: 'var(--vfo-muted)', fontSize: '15px', textAlign: 'center', margin: 0 }}>Redirecting to Stripe…</p>
    </TokenShell>
  )
  if (status === 'error') return <Message icon="!" tone="red" title="Something went wrong" text={error} backHref={backHref} backLabel={backLabel} />

  return (
    <TokenShell>
      <div style={{ width: '100%' }}>
        <div className="vfo-statusicon" style={{ ...iconCircle, width: '64px', height: '64px', background: 'rgba(34,197,94,0.15)' }}>
          <span style={{ fontSize: '28px', lineHeight: 1 }}>🔒</span>
        </div>
        <h1 style={{ ...title, fontSize: '22px', textAlign: 'center', marginBottom: '8px' }}>{event.name}</h1>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: '12px' }}>
          Hi {firstName || 'there'} — choose how you'd like to pay.
        </p>
        <p style={{ ...subtitle, textAlign: 'center', marginBottom: '32px', fontSize: '13px' }}>
          You're buying <strong>{quantity} {ticket.name} {quantity === 1 ? 'ticket' : 'tickets'}</strong>.
        </p>

        <OptionCard
          isHovered={hoveredOption === 'ach'}
          onHover={() => setHoveredOption('ach')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('ach')}
          title="Bank Account (ACH)"
          badgeText="No Fee"
          badgeClass="green"
          amount={price}
          cadence="one-time payment"
          breakdown={[...rows, { label: 'Processing Fee', value: '$0.00', valueColor: '#16a34a' }]}
          footer="Funds transfer directly from your bank and take 3-5 business days to clear. Your tickets are confirmed once it has cleared."
        />

        <div style={divider}>— or —</div>

        <OptionCard
          isHovered={hoveredOption === 'card'}
          onHover={() => setHoveredOption('card')}
          onLeave={() => setHoveredOption(null)}
          onClick={() => handleChoice('card')}
          title="Credit / Debit Card"
          badgeText="2.9% + $0.30 Fee"
          badgeClass="blue"
          amount={cardTotal}
          cadence="one-time payment"
          breakdown={[...rows, { label: 'Card Processing Fee (2.9% + $0.30)', value: `$${fmt(cardFee)}`, valueColor: 'var(--vfo-ink-2)' }]}
          footer="Processes immediately. Your tickets are confirmed within seconds."
        />

        <p style={securityNote}>
          Your payment details are handled securely by Stripe.<br />
          VFO Services never sees or stores your payment information.
        </p>
        <p style={{ textAlign: 'center', marginTop: '12px' }}>
          <a href={backHref} style={{ color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>{backLabel}</a>
        </p>
      </div>
    </TokenShell>
  )
}

function Message({ icon, tone, title: t, text, backHref, backLabel }) {
  const bg = tone === 'red' ? '#ef444420' : 'rgba(107,114,128,0.15)'
  return (
    <TokenShell maxWidth={520}>
      <div style={messageCard}>
        <div className="vfo-statusicon" style={{ ...iconCircle, background: bg }}><span style={{ fontSize: '28px', lineHeight: 1, fontWeight: 800, color: tone === 'red' ? '#dc2626' : 'var(--vfo-muted)' }}>{icon}</span></div>
        <h1 style={title}>{t}</h1>
        <p style={subtitle}>{text}</p>
        {backHref && <p style={{ marginTop: '18px' }}><a href={backHref} style={{ color: 'var(--vfo-link)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>{backLabel}</a></p>}
      </div>
    </TokenShell>
  )
}

// Copied from MembershipPayPage (the house option card).
function OptionCard({ isHovered, onHover, onLeave, onClick, title: t, badgeText, badgeClass, amount, cadence, breakdown, footer }) {
  return (
    <div className="vfo-paycard" onClick={onClick} onMouseEnter={onHover} onMouseLeave={onLeave}
      style={{ ...optionCard, borderColor: isHovered ? '#0095ff' : 'var(--vfo-border)', background: isHovered ? 'rgba(0,149,255,0.05)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{t}</span>
        <span style={{ ...badgeBase, ...badgeStyles[badgeClass] }}>{badgeText}</span>
      </div>
      {amount !== null && <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '4px' }}>${fmt(amount)}</div>}
      {cadence && <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>{cadence}</div>}
      <div style={{ marginBottom: '16px' }}>
        {breakdown.map((row, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '4px 0', fontSize: '13px' }}>
            <span style={{ color: 'var(--vfo-muted)' }}>{row.label}</span>
            <span style={{ color: row.valueColor, fontWeight: 600, whiteSpace: 'nowrap' }}>{row.value}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--vfo-border-soft)' }}>{footer}</div>
    </div>
  )
}

const messageCard = { textAlign: 'center', padding: '12px 0' }
const iconCircle = { width: '72px', height: '72px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }
const title = { fontSize: '24px', fontWeight: 700, color: 'var(--vfo-ink)', marginBottom: '12px' }
const subtitle = { fontSize: '14px', color: 'var(--vfo-muted)', lineHeight: 1.6 }
const optionCard = { border: '2px solid var(--vfo-border)', borderRadius: '16px', padding: '28px', marginBottom: '16px', cursor: 'pointer', transition: 'all 0.2s' }
const badgeBase = { fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.5px' }
const badgeStyles = {
  green: { background: 'rgba(34,197,94,0.15)', color: '#16a34a' },
  blue: { background: 'rgba(0,149,255,0.15)', color: '#0095ff' },
}
const divider = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', margin: '8px 0' }
const securityNote = { textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '12px', marginTop: '24px', lineHeight: 1.6 }
