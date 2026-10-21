import { useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { OnboardingListSkeleton } from '../shared/Skeleton'
import { useOpenMember, specialistProfilePath } from '../shared/personLinks'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import AccountingCombinedPanel from '../admin/AccountingCombinedPanel'
import { tableStyle, headerRowStyle, totalsRowStyle, totalsLabelStyle, totalsSubStyle } from '../admin/SpecialistRevenuePanel'
import { clientPlanPath, fmtMoney, fmtDate, fmtMethod, StatusPill } from './PaymentsTable'

// Admin GLOBAL Payments page — Accounting → Payments. A flat ledger, ONE row per
// real money movement (all_payments_load, rebuilt 2026-10-22), in the house
// Accounting layout: breadcrumb + title, pills (Money in / Money out / Refunds),
// the year + month picker (current month by default), the type mini-tabs, then
// the table with its Totals row. Nothing is folded into engagements here — the
// per-person Payments tabs still do that.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const CATEGORY_ORDER = [
  'MAP 1', 'Tax Priorities', 'Tax Planning', 'Tax deposit', 'PIP Meetings', 'Specialist Revenue',
  'Membership fee', 'Onboarding fee', 'Background check', 'Monthly license', 'Portal licence',
  'Growth Credits', 'Manual payment',
]

const PTYPE_TAG = {
  Client: { fg: '#1a7f5a', bg: '#e7f5ee' },
  Member: { fg: '#7839ee', bg: '#f0e9fe' },
  Specialist: { fg: '#0e7490', bg: '#cffafe' },
  'Tax Planner': { fg: '#1570ef', bg: '#e3effd' },
  'Strategic Partner': { fg: '#b45309', bg: '#fef3c7' },
  ERT: { fg: '#475467', bg: 'var(--vfo-tint)' },
}

const GRID = '104px 1.3fr 1.5fr 130px 130px 120px 1fr'

// The row's calendar month: a date-only value is a calendar date as stored; a
// timestamp is read in the viewer's local time (as fmtDate shows it).
function monthKeyOf(d) {
  if (!d) return null
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(d))
  if (m) return `${m[1]}-${m[2]}`
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return null
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
}

export default function AllPaymentsTab() {
  return (
    <AccountingCombinedPanel
      breadcrumb="Accounting · Payments" title="Payments" maxWidth="1200px"
      tabs={[
        { key: 'payments_in', label: 'Money in', render: () => <PaymentsLedger direction="in" /> },
        { key: 'payments_out', label: 'Money out', render: () => <PaymentsLedger direction="out" /> },
        { key: 'payments_refunds', label: 'Refunds', render: () => <PaymentsLedger direction="refund" /> },
      ]}
    />
  )
}

