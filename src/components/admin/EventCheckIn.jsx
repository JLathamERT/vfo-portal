import { useState } from 'react'
import { callApi } from '../../lib/api'
import ListFilterButton, { matchesFilter } from './ListFilterButton'
import { peopleOf } from './eventRows'
import { btnOutline, btnPrimary, btnState, BTN_SMALL } from '../shared/buttonStyles'
import { formatDateTime } from '../../lib/dates'

// Events > Check-in (2026-11-25): one row per person with a place, for the door.
const GRID = 'minmax(180px, 1.2fr) minmax(190px, 1.2fr) 130px minmax(200px, 1.2fr) 140px 190px'

export default function EventCheckIn({ rows, onDone }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState({})
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')

  const people = peopleOf(rows).filter(p => !p.cancelled && p.order.status !== 'refunded')
    .map(p => ({ ...p, ticket: p.order.ticket_name, clearing: p.order.status === 'clearing', role: p.coming_as }))
    .sort((x, y) => `${x.last_name} ${x.first_name}`.localeCompare(`${y.last_name} ${y.first_name}`))

  const groups = [
    { key: 'arrived', label: 'Arrived', options: ['Checked in', 'Not yet'], get: p => p.checked_in_at ? 'Checked in' : 'Not yet' },
    { key: 'ticket', label: 'Ticket', options: [...new Set(people.map(p => p.ticket))], get: p => p.ticket },
  ]
  const q = search.trim().toLowerCase()
  const shown = people.filter(p => !q || [p.name, p.email, p.role, p.member_number].some(v => String(v || '').toLowerCase().includes(q))).filter(p => matchesFilter(p, groups, filter))
  const arrived = people.filter(p => p.checked_in_at).length

  async function set(p, checkedIn) {
    setBusy(p.id); setErr('')
    try { await callApi('events_check_in', { attendee_id: p.id, checked_in: checkedIn }, 1); await onDone('') }
    catch (e) { setErr(e?.message || 'Could not save') }
    finally { setBusy(null) }
  }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  return (
    <>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder="Search by name, email or who they came with..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: 1, minWidth: '240px' }} />
        <ListFilterButton groups={groups} value={filter} onChange={setFilter} />
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--vfo-ink)' }}>{arrived} of {people.length} checked in</span>
      </div>
      {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '12px 14px', fontSize: '13px', marginBottom: '14px' }}>{err}</div>}
      <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: '1100px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <span>Name</span><span>Coming as</span><span>Ticket</span><span>Email</span><span>Phone</span><span>Check-in</span>
          </div>
          {shown.length === 0 && <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>{people.length === 0 ? 'Nobody has a place yet.' : 'Nobody matches.'}</div>}
          {shown.map(p => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '10px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: p.checked_in_at ? 'rgba(27,146,84,0.07)' : 'var(--vfo-card)' }}>
              <span style={{ fontWeight: 600 }}>{p.name}</span>
              <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)' }}>{p.role}</span>
              <span style={{ fontSize: '12.5px' }}>{p.ticket}{p.clearing && <span style={{ display: 'block', fontSize: '11px', color: '#b45309', fontWeight: 600 }}>Bank payment clearing</span>}</span>
              <span style={{ fontSize: '12.5px', overflowWrap: 'anywhere' }}>{p.email || '—'}</span>
              <span style={{ fontSize: '12.5px' }}>{p.phone || '—'}</span>
              {p.checked_in_at
                ? <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontSize: '11.5px', color: 'var(--vfo-success-text)', fontWeight: 600 }} title={p.checked_in_by || ''}>{formatDateTime(p.checked_in_at)}</span><button type="button" disabled={busy === p.id} onClick={() => set(p, false)} style={btnState({ ...btnOutline, ...BTN_SMALL }, busy === p.id)}>Undo</button></span>
                : <span><button type="button" disabled={busy === p.id} onClick={() => set(p, true)} style={btnState({ ...btnPrimary, ...BTN_SMALL }, busy === p.id)}>{busy === p.id ? 'Saving...' : 'Check in'}</button></span>}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
