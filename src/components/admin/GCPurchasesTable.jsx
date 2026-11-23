import { useEffect, useMemo, useState } from 'react'
import { callApi } from '../../lib/api'
import ListFilterButton, { matchesFilter, SortSelect, useHeaderSort, sortByColumn, SortHeader } from './ListFilterButton'
import { MemberNameLink } from '../shared/personLinks'
import { useIsPhone } from '../../lib/useMediaQuery'
import { formatDate } from '../../lib/dates'
import { SearchFilterSkeleton, TableSkeleton } from '../shared/Skeleton'

// Growth Credits > Purchases (2026-11-20): every Growth Credits sale in the
// Advisor Onboarding list's style (OnboardingListTable.jsx): search, filter,
// sort, sortable headers. Columns Name · Email · Source · Amount Paid · Credits ·
// Date · Member. A public Black Friday order waiting to be allocated has a
// member search in its Member cell, opened on the best suggested match, and an
// Allocate button with a Confirm step (gc_allocate_order).

const GRID = 'minmax(170px, 1.1fr) minmax(190px, 1.3fr) 110px 120px 130px 110px minmax(300px, 1.7fr)'
const MIN_WIDTH = '1240px'
const dot = (color) => ({ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: color, display: 'inline-block' })
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const NEEDS = 'Needs allocation'
const CLEARING = 'Clearing'
const ALLOCATED = 'Allocated'
const PAID = 'Paid'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Date: Newest' },
  { value: 'oldest', label: 'Date: Oldest' },
  { value: 'az', label: 'Name: A to Z' },
  { value: 'za', label: 'Name: Z to A' },
]

const statusOf = r => r.status === 'clearing' ? CLEARING
  : r.source === 'public' ? (r.status === 'allocated' ? ALLOCATED : NEEDS)
  : PAID
const sourceOf = r => r.source === 'public' ? 'Public page' : 'Portal'

function readView(key, fallback) {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) || 'null')
    return v && typeof v === 'object' ? { ...fallback, ...v } : fallback
  } catch { return fallback }
}

