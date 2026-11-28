import { useEffect, useMemo, useState } from 'react'
import ListFilterButton, { matchesFilter, SortSelect } from './ListFilterButton'
import ExportButton from '../shared/ExportButton'
import { MemberNameLink } from '../shared/personLinks'
import { btnOutline, BTN_SMALL } from '../shared/buttonStyles'
import Tag from '../shared/Tag'
import { formatDate } from '../../lib/dates'
import { exportDate } from '../../lib/exportXlsx'
import EventTiles from './EventTiles'
import { ATTENDEE_TYPES, connectionOf, eventMoney as money, howOf, needsAnswer, partiesOf, peopleOf } from './eventRows'
import { listSelectStyle } from '../shared/ListTable'

// Events > Attendees (2026-11-25): one row per PERSON coming, so the rows and the
// count agree. People are kept in parties: a member (or a buyer who is nobody's
// guest), then everyone they bring, indented under them across all their purchases.
// Money, allocating and refunds are Events > Purchases. The export is the same people.

export const EVENT_GRID = 'minmax(220px, 1.3fr) minmax(210px, 1.2fr) 130px 70px 150px 90px 100px minmax(220px, 1.2fr)'
export const EVENT_MIN_WIDTH = '1280px'
const small = { display: 'block', fontSize: '11px', color: 'var(--vfo-muted)' }

const SORT_OPTIONS = [
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
  { value: 'newest', label: 'Date: Newest' },
  { value: 'oldest', label: 'Date: Oldest' },
]

const EXPORT_COLUMNS = [
  { header: 'First Name', value: r => r.first_name },
  { header: 'Last Name', value: r => r.last_name },
  { header: 'Email', value: r => r.email },
  { header: 'Phone', value: r => r.phone },
  { header: 'Type', value: r => r.type },
  { header: 'Guest Of', value: r => r.guest_of },
  { header: 'Member Number', value: r => r.member_number || '' },
  { header: 'Ticket', value: r => r.order.ticket_name },
  { header: 'Status', value: r => r.status },
  { header: 'Checked In', value: r => r.checked_in_at ? 'Yes' : '' },
  { header: 'How Purchased', value: r => howOf(r.order) },
  { header: 'Ticket Price', value: r => r.order.kind === 'paid' ? money(r.order.unit_price) : 'Free' },
  { header: 'Date', value: r => exportDate(r.order.date) },
  { header: 'Bought By', value: r => r.order.name, default: false },
  { header: 'Bought By Email', value: r => r.order.email, default: false },
  { header: 'Connection', value: r => connectionOf(r.order), default: false },
]

function readView(key, fallback) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null')
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback
  } catch { return fallback }
}

