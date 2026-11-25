// Events admin page: the order rows of events_admin_load turned into people
// (Attendees, Check-in, the export) and into purchases.

export const eventMoney = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const methodOf = (r) => r.payment_method === 'ach' ? 'Bank' : r.payment_method === 'card' ? 'Card' : ''
export const sourceOf = (r) => r.source === 'public' ? 'Public page' : 'Portal'
export const howOf = (r) => r.kind === 'complimentary' ? 'Registered free' : `${sourceOf(r)}, ${methodOf(r).toLowerCase()}`
export const needsAnswer = (r) => r.kind === 'paid' && r.source === 'public' && !r.link_type
export const connectionOf = (r) => needsAnswer(r) ? 'Needs allocating' : r.link_type === 'guest_of' ? "Member's guest" : r.link_type === 'none' ? 'Not connected' : 'Member'

export const ATTENDEE_TYPES = ['Member', 'Corporate member', 'Guest', 'Non-member', 'Not allocated yet']

// Every person on every order, refunded and cancelled people included.
export function peopleOf(rows) {
  return rows.flatMap(r => r.people.map(p => {
    const toMember = r.link_type === 'member' || r.link_type === 'guest_of'
    const main = p.kind === 'buyer' && r.link_type !== 'guest_of'
    const type = p.kind === 'corporate' ? 'Corporate member'
      : !main ? 'Guest'
      : r.link_type === 'member' ? 'Member'
      : r.link_type === 'none' ? 'Non-member' : 'Not allocated yet'
    // Who they come with: the member when there is one, else the person who bought.
    const guestOf = main ? '' : toMember ? r.member_name : r.name
    return {
      ...p, order: r, type, guest_of: guestOf, main,
      coming_as: type === 'Guest' ? `Guest of ${guestOf}` : type === 'Corporate member' ? `Corporate member of ${guestOf}` : type,
      status: p.cancelled ? (p.refund_id || r.status === 'refunded' ? 'Refunded' : 'Cancelled') : r.status === 'clearing' ? 'Bank payment clearing' : 'Confirmed',
      party: toMember ? `m:${r.member_number}` : `o:${r.order_id}`,
    }
  }))
}

// The people coming, in parties: everyone who comes with one member (across all their
// purchases), or everyone on one purchase when its buyer is nobody's guest. The
// main person leads their party; null = they are not coming themselves.
export function partiesOf(rows) {
  const byKey = new Map()
  for (const p of peopleOf(rows)) {
    if (p.cancelled || p.order.status === 'refunded') continue
    if (!byKey.has(p.party)) byKey.set(p.party, { key: p.party, name: p.party.startsWith('m:') ? p.order.member_name : p.order.name, member_number: p.party.startsWith('m:') ? p.order.member_number : null, main: null, guests: [], date: '', lapsed: false })
    const g = byKey.get(p.party)
    if (p.main && !g.main) g.main = p
    else g.guests.push(p)
    if (p.order.lapsed) g.lapsed = true
    if (String(p.order.date || '') > g.date) g.date = String(p.order.date || '')
  }
  return [...byKey.values()].map(g => ({ ...g, guests: g.guests.sort((a, b) => a.id - b.id) }))
}