export default function GCPurchasesTable() {
  const isPhone = useIsPhone()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [flash, setFlash] = useState('')

  const viewKey = 'gcPurchasesListView1'
  const defaultView = { search: '', filter: {}, sort: 'newest', colSort: null }
  const [initialView] = useState(() => readView(viewKey, defaultView))
  const [search, setSearch] = useState(initialView.search)
  const [listFilter, setListFilter] = useState(initialView.filter || {})
  const [listSort, setListSort] = useState(initialView.sort)
  const { sort: colSort, onSort, reset: resetColSort } = useHeaderSort(initialView.colSort)
  useEffect(() => {
    try { sessionStorage.setItem(viewKey, JSON.stringify({ search, filter: listFilter, sort: listSort, colSort })) } catch { /* private mode */ }
  }, [search, listFilter, listSort, colSort])

  async function load() {
    try {
      const res = await callApi('gc_purchases_load')
      setData(res)
      setError('')
    } catch (e) { setError(e?.message || 'Failed to load purchases') }
  }
  useEffect(() => { load() }, [])

  const rowsAll = data?.rows || []
  const filterGroups = [
    { key: 'status', label: 'Status', options: [NEEDS, CLEARING, ALLOCATED, PAID], get: statusOf },
    { key: 'source', label: 'Source', options: ['Portal', 'Public page'], get: sourceOf },
  ]
  const q = search.trim().toLowerCase()
  const searched = q
    ? rowsAll.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q) || String(r.member_number || '').includes(q) || (r.member_name || '').toLowerCase().includes(q))
    : rowsAll
  const filtered = searched.filter(r => matchesFilter(r, filterGroups, listFilter))
  const ordered = useMemo(() => {
    const list = [...filtered]
    const at = r => r.date || ''
    switch (listSort) {
      case 'oldest': return list.sort((a, b) => at(a).localeCompare(at(b)))
      case 'az': return list.sort((a, b) => (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase()))
      case 'za': return list.sort((a, b) => (b.name || '').toLowerCase().localeCompare((a.name || '').toLowerCase()))
      case 'newest':
      default: return list.sort((a, b) => at(b).localeCompare(at(a)))
    }
  }, [filtered, listSort])
  const rows = sortByColumn(ordered, colSort, {
    name: { type: 'text', get: r => r.name || '' },
    email: { type: 'text', get: r => r.email || '' },
    source: { type: 'text', get: sourceOf },
    amount: { type: 'number', get: r => Number(r.amount_paid) || 0 },
    credits: { type: 'number', get: r => (Number(r.credits) || 0) + (Number(r.bonus) || 0) },
    date: { type: 'date', get: r => r.date || '' },
    member: { type: 'text', get: statusOf },
  })
  const needCount = rowsAll.filter(r => statusOf(r) === NEEDS).length

  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }

  if (error && !data) return <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>
  if (!data) return <><SearchFilterSkeleton boxes={[84, 150]} /><TableSkeleton cols={GRID} rows={6} minWidth="1240px" pad="11px 18px" twoLine /></>

  return (
    <>
      {needCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(18,94,204,0.07)', border: '1px solid rgba(18,94,204,0.25)', color: '#125ecc', borderRadius: '12px', padding: '11px 16px', fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>
          <span style={dot('#125ecc')} />
          {needCount} public {needCount === 1 ? 'order needs' : 'orders need'} allocating to a member.
        </div>
      )}
      {flash && <div style={{ background: 'var(--vfo-accent-tint)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-accent-text)', borderRadius: '12px', padding: '12px 16px', fontSize: '13px', marginBottom: '14px' }}>{flash}</div>}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="search" name="search" autoComplete="off" placeholder={isPhone ? 'Search by name or email...' : 'Search by name, email or member number...'} value={search} onChange={e => setSearch(e.target.value)} style={{ ...sel, flex: isPhone ? '1 1 100%' : 1, minWidth: isPhone ? 0 : '240px' }} />
        <ListFilterButton groups={filterGroups} value={listFilter} onChange={setListFilter} />
        <SortSelect value={listSort} onChange={v => { setListSort(v); resetColSort() }} options={SORT_OPTIONS} />
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }}>
        <div style={{ minWidth: MIN_WIDTH }}>
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>
            <SortHeader label="Name" sortKey="name" sort={colSort} onSort={onSort} />
            <SortHeader label="Email" sortKey="email" sort={colSort} onSort={onSort} />
            <SortHeader label="Source" sortKey="source" sort={colSort} onSort={onSort} />
            <SortHeader label="Amount Paid" sortKey="amount" sort={colSort} onSort={onSort} />
            <SortHeader label="Credits" sortKey="credits" sort={colSort} onSort={onSort} />
            <SortHeader label="Date" sortKey="date" sort={colSort} onSort={onSort} />
            <SortHeader label="Member" sortKey="member" sort={colSort} onSort={onSort} />
          </div>

          {rows.length === 0 && (
            <div style={{ padding: '28px 18px', textAlign: 'center', color: 'var(--vfo-faint)', fontSize: '13px' }}>
              {rowsAll.length === 0 ? 'No Growth Credits have been purchased yet.' : 'No purchases match the current filters.'}
            </div>
          )}

          {rows.map(r => (
            <div key={r.key} style={{ display: 'grid', gridTemplateColumns: GRID, gap: '10px', padding: '11px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }}>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, color: r.source === 'public' ? 'var(--vfo-ink)' : 'var(--vfo-link)' }}>{r.name || '—'}</span>
                  {r.source === 'portal' && r.member_number && <MemberNameLink memberNumber={r.member_number} style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>#{r.member_number}</MemberNameLink>}
                </span>
                {r.phone && <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)' }}>{r.phone}</span>}
              </span>
              <span style={{ fontSize: '12.5px', color: r.email ? 'var(--vfo-ink)' : 'var(--vfo-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.email || ''}>{r.email || 'No email'}</span>
              <span style={{ fontSize: '12.5px' }}>
                {r.source === 'public'
                  ? <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(255,159,28,0.14)', color: '#b45309', border: '1px solid rgba(255,159,28,0.35)' }}>Public page</span>
                  : <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(18,94,204,0.1)', color: '#125ecc', border: '1px solid rgba(18,94,204,0.25)' }}>Portal</span>}
              </span>
              <span style={{ fontSize: '12.5px' }}>
                <span style={{ fontWeight: 600 }}>{money(r.amount_paid)}</span>
                <span style={{ display: 'block', fontSize: '11px', color: 'var(--vfo-muted)' }}>{r.payment_method === 'ach' ? 'Bank' : r.payment_method === 'card' ? 'Card' : ''}{r.card_fee > 0 ? ` (incl. ${money(r.card_fee)} fee)` : ''}</span>
              </span>
              <span style={{ fontSize: '12.5px' }}>
                <span style={{ fontWeight: 700 }}>{(Number(r.credits) || 0) + (Number(r.bonus) || 0)}</span>
                {r.bonus > 0 && <span style={{ display: 'block', fontSize: '11px', color: '#b45309', fontWeight: 600 }}>{r.credits} + {r.bonus} free</span>}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{formatDate(r.date) || '—'}</span>
              <MemberCell row={r} members={data.members || []} onDone={(msg) => { setFlash(msg); setTimeout(() => setFlash(''), 6000); load() }} />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function MemberCell({ row, members, onDone }) {
  const status = statusOf(row)
  const suggestions = row.suggestions || []
  const [picked, setPicked] = useState(() => suggestions[0] ? { member_number: suggestions[0].member_number, name: suggestions[0].name } : null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [alreadyUsed, setAlreadyUsed] = useState('')
  // Free credits the picked member has left in the sale, when fewer than the order carries.
  const [freeLeft, setFreeLeft] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  if (status === ALLOCATED) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', fontSize: '12.5px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--vfo-success-text)', fontWeight: 600 }}>
          <span style={dot('#1b9254')} />Allocated to {row.member_number ? <MemberNameLink memberNumber={row.member_number} style={{ color: 'var(--vfo-link)', fontWeight: 600 }}>{row.member_name}</MemberNameLink> : row.member_name}
        </span>
        {row.allocated_by && <span style={{ fontSize: '11px', color: 'var(--vfo-muted)', marginLeft: '14px' }}>by {row.allocated_by}{row.allocated_at ? `, ${formatDate(row.allocated_at)}` : ''}</span>}
      </span>
    )
  }
  if (status === CLEARING) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#b45309', fontWeight: 600 }}><span style={dot('#e0a106')} />Bank payment clearing{row.source === 'public' ? ' - allocate once it clears' : ''}</span>
  }
  if (status === PAID) {
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--vfo-success-text)', fontWeight: 600 }}><span style={dot('#1b9254')} />Credited</span>
  }

  const q = query.trim().toLowerCase()
  const matches = q.length >= 2
    ? members.filter(m => m.name.toLowerCase().includes(q) || m.member_number.includes(q) || (m.email || '').toLowerCase().includes(q)).slice(0, 8)
    : []

  async function allocate(capBonus = false) {
    if (!picked) return
    setBusy(true); setErr('')
    try {
      const res = await callApi('gc_allocate_order', { order_id: row.order_id, member_number: picked.member_number, cap_bonus: capBonus })
      onDone(`${res.credited} credits added to ${picked.name}. They've been emailed their invoice and receipt.`)
    } catch (e) {
      if (e?.data?.already_used) { setAlreadyUsed(e.message); setFreeLeft(Number(e.data.remaining) || 0); setConfirm(false) }
      else setErr(e?.message || 'Allocation failed')
    } finally { setBusy(false) }
  }

  const btn = (primary) => ({ padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap', border: primary ? 'none' : '1px solid var(--vfo-border-strong)', background: primary ? 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)' : 'transparent', color: primary ? '#fff' : 'var(--vfo-muted)', opacity: busy ? 0.6 : 1 })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#125ecc', fontSize: '11.5px', fontWeight: 700 }}><span style={dot('#125ecc')} />{NEEDS}</div>
      {picked && !open ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{picked.name} <span style={{ color: 'var(--vfo-muted)', fontWeight: 400 }}>#{picked.member_number}</span></span>
          <button type="button" onClick={() => { setOpen(true); setConfirm(false); setAlreadyUsed('') }} style={{ background: 'none', border: 'none', color: 'var(--vfo-link)', fontSize: '11.5px', cursor: 'pointer', padding: 0 }}>Change</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input type="search" autoComplete="off" autoFocus={open} placeholder="Search member names..." value={query} onChange={e => setQuery(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', fontSize: '12.5px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }} />
          {(matches.length > 0 || (q.length < 2 && suggestions.length > 0)) && (
            <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, marginTop: '4px', background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-mid)', borderRadius: '10px', boxShadow: '0 10px 28px rgba(0,41,115,0.18)', overflow: 'hidden' }}>
              {q.length < 2 && <div style={{ padding: '7px 10px 4px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-muted)' }}>Suggested</div>}
              {(q.length < 2 ? suggestions.map(s => ({ member_number: s.member_number, name: s.name, why: s.reasons.join(', ') })) : matches.map(m => ({ member_number: m.member_number, name: m.name, why: m.email }))).map(m => (
                <button key={m.member_number} type="button" onClick={() => { setPicked({ member_number: m.member_number, name: m.name }); setOpen(false); setQuery(''); setAlreadyUsed('') }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderTop: '1px solid var(--vfo-border-soft)', background: 'transparent', cursor: 'pointer', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 600 }}>{m.name}</span> <span style={{ fontSize: '11px', color: 'var(--vfo-muted)' }}>#{m.member_number}</span>
                  {m.why && <span style={{ display: 'block', fontSize: '11px', color: 'var(--vfo-muted)', marginTop: '1px' }}>{m.why}</span>}
                </button>
              ))}
            </div>
          )}
          {open && picked && <button type="button" onClick={() => { setOpen(false); setQuery('') }} style={{ background: 'none', border: 'none', color: 'var(--vfo-muted)', fontSize: '11.5px', cursor: 'pointer', padding: '4px 0 0' }}>Keep {picked.name}</button>}
        </div>
      )}
      {picked && !open && !alreadyUsed && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          {!confirm
            ? <button type="button" onClick={() => setConfirm(true)} style={btn(true)}>Allocate</button>
            : <>
                <span style={{ fontSize: '11.5px', color: 'var(--vfo-ink)' }}>Add {(Number(row.credits) || 0) + (Number(row.bonus) || 0)} credits to {picked.name}?</span>
                <button type="button" disabled={busy} onClick={() => allocate(false)} style={btn(true)}>{busy ? 'Allocating...' : 'Confirm'}</button>
                <button type="button" disabled={busy} onClick={() => setConfirm(false)} style={btn(false)}>Cancel</button>
              </>}
        </div>
      )}
      {alreadyUsed && (
        <div style={{ background: 'rgba(224,103,23,0.08)', border: '1px solid rgba(224,103,23,0.3)', borderRadius: '8px', padding: '8px 10px', fontSize: '11.5px', color: 'var(--vfo-ink)' }}>
          {alreadyUsed} Add the {row.credits} paid {row.credits === 1 ? 'credit' : 'credits'}{freeLeft > 0 ? ` + ${freeLeft} free` : ' only (no free credits)'}, or refund the order in Stripe.
          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
            <button type="button" disabled={busy} onClick={() => allocate(true)} style={btn(true)}>{busy ? 'Allocating...' : freeLeft > 0 ? `Add ${row.credits} + ${freeLeft} free` : `Add ${row.credits} paid only`}</button>
            <button type="button" disabled={busy} onClick={() => setAlreadyUsed('')} style={btn(false)}>Cancel</button>
          </div>
        </div>
      )}
      {err && <div style={{ fontSize: '11.5px', color: '#b91c1c' }}>{err}</div>}
    </div>
  )
}
