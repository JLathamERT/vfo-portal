import { useMemo, useState } from 'react'
import { callApi } from '../../lib/api'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'
import { MemberNameLink } from '../shared/personLinks'
import { btnDanger, btnOutline, btnState, BTN_SMALL } from '../shared/buttonStyles'
import { formatDate } from '../../lib/dates'
import EventConnectionCell from './EventConnectionCell'
import EventRefundDialog from './EventRefundDialog'
import EventTiles from './EventTiles'
import { connectionOf, eventMoney as money, methodOf, needsAnswer, sourceOf } from './eventRows'
import { listSelectStyle } from '../shared/ListTable'

// Events > Purchases (2026-11-25): one row per payment, in the Growth Credits Purchases
// list's style. The money, who the buyer is (allocating a public buyer) and the
// refund. Free registrations are not purchases: they show under Attendees only.

const GRID = 'minmax(180px, 1.2fr) 112px minmax(140px, 1fr) 96px 86px 80px 150px 92px minmax(270px, 1.5fr) 84px'
const MIN_WIDTH = '1420px'
const small = { display: 'block', fontSize: '11px', color: 'var(--vfo-muted)' }

const SORT_OPTIONS = [
  { value: 'newest', label: 'Date: Newest' },
  { value: 'oldest', label: 'Date: Oldest' },
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
]
const statusOf = (r) => r.status === 'clearing' ? 'Bank payment clearing' : r.status === 'refunded' ? 'Refunded' : r.refunded_amount > 0 ? 'Part refunded' : 'Paid'
const STATUS_COLOR = { Paid: 'var(--vfo-success-text)', 'Bank payment clearing': '#b45309', 'Part refunded': '#b45309', Refunded: 'var(--vfo-muted)' }