function PaymentsLedger({ direction }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11, or -1 for All
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const navigate = useNavigate()
  const openMember = useOpenMember()

  // Re-open draws the last list at once, refreshes behind it.
  useLayoutEffect(() => {
    const snap = getLastSeen('allpayments:')
    if (snap) { setData(snap); setLoading(false) }
    load(!!snap)
  }, [])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError('') }
    try {
      const d = await callApi('all_payments_load', {})
      if (d?.error) { if (quiet === true) console.error(d.error); else setError(d.error); return }
      setData(d)
      setLastSeen('allpayments:', d)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const rows = useMemo(() => (data?.rows || []).filter(r => r.direction === direction), [data, direction])
  const years = useMemo(() => {
    const set = new Set([now.getFullYear()])
    for (const r of rows) { const k = monthKeyOf(r.date); if (k) set.add(Number(k.slice(0, 4))) }
    return Array.from(set).sort((a, b) => b - a)
  }, [rows])

  const inPeriod = useMemo(() => {
    const prefix = month === -1 ? `${year}-` : `${year}-${String(month + 1).padStart(2, '0')}`
    return rows.filter(r => (monthKeyOf(r.date) || '').startsWith(prefix))
  }, [rows, year, month])

  const catCounts = {}
  for (const r of inPeriod) catCounts[r.category || 'Other'] = (catCounts[r.category || 'Other'] || 0) + 1
  const cats = Object.keys(catCounts).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a), ib = CATEGORY_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  useEffect(() => { if (category !== 'All' && !catCounts[category]) setCategory('All') }, [year, month, data])

  const term = search.trim().toLowerCase()
  const shown = inPeriod
    .filter(r => category === 'All' || (r.category || 'Other') === category)
    .filter(r => !term || [r.person, r.memberName, r.label, r.detail, r.invoiceNumber, r.receiptNumber, r.transferId, String(r.amount ?? '')]
      .some(v => v && String(v).toLowerCase().includes(term)))
  // Money that actually moved: paid (in / out) or refunded. Processing, failed and
  // held rows are listed but not counted.
  const moved = shown.filter(r => r.status === 'paid' || r.status === 'refunded')
  const total = moved.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const fees = moved.reduce((s, r) => s + (Number(r.fee) || 0), 0)
  const periodLabel = month >= 0 ? `${MONTHS[month]} ${year}` : `${year}`
  const countedWord = direction === 'refund' ? 'refunded' : direction === 'out' ? 'paid out' : 'paid'

  function rowClick(r) {
    if (r.personType === 'Client' && r.clientId) return () => navigate(clientPlanPath(r))
    if (r.personType === 'Member' && r.memberNumber) return () => openMember(r.memberNumber)
    if (r.personType === 'Specialist' && r.expertId) return () => navigate(specialistProfilePath(r.expertId))
    return null
  }
  const sub = { display: 'block', fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '3px', fontWeight: 400 }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const miniTab = (active) => ({ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${active ? 'var(--vfo-accent-text)' : 'var(--vfo-border-strong)'}`, background: active ? 'rgba(18,94,204,0.08)' : 'var(--vfo-card)', color: active ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select style={sel} value={month} onChange={e => setMonth(Number(e.target.value))}>
          <option value={-1}>All months</option>
          {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
        </select>
        <button type="button" onClick={() => load(false)} style={{ ...sel, color: 'var(--vfo-accent-text)', fontWeight: 600 }}>Refresh</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, amount, invoice…"
          style={{ ...sel, cursor: 'text', flex: 1, minWidth: '200px', maxWidth: '340px' }} />
      </div>

      {cats.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
          <button type="button" style={miniTab(category === 'All')} onClick={() => setCategory('All')}>All</button>
          {cats.map(c => (
            <button key={c} type="button" style={miniTab(category === c)} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      )}

      {loading && <OnboardingListSkeleton rows={3} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}

      {!loading && !error && (
        <div style={{ ...tableStyle, overflowX: 'auto' }}>
          <div style={{ ...headerRowStyle, gridTemplateColumns: GRID }}>
            <span>Date</span><span>{direction === 'out' ? 'Paid to' : 'Who'}</span><span>What</span>
            <span style={{ textAlign: 'right' }}>Amount</span><span>Status</span><span>Method</span><span>Reference</span>
          </div>
          <div style={{ ...totalsRowStyle, gridTemplateColumns: GRID }}>
            <span style={{ ...totalsLabelStyle, gridColumn: 'span 3' }}>
              Totals<span style={totalsSubStyle}>{periodLabel} · {shown.length} row{shown.length === 1 ? '' : 's'} · {countedWord} only</span>
            </span>
            <span style={{ textAlign: 'right' }}>
              {fmtMoney(total)}
              {fees > 0 && <span style={{ ...sub, fontWeight: 600 }}>incl. {fmtMoney(fees)} card fees</span>}
            </span>
            <span /><span /><span />
          </div>
          {shown.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>
              Nothing {direction === 'in' ? 'came in' : direction === 'out' ? 'went out' : 'was refunded'} in {periodLabel}{category !== 'All' ? ` for ${category}` : ''}{term ? ' matching the search' : ''}.
            </div>
          )}
          {shown.map(r => {
            const onRow = rowClick(r)
            const tag = PTYPE_TAG[r.personType]
            return (
              <div key={r.key} onClick={onRow || undefined} {...(onRow ? rowHoverProps : {})}
                style={{ ...(onRow ? clickableRowStyle : null), display: 'grid', gridTemplateColumns: GRID, gap: '8px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'start', fontSize: '13px', color: 'var(--vfo-ink)' }}>
                <span style={{ color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</span>
                <span>
                  <span style={{ fontWeight: 600, color: onRow ? 'var(--vfo-accent-text)' : 'var(--vfo-ink)' }}>{r.person}</span>
                  {tag && (
                    <span style={{ display: 'table', marginTop: '3px', padding: '1px 7px', borderRadius: '5px', background: tag.bg, color: tag.fg, fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em' }}>{r.personType}</span>
                  )}
                </span>
                <span>
                  {r.label}
                  {r.detail && <span style={sub}>{r.detail}</span>}
                  {r.onBehalfByMember && <span style={{ ...sub, color: '#b45309' }}>Paid by {r.onBehalfByMember}</span>}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {fmtMoney(r.amount)}
                  {Number(r.fee) > 0 && <span style={sub}>incl. {fmtMoney(Number(r.fee))} card fee</span>}
                </span>
                <span><StatusPill status={r.status} /></span>
                <span style={{ color: 'var(--vfo-muted)', whiteSpace: 'nowrap' }}>{fmtMethod(r.method, r.last4)}</span>
                <span style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', wordBreak: 'break-all' }}>
                  {[r.invoiceNumber, r.receiptNumber].filter(Boolean).join(' · ')}
                  {r.transferId && <span style={{ display: 'block' }}>{r.transferId}</span>}
                  {!r.invoiceNumber && !r.receiptNumber && !r.transferId && '—'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
