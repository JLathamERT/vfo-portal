// Events (2026-11-25): the wording and sums every events screen shares. Prices and
// windows come from the server (event_tickets), display only - it re-prices every
// checkout.

export const EVENT_ORDER_KEY = 'eventOrder'      // what the pay page reads back
export const EVENT_PUBLIC_FORM_KEY = 'eventPublicForm'

export const blankPerson = () => ({ first_name: '', last_name: '', email: '', phone: '' })

export const eventMoney = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const eventMoney2 = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Card grosses up so Stripe's 2.9% + $0.30 nets to the ticket price.
export const eventCardTotal = (price) => Math.round((price + 0.30) / (1 - 0.029) * 100) / 100

// "August 19-20, 2027"
export function eventDatesText(event) {
  if (!event) return ''
  const f = (s, o) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', ...o })
  const { starts_on: a, ends_on: b } = event
  if (a === b) return f(a, { month: 'long', day: 'numeric', year: 'numeric' })
  if (a.slice(0, 7) === b.slice(0, 7)) return `${f(a, { month: 'long', day: 'numeric' })}-${f(b, { day: 'numeric' })}, ${a.slice(0, 4)}`
  return `${f(a, { month: 'long', day: 'numeric' })} - ${f(b, { month: 'long', day: 'numeric', year: 'numeric' })}`
}

const pt = (iso, shiftMs = 0) => new Date(Date.parse(iso) + shiftMs).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'long', day: 'numeric', year: 'numeric' })
// closes_at is exclusive (midnight Pacific), so the last day is the one before it.
export const ticketLastDay = (t) => pt(t.closes_at, -1000)
export const ticketWindowText = (t) => t.state === 'open' ? `Until ${ticketLastDay(t)}`
  : t.state === 'upcoming' ? `Opens ${pt(t.opens_at)}`
  : `Ended ${ticketLastDay(t)}`

export const openTicketOf = (event) => (event?.tickets || []).find(t => t.state === 'open') || null

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// What is wrong with one person's boxes, or ''. The server checks again.
export function personProblem(p, who) {
  const at = who ? `${who}: ` : ''
  if (!String(p.first_name || '').trim() || !String(p.last_name || '').trim()) return `${at}please enter a first and last name.`
  if (!EMAIL_RE.test(String(p.email || '').trim())) return `${at}please enter a valid email address.`
  if (String(p.phone || '').replace(/\D/g, '').length < 10) return `${at}please enter a full phone number.`
  return ''
}
export function guestsProblem(guests) {
  for (let i = 0; i < guests.length; i++) {
    const problem = personProblem(guests[i], guests.length > 1 ? `Guest ${i + 1}` : 'Guest')
    if (problem) return problem
  }
  return ''
}

export function readSession(key, fallback = null) {
  try { return JSON.parse(sessionStorage.getItem(key) || 'null') || fallback } catch { return fallback }
}
export function writeSession(key, value) {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ }
}