export default function EventAttendeesTable({ data, onOpenPurchases }) {
  const viewKey = 'eventAttendeesView2'
  const [initialView] = useState(() => readView(viewKey, { search: '', filter: {}, sort: 'az' }))
  const [search, setSearch] = useState(initialView.search)
  const [listFilter, setListFilter] = useState(initialView.filter || {})
  const [listSort, setListSort] = useState(initialView.sort)
  useEffect(() => {
    try { sessionStorage.setItem(viewKey, JSON.stringify({ search, filter: listFilter, sort: listSort })) } catch { /* private mode */ }
  }, [search, listFilter, listSort])

  const parties = useMemo(() => partiesOf(data.rows || []), [data])
  const people = parties.flatMap(g => [...(g.main ? [g.main] : []), ...g.guests])
  const ticketNames = [...data.event.tickets.map(t => t.name), 'Complimentary']
  const filterGroups = [
    { key: 'type', label: 'Coming as', options: ATTENDEE_TYPES, get: p => p.type },
    { key: 'ticket', label: 'Ticket', options: ticketNames, get: p => p.order.ticket_name },
    { key: 'status', label: 'Status', options: ['Confirmed', 'Bank payment clearing'], get: p => p.status },
  ]
  const exportFilters = [
    { key: 'type', label: 'Type', options: ATTENDEE_TYPES, get: p => p.type },
    { key: 'ticket', label: 'Ticket', options: ticketNames, get: p => p.order.ticket_name },
    { key: 'status', label: 'Status', options: ['Confirmed', 'Bank payment clearing', 'Refunded', 'Cancelled'], get: p => p.status },
  ]
  const q = search.trim().toLowerCase()
  const hit = (v) => String(v || '').toLowerCase().includes(q)
  const filtering = Object.values(listFilter).some(v => v?.length)

  const shown = parties
    // A search that finds anyone in a party shows the whole party.
    .filter(g => !q || hit(g.name) || hit(g.member_number) || [g.main, ...g.guests].some(p => p && (hit(p.name) || hit(p.email) || hit(p.phone) || hit(p.member_number))))
    .map(g => filtering ? { ...g, main: g.main && matchesFilter(g.main, filterGroups, listFilter) ? g.main : null, hidden: true, guests: g.guests.filter(p => matchesFilter(p, filterGroups, listFilter)) } : g)
    .filter(g => g.main || g.guests.length)
    .sort((a, b) => listSort === 'za' ? b.name.localeCompare(a.name) : listSort === 'newest' ? b.date.localeCompare(a.date) : listSort === 'oldest' ? a.date.localeCompare(b.date) : a.name.localeCompare(b.name))
  const shownCount = shown.reduce((n, g) => n + (g.main ? 1 : 0) + g.guests.length, 0)

  const count = (f) => people.filter(f).length
  const tiles = [
    { label: 'People coming', value: people.length },
    { label: 'Members', value: count(p => p.type === 'Member' || p.type === 'Corporate member') },
    { label: 'Guests', value: count(p => p.type === 'Guest') },
    { label: 'Non-members', value: count(p => p.type === 'Non-member' || p.type === 'Not allocated yet') },
  ]
  const needCount = (data.rows || []).filter(needsAnswer).length
  const exportRows = peopleOf(data.rows || []).filter(p => !q || [p.name, p.email, p.phone, p.member_number, p.guest_of].some(hit))
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))

  const sel = listSelectStyle
  const cells = { display: 'grid', gridTemplateColumns: EVENT_GRID, gap: '10px', alignItems: 'center', fontSize: '12.5px', color: 'var(--vfo-ink)' }

  // A member who registered free and then left the tier that comes free.
  const lapsedTag = <span title="They registered free, but their membership no longer includes it. Their places are kept." style={{ marginLeft: '10px' }}><Tag color="#d97706">No longer comes free</Tag></span>
  const personRow = (p, { guest, guests = 0, lapsed = false }) => (
    <div key={p.id} style={{ ...cells, padding: guest ? '8px 18px' : '11px 18px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, paddingLeft: guest ? '20px' : 0 }}>
        {guest && <span aria-hidden="true" style={{ width: '12px', height: '14px', marginTop: '-12px', borderLeft: '2px solid var(--vfo-border-strong)', borderBottom: '2px solid var(--vfo-border-strong)', borderBottomLeftRadius: '6px', flexShrink: 0 }} />}
        <span style={{ minWidth: 0 }}>
          <span style={{ fontWeight: guest ? 500 : 700, fontSize: '13px' }}>{p.name}</span>
          {p.member_number && <MemberNameLink memberNumber={p.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginLeft: '8px' }}>#{p.member_number}</MemberNameLink>}
          {lapsed && lapsedTag}
        </span>
      </span>
      <span style={{ color: 'var(--vfo-muted)' }}>{p.coming_as}</span>
      <span>{p.order.ticket_name}{p.status === 'Bank payment clearing' && <span style={{ ...small, color: '#b45309', fontWeight: 600 }}>Bank payment clearing</span>}</span>
      <span>{guest ? '' : guests > 0 ? guests : <span style={{ color: 'var(--vfo-faint)' }}>None</span>}</span>
      <span>{howOf(p.order)}</span>
      <span style={{ fontWeight: 600 }}>{p.order.kind === 'paid' ? money(p.order.unit_price) : 'Free'}</span>
      <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{formatDate(p.order.date) || '—'}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.email || '—'}{p.phone && <span style={small}>{p.phone}</span>}</span>
    </div>
  )

  return (
    <>
      <EventTiles tiles={tiles} />
      {needCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'rgba(18,94,204,0.07)', border: '1px solid rgba(18,94,204,0.25)', color: '#125ecc', borderRadius: '12px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
          {needCount} public {needCount === 1 ? 'purchase needs' : 'purchases need'} allocating.
          <button type="button" onClick={onOpenPurchases} style={{ ...btnOutline, ...BTN_SMALL }}>Open Purchases</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by name, email, phone or member number..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: 1, minWidth: '240px' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={setListSort} options={SORT_OPTIONS} />
        <ExportButton title={`${data.event.name} Attendees`} columns={EXPORT_COLUMNS} rows={exportRows} filterGroups={exportFilters} filterValue={{ status: ['Confirmed', 'Bank payment clearing'] }} />
      </div>
      {(q || filtering) && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '-6px 2px 10px' }}>Showing {shownCount} of {people.length} people</div>}

      <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: EVENT_MIN_WIDTH }}>
          <div style={{ display: 'grid', gridTemplateColumns: EVENT_GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Attendee</span><span>Coming as</span><span>Ticket</span><span>Guests</span><span>How purchased</span><span>Paid</span><span>Date</span><span>Contact</span>
          </div>
          {shown.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>{people.length === 0 ? 'Nobody is coming yet.' : 'Nobody matches the current search and filters.'}</div>
          )}
          {shown.map(g => (
            <div key={g.key} style={{ borderBottom: '1px solid var(--vfo-border-soft)', paddingBottom: g.guests.length ? '6px' : 0 }}>
              {g.main
                ? personRow(g.main, { guest: false, guests: g.guests.length, lapsed: g.lapsed })
                : !g.hidden && (
                  // Bringing guests, not coming themselves: a heading, not an attendee.
                  <div style={{ padding: '11px 18px 5px', fontSize: '12.5px', color: 'var(--vfo-muted)' }}>
                    <span style={{ fontWeight: 600 }}>{g.name}</span>
                    {g.member_number && <MemberNameLink memberNumber={g.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginLeft: '8px' }}>#{g.member_number}</MemberNameLink>}
                    <span style={{ marginLeft: '10px' }}>not attending</span>
                    {g.lapsed && lapsedTag}
                  </div>
                )}
              {g.guests.map(p => personRow(p, { guest: true }))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
