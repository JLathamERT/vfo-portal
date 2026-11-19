import { useState, useLayoutEffect, useMemo, useEffect } from 'react'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { money } from './specialistRevenueShared'
import { AccountingTableSkeleton } from '../shared/Skeleton'
import { useNavigate } from 'react-router-dom'
import { MemberNameLink, ClientNameLink, clientPagePath } from '../shared/personLinks'
import { useIsPhone } from '../../lib/useMediaQuery'

// Accounting > ... > "Held Payouts" (one per engine: Holistic, Tax Planning,
// Additional PIP, VFO Specialist Revenue, and the SDP ATSG tab). Every revenue
// share the payout engines could not pay, for whatever reason (held_payouts_load,
// table payout_holds): no payout account, the member suspended / paused / in
// arrears, the Stripe balance too low, a Stripe error, no planner allocated. The
// nightly sweeps retry each one; Retry now runs that one leg straight away.

export const HOLD_REASONS = {
  no_payout_account: { label: 'No payout account', fg: '#b45309', bg: '#fef3c7' },
  member_suspended: { label: 'Member suspended', fg: '#b45309', bg: '#fef3c7' },
  member_paused: { label: 'Member paused', fg: '#b45309', bg: '#fef3c7' },
  member_arrears: { label: 'Member in arrears', fg: '#b45309', bg: '#fef3c7' },
  balance_low: { label: 'Stripe balance too low', fg: '#b42318', bg: '#fdecea' },
  stripe_error: { label: 'Stripe error', fg: '#b42318', bg: '#fdecea' },
  awaiting_planner: { label: 'No planner allocated', fg: '#b45309', bg: '#fef3c7' },
  not_configured: { label: 'Not set up', fg: '#b42318', bg: '#fdecea' },
}

const LEG_LABEL = {
  member: 'Member', strategic: 'Strategic partner', planner: 'Planner group',
  deposit_team: 'Deposit team share', specialist: 'Specialist', ert: 'ERT', sdp: 'SDP',
}

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}

const hoverRowProps = {
  onMouseEnter: e => { e.currentTarget.style.background = 'var(--vfo-tint)' },
  onMouseLeave: e => { e.currentTarget.style.background = 'var(--vfo-card)' },
}

const ghostBtn = {
  padding: '5px 12px', borderRadius: '99px', border: '1px solid var(--vfo-border-soft)',
  background: 'transparent', color: 'var(--vfo-accent-text)', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
}
const busyBtn = {
  padding: '5px 12px', borderRadius: '99px', border: 'none', background: '#c7d2e4',
  color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'not-allowed', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
}

function ReasonChip({ reason }) {
  const t = HOLD_REASONS[reason] || { label: reason || 'Held', fg: '#b45309', bg: '#fef3c7' }
  return <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '20px', background: t.bg, color: t.fg, fontSize: '11.5px', fontWeight: 700, whiteSpace: 'nowrap' }}>{t.label}</span>
}

// The line under the reason: what Stripe said, or the payout-setup email ladder
// for a member with no payout account, then when it was last tried.
function reasonNote(r) {
  const parts = []
  const memberSetup = r.leg === 'member' && r.reason === 'no_payout_account'
  if (r.stripe_message && !memberSetup) parts.push(r.stripe_message)
  if (memberSetup) {
    if (!r.asked_at) parts.push('Member not emailed')
    else {
      parts.push(r.asked_by_hand ? `Setup link sent by hand ${fmtDate(r.asked_at)}` : `Member emailed ${fmtDate(r.asked_at)}`)
      if (r.reminded_at) parts.push(`reminded ${fmtDate(r.reminded_at)}`)
      if (r.tracy_notified_at) parts.push('Tracy asked to chase')
    }
  }
  if (r.last_attempt_at) parts.push(`last tried ${fmtDate(r.last_attempt_at)}${r.attempts > 1 ? ` (${r.attempts} tries)` : ''}`)
  return parts.join(' · ')
}