export default function EventPurchasesTable({ data, onDone }) {
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState({})
  const [listSort, setListSort] = useState('newest')
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort(null)
  const [refunding, setRefunding] = useState(null)

  const all = (data.rows || []).filter(r => r.kind === 'paid')
  const filterGroups = [
    { key: 'connection', label: 'Member', options: ['Needs allocating', 'Member', "Member's guest", 'Not connected'], get: connectionOf },
    { key: 'status', label: 'Status', options: ['Paid', 'Bank payment clearing', 'Part refunded', 'Refunded'], get: statusOf },
    { key: 'ticket', label: 'Ticket', options: data.event.tickets.map(t => t.name), get: r => r.ticket_name },
    { key: 'source', label: 'How purchased', options: ['Portal', 'Public page'], get: sourceOf },
  ]
  const q = search.trim().toLowerCase()
  const hit = (v) => String(v || '').toLowerCase().includes(q)
  const ordered = useMemo(() => {
    const list = all.filter(r => !q || hit(r.name) || hit(r.email) || hit(r.member_number) || hit(r.member_name) || r.people.some(p => hit(p.name) || hit(p.email)))
      .filter(r => matchesFilter(r, filterGroups, listFilter))
    const at = r => r.date || ''
    switch (listSort) {
      case 'oldest': return list.sort((a, b) => at(a).localeCompare(at(b)))
      case 'az': return list.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()))
      case 'za': return list.sort((a, b) => (b.name || '').toLowerCase().localeCompare((a.name || '').toLowerCase()))
      default: return list.sort((a, b) => at(b).localeCompare(at(a)))
    }
  }, [data, q, listFilter, listSort])
  const rows = sortByColumn(ordered, colSort, {
    name: { type: 'text', get: r => r.name || '' },
    tickets: { type: 'number', get: r => r.quantity },
    source: { type: 'text', get: sourceOf },
    amount: { type: 'number', get: r => r.price },
    fee: { type: 'number', get: r => r.card_fee },
    status: { type: 'text', get: statusOf },
    date: { type: 'date', get: r => r.date || '' },
    member: { type: 'text', get: connectionOf },
  })

  const cleared = all.filter(r => r.status !== 'clearing')
  const sum = (list, f) => list.reduce((n, r) => n + f(r), 0)
  const tiles = [
    { label: 'Tickets sold', value: sum(all, r => r.people.filter(p => !p.cancelled).length) },
    { label: 'Ticket sales', value: money(sum(cleared, r => Math.max(0, r.price - r.refunded_amount))) },
    { label: 'Still clearing', value: money(sum(all.filter(r => r.status === 'clearing'), r => r.price)) },
    { label: 'Refunded', value: money(sum(all, r => r.refunded_amount)) },
  ]
  const needCount = all.filter(needsAnswer).length
  const sel = listSelectStyle

  return (
    <>
      <EventTiles tiles={tiles} />
      {needCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(18,94,204,0.07)', border: '1px solid rgba(18,94,204,0.25)', color: '#125ecc', borderRadius: '12px', padding: '11px 16px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
          {needCount} public {needCount === 1 ? 'purchase needs' : 'purchases need'} allocating.
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by buyer, guest, email or member number..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: 1, minWidth: '240px' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={SORT_OPTIONS} />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: MIN_WIDTH }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <SortHeader label="Bought by" sortKey="name" sort={colSort} onSort={onSort} />
            <SortHeader label="Tickets" sortKey="tickets" sort={colSort} onSort={onSort} />
            <span>For</span>
            <SortHeader label="Paid by" sortKey="source" sort={colSort} onSort={onSort} />
            <SortHeader label="Amount" sortKey="amount" sort={colSort} onSort={onSort} />
            <SortHeader label="Card fee" sortKey="fee" sort={colSort} onSort={onSort} />
            <SortHeader label="Status" sortKey="status" sort={colSort} onSort={onSort} />
            <SortHeader label="Date" sortKey="date" sort={colSort} onSort={onSort} />
            <SortHeader label="Member" sortKey="member" sort={colSort} onSort={onSort} />
            <span />
          </div>
          {rows.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>{all.length === 0 ? 'No tickets have been bought yet.' : 'No purchases match the current search and filters.'}</div>
          )}
          {rows.map(r => {
            const status = statusOf(r)
            return (
              <div key={r.order_id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'start', fontSize: '12.5px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>{r.name || '—'}</span>
                  {r.source === 'portal' && r.member_number && <MemberNameLink memberNumber={r.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginLeft: '8px' }}>#{r.member_number}</MemberNameLink>}
                  <span style={small}>{r.email}</span>
                  {r.phone && <span style={small}>{r.phone}</span>}
                </span>
                <span>{r.quantity} x {r.ticket_name}</span>
                <span>{r.people.map(p => <span key={p.id} style={{ display: 'block', textDecoration: p.cancelled ? 'line-through' : 'none', color: p.cancelled ? 'var(--vfo-faint)' : 'inherit' }}>{p.name}</span>)}</span>
                <span>{sourceOf(r)}<span style={small}>{methodOf(r)}</span></span>
                <span style={{ fontWeight: 600 }}>{money(r.price)}</span>
                <span style={{ color: r.card_fee > 0 ? 'inherit' : 'var(--vfo-faint)' }}>{r.card_fee > 0 ? money(r.card_fee) : '—'}</span>
                <span style={{ fontWeight: 600, color: STATUS_COLOR[status] }}>{status}{r.refunded_amount > 0 && <span style={small}>{money(r.refunded_amount)} refunded</span>}</span>
                <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{formatDate(r.date) || '—'}</span>
                <EventConnectionCell key={`${r.link_type}-${r.member_number}`} row={r} members={data.members || []} onDone={onDone} />
                <RefundCell row={r} onRefund={() => setRefunding(r)} onDone={onDone} />
              </div>
            )
          })}
        </div>
      </div>
      {refunding && <EventRefundDialog row={refunding} onClose={() => setRefunding(null)} onDone={onDone} />}
    </>
  )
}

// The refund's own column, so its button is always in the same place.
function RefundCell({ row: r, onRefund, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pending = r.refunds.find(x => x.status === 'pending')
  const canRefund = r.status === 'paid' && !pending && r.people.some(p => !p.cancelled && !p.checked_in_at)
  async function checkAgain() {
    setBusy(true); setErr('')
    try {
      const res = await callApi('events_refund_order', { refund_id: pending.id }, 1)
      await onDone(`${money(res.amount)} refunded to ${r.name}.`)
    } catch (e) { setErr(e?.message || 'Try again in a minute.'); await onDone('') }
    finally { setBusy(false) }
  }
  return (
    <span style={{ justifySelf: 'end', textAlign: 'right' }}>
      {canRefund && <button type="button" onClick={onRefund} style={{ ...btnDanger, ...BTN_SMALL }}>Refund</button>}
      {pending && (
        <>
          <button type="button" disabled={busy} onClick={checkAgain} style={btnState({ ...btnOutline, ...BTN_SMALL, whiteSpace: 'normal' }, busy)}>{busy ? 'Checking...' : 'Check again'}</button>
          <span style={{ ...small, color: '#b45309', marginTop: '4px' }}>{money(pending.amount)} not confirmed</span>
        </>
      )}
      {err && <span style={{ ...small, color: '#b91c1c', marginTop: '4px' }}>{err}</span>}
    </span>
  )
}