function PayeeCell({ r }) {
  return (
    <span>
      {r.leg === 'member' && r.member_number
        ? <><MemberNameLink memberNumber={r.member_number} style={{ fontWeight: 600 }}>{r.payee_name || r.member_number}</MemberNameLink><span style={{ color: 'var(--vfo-muted)' }}> · {r.member_number}</span></>
        : <span style={{ fontWeight: 600 }}>{r.payee_name || '—'}</span>}
      <div style={{ fontSize: '11px', color: 'var(--vfo-faint)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{LEG_LABEL[r.leg] || r.leg}</div>
    </span>
  )
}

function SourceCell({ r, engine }) {
  const program = engine === 'map1' || engine === 'pip' ? 1 : engine === 'tax' ? (r.program_id || undefined) : undefined
  return (
    <span>
      {r.client_id && r.client_name
        ? <>{r.source_label.split(' - ')[0]} - <ClientNameLink clientId={r.client_id} program={program}>{r.client_name}</ClientNameLink></>
        : r.source_label}
      {r.detail && <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '2px' }}>{r.detail}</div>}
      {r.sandbox && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: 'rgba(224,103,23,0.14)', color: '#e06717' }}>Sandbox</span>}
    </span>
  )
}

// One click, no confirm (like Resend email in Outstanding Payment Links): the
// engine re-checks everything before money moves and a paid leg is a no-op.
function RetryButton({ r, result, onResult }) {
  const [busy, setBusy] = useState(false)
  async function fire(e) {
    e.stopPropagation()
    setBusy(true)
    try {
      const res = await callApi('held_payout_retry', { id: r.id })
      if (res?.error) onResult(r.id, { error: res.error })
      else onResult(r.id, res)
    } catch (ex) {
      onResult(r.id, { error: ex?.message || 'Could not retry the payout.' })
    } finally {
      setBusy(false)
    }
  }
  const paid = result?.outcome === 'released'
  return (
    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
      {paid
        ? <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--vfo-success-text-2)', whiteSpace: 'nowrap' }}>{result.release_reason === 'paid' ? 'Paid' : 'No longer held'}</span>
        : busy
        ? <button type="button" disabled style={busyBtn}>Retrying…</button>
        : <button type="button" style={ghostBtn} onClick={fire}>Retry now</button>}
      {result?.outcome === 'held' && !busy && (
        <span style={{ fontSize: '11px', color: '#b45309', textAlign: 'right', maxWidth: '200px', lineHeight: 1.4 }}>
          Still held: {(HOLD_REASONS[result.reason]?.label || result.reason || '').toLowerCase()}
        </span>
      )}
      {result?.error && !busy && (
        <span style={{ fontSize: '11px', color: '#b91c1c', textAlign: 'right', maxWidth: '200px', lineHeight: 1.4 }}>{result.error}</span>
      )}
    </div>
  )
}

// The red count on each "Held Payouts" sub-tab pill (2026-11-19, Jake), so a held
// share is visible without opening the tab. It reads the same answer the list
// does (held_payouts_load, same last-seen snapshot) and the list tells it about
// every reload and every Retry that pays (the 'vfo-held-count' event).
const HELD_COUNT_EVENT = 'vfo-held-count'
const heldSnapKey = engine => `heldpayouts2:${engine}:`

function announceHeldCount(engine, count) {
  try { window.dispatchEvent(new CustomEvent(HELD_COUNT_EVENT, { detail: { engine, count } })) } catch { /* no window */ }
}

export function HeldCountBadge({ engine }) {
  const [count, setCount] = useState(() => {
    const snap = getLastSeen(heldSnapKey(engine))
    return snap ? (snap.open || []).length : 0
  })
  useEffect(() => {
    let alive = true
    const onCount = e => { if (e.detail?.engine === engine) setCount(Number(e.detail.count) || 0) }
    window.addEventListener(HELD_COUNT_EVENT, onCount)
    callApi('held_payouts_load', { engine })
      .then(res => {
        if (!alive || res?.error) return
        setLastSeen(heldSnapKey(engine), res)
        setCount((res.open || []).length)
      })
      .catch(() => { /* the badge is a hint; the list shows any error */ })
    return () => { alive = false; window.removeEventListener(HELD_COUNT_EVENT, onCount) }
  }, [engine])
  if (!count) return null
  return (
    <span title={`${count} held`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '18px', height: '18px', padding: '0 5px', marginLeft: '7px', borderRadius: '999px', background: '#ef4444', color: '#fff', fontSize: '10.5px', fontWeight: 800, lineHeight: 1, verticalAlign: 'middle', boxSizing: 'border-box' }}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

// A sub-tab label with the count beside it: { label: <HeldPayoutsLabel engine="tax" /> }.
export function HeldPayoutsLabel({ engine }) {
  return <>Held Payouts<HeldCountBadge engine={engine} /></>
}

export default function HeldPayoutsPanel({ engine, embedded = false }) {
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  // A row opens the client's plan / track the held money came from (Client
  // Overview's rule; the client's NAME opens their profile). SpecRev and SDP
  // ATSG rows have no portal client.
  const TAB_BY_ENGINE = { map1: 'map1', tax: 'tax', pip: 'pip' }
  const rowProps = (r) => (r.client_id && TAB_BY_ENGINE[engine]
    ? { onClick: () => navigate(clientPagePath(r.client_id, { program: engine === 'tax' ? r.program_id || undefined : 1, tab: TAB_BY_ENGINE[engine] })), title: 'Open plan', ...hoverRowProps }
    : {})
  const snapKey = heldSnapKey(engine)
  const [data, setData] = useState({ open: [], released: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showReleased, setShowReleased] = useState(false)
  const [reasonFilter, setReasonFilter] = useState('')
  const [results, setResults] = useState({})

  useLayoutEffect(() => {
    const snap = getLastSeen(snapKey)
    if (snap) { setData({ open: snap.open || [], released: snap.released || [] }); setLoading(false) }
    load(!!snap)
  }, [engine])

  async function load(quiet = false) {
    if (quiet !== true) { setLoading(true); setError(''); setResults({}) }
    try {
      const res = await callApi('held_payouts_load', { engine })
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      setData({ open: res.open || [], released: res.released || [] })
      setLastSeen(snapKey, res)
      announceHeldCount(engine, (res.open || []).length)
    } catch (e) {
      if (quiet === true) console.error(e)
      else setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  // A paid row stays on screen marked Paid until the next Refresh, so the click
  // has a visible answer; a still-held row refreshes behind the scenes.
  function onResult(id, res) {
    setResults(prev => ({ ...prev, [id]: res }))
    if (res?.outcome === 'released') {
      const paid = new Set([id, ...Object.keys(results).filter(k => results[k]?.outcome === 'released').map(Number)])
      announceHeldCount(engine, data.open.filter(r => !paid.has(r.id)).length)
    }
    if (res?.outcome === 'held') load(true)
  }

  const reasonsPresent = useMemo(() => [...new Set(data.open.map(r => r.reason))], [data.open])
  const shown = reasonFilter ? data.open.filter(r => r.reason === reasonFilter) : data.open
  const openTotal = shown
    .filter(r => results[r.id]?.outcome !== 'released')
    .reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const wrap = embedded ? { fontFamily: 'Inter, sans-serif' } : { padding: '24px', maxWidth: '1150px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }
  const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
  const grid = '92px 1fr 1.2fr 1.5fr 110px 120px'
  const head = { display: 'grid', gridTemplateColumns: grid, gap: '16px', padding: '12px 18px', background: 'var(--vfo-input)', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }
  const row = { display: 'grid', gridTemplateColumns: grid, gap: '16px', padding: '12px 18px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'center', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)' }
  const phoneRow = { padding: '14px 16px', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '13px', color: 'var(--vfo-ink)', background: 'var(--vfo-card)', display: 'flex', flexDirection: 'column', gap: '6px' }
  const card = { border: '1px solid var(--vfo-border-soft)', borderRadius: '14px', overflow: 'hidden', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)' }

  const openRow = (r) => {
    const paid = results[r.id]?.outcome === 'released'
    const note = reasonNote(r)
    const amount = <span style={{ fontWeight: 700, textAlign: 'right', textDecoration: paid ? 'line-through' : 'none', color: paid ? 'var(--vfo-faint)' : undefined }}>{r.amount == null ? '—' : money(r.amount)}</span>
    const reason = <span><ReasonChip reason={r.reason} />{note && <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '4px', lineHeight: 1.4 }}>{note}</div>}</span>
    const retry = <RetryButton r={r} result={results[r.id]} onResult={onResult} />
    const clickable = r.client_id && TAB_BY_ENGINE[engine]
    if (isPhone) {
      return (
        <div key={r.id} style={{ ...phoneRow, cursor: clickable ? 'pointer' : undefined }} {...rowProps(r)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><PayeeCell r={r} />{amount}</div>
          <SourceCell r={r} engine={engine} />
          {reason}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Held since {fmtDate(r.held_at)}</span>{retry}
          </div>
        </div>
      )
    }
    return (
      <div key={r.id} style={{ ...row, cursor: clickable ? 'pointer' : undefined }} {...rowProps(r)}>
        <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(r.held_at)}</span>
        <PayeeCell r={r} />
        <SourceCell r={r} engine={engine} />
        {reason}
        {amount}
        <span style={{ display: 'flex', justifyContent: 'flex-end' }}>{retry}</span>
      </div>
    )
  }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={reasonFilter} onChange={e => setReasonFilter(e.target.value)}>
          <option value="">All reasons</option>
          {Object.entries(HOLD_REASONS).filter(([k]) => reasonsPresent.includes(k) || k === reasonFilter).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => load()} style={{ ...sel, color: 'var(--vfo-accent-text)', fontWeight: 600 }}>Refresh</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--vfo-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showReleased} onChange={e => setShowReleased(e.target.checked)} style={{ accentColor: 'var(--vfo-primary)' }} />
          Show released (last 180 days)
        </label>
      </div>

      {loading && <AccountingTableSkeleton cols={6} />}
      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px' }}>{error}</div>}
      {!loading && !error && (
        <div style={card}>
          {!isPhone && (
            <div style={head}>
              <span>Held Since</span><span>Payee</span><span>From</span><span>Reason</span><span style={{ textAlign: 'right' }}>Amount</span><span />
            </div>
          )}
          <div style={isPhone
            ? { ...phoneRow, flexDirection: 'row', justifyContent: 'space-between', borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', fontWeight: 800, color: 'var(--vfo-heading)' }
            : { ...row, borderBottom: '2px solid var(--vfo-border)', background: 'var(--vfo-input)', fontWeight: 800, color: 'var(--vfo-heading)' }}>
            {!isPhone && <span />}
            <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--vfo-muted)' }}>Total Held</span>
            {!isPhone && <><span /><span /></>}
            <span style={{ textAlign: 'right' }}>{money(openTotal)}</span>
            {!isPhone && <span />}
          </div>
          {shown.map(openRow)}
          {shown.length === 0 && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }}>{reasonFilter ? 'No held payouts for this reason.' : 'No revenue shares are being held.'}</div>}
        </div>
      )}

      {!loading && !error && showReleased && (
        <div style={{ ...card, marginTop: '18px' }}>
          {!isPhone && (
            <div style={head}>
              <span>Released</span><span>Payee</span><span>From</span><span>Was held for</span><span style={{ textAlign: 'right' }}>Amount</span><span>Outcome</span>
            </div>
          )}
          {data.released.map(r => isPhone ? (
            <div key={r.id} style={phoneRow} {...rowProps(r)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}><PayeeCell r={r} /><span style={{ fontWeight: 700 }}>{r.amount == null ? '—' : money(r.amount)}</span></div>
              <SourceCell r={r} engine={engine} />
              <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>{r.release_reason === 'paid' ? 'Paid' : (r.release_reason || '—')} {fmtDate(r.released_at)} · held {fmtDate(r.held_at)}</span>
            </div>
          ) : (
            <div key={r.id} style={{ ...row, cursor: r.client_id && TAB_BY_ENGINE[engine] ? 'pointer' : undefined }} {...rowProps(r)}>
              <span style={{ color: 'var(--vfo-muted)' }}>{fmtDate(r.released_at)}</span>
              <PayeeCell r={r} />
              <SourceCell r={r} engine={engine} />
              <span><ReasonChip reason={r.reason} /></span>
              <span style={{ textAlign: 'right', fontWeight: 700 }}>{r.amount == null ? '—' : money(r.amount)}</span>
              <span style={{ fontSize: '12px', color: r.release_reason === 'paid' ? 'var(--vfo-success-text)' : 'var(--vfo-muted)' }}>{r.release_reason === 'paid' ? 'Paid' : (r.release_reason || '—')} · held {fmtDate(r.held_at)}</span>
            </div>
          ))}
          {data.released.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--vfo-faint)', fontSize: '14px' }}>Nothing released in the last 180 days.</div>}
        </div>
      )}

      <p style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', marginTop: '12px' }}>Every revenue share that could not be paid, and why: no payout account, the member suspended, paused or in arrears, the Stripe balance too low, a Stripe error, or no planner allocated. The nightly sweep retries each one and pays it as soon as it can; Retry now runs it straight away. A member with no payout account is emailed their setup link automatically, reminded after 2 business days, and Tracy is asked to follow up after 4.</p>
    </div>
  )
}
