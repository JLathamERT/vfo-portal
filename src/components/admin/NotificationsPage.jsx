import { useState, useLayoutEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi, getLastSeen, setLastSeen } from '../../lib/api'
import { TableSkeleton } from '../shared/Skeleton'
import { clickableRowStyle, rowHoverProps } from '../shared/rowHover'
import { btnDanger, btnOutline, btnPrimary, btnSecondary, btnState } from '../shared/buttonStyles'
import { splitTestBell, TEST_BELL_TEAL, TEST_BELL_TINT } from '../shared/testBell'
import ClearActionButton from '../shared/ClearActionButton'
import Tag from '../shared/Tag'
import { pipelineLabel } from '../shared/notificationPipeline'
import AccountingCombinedPanel from './AccountingCombinedPanel'
import { tableStyle, headerRowStyle } from './SpecialistRevenuePanel'

// Admin Notifications page (bell "View all"), in the house Accounting layout:
// breadcrumb + title, pills (Current / Archive / Reminders), the filter row, the
// mini-tabs, then the table (2026-11-25).
//  - Current / Archive: the full paginated feed, unread or already cleared, with
//    multi-select bulk clear (dismissible rows only — an action-required row
//    clears when its task completes, or one at a time with Clear and a confirm,
//    same rule as the bell).
//  - Reminders: self-scheduled personal reminders delivered to the bell by the
//    5-minute reminder sweep.
// Available to every admin (not tab-granted), like the bell itself.

const PAGE_SIZE = 50

const COMMON_ZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'UTC',
]

const KINDS = [
  { key: 'all', label: 'All' },
  { key: 'action', label: 'Action required' },
  { key: 'fyi', label: 'FYI' },
  { key: 'reminder', label: 'Reminders' },
]

const ACTION_ORANGE = '#e06717'
const REMINDER_VIOLET = '#7c3aed'
// SDP ATSG bells (2026-11-17) get a colour no other bell uses (Jake asked for
// purple, which REMINDER already has).
const SDP_BELL = '#c026d3'
const SDP_BELL_TINT = 'rgba(192,38,211,0.06)'

const PIPELINE_BLUE = '#0a85e8'

const CURRENT_GRID = '26px minmax(0, 1fr) 170px 170px 180px'
const ARCHIVE_GRID = 'minmax(0, 1fr) 150px 170px'
const UPCOMING_GRID = 'minmax(0, 1fr) 230px 190px 110px'
const FIRED_GRID = 'minmax(0, 1fr) 190px'

const sel = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-card)', fontSize: '13px', fontFamily: 'Inter, sans-serif', color: 'var(--vfo-ink)', cursor: 'pointer' }
const ghost = { ...sel, color: 'var(--vfo-accent-text)', fontWeight: 600 }
const miniTab = (active) => ({ padding: '7px 14px', borderRadius: '8px', border: `1px solid ${active ? 'var(--vfo-accent-text)' : 'var(--vfo-border-strong)'}`, background: active ? 'rgba(18,94,204,0.08)' : 'var(--vfo-card)', color: active ? 'var(--vfo-accent-text)' : 'var(--vfo-muted)', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer', fontFamily: 'Inter, sans-serif' })
const bigPrimary = { ...btnPrimary, padding: '10px 18px', fontSize: '13px' }
const bigSecondary = { ...btnSecondary, padding: '10px 18px', fontSize: '13px' }
const errorBox = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '14px' }
const emptyRow = { textAlign: 'center', padding: '40px', color: 'var(--vfo-faint)', fontSize: '14px' }
const bodyRow = { display: 'grid', gap: '12px', padding: '13px 18px 13px 15px', borderBottom: '1px solid var(--vfo-border-soft)', alignItems: 'start', fontSize: '13px', color: 'var(--vfo-ink)' }
const input = { padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }

function fmtDateTime(s) {
  if (!s) return ''
  try { return new Date(s).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return String(s) }
}

export default function NotificationsPage() {
  return (
    <AccountingCombinedPanel
      breadcrumb="Admin" title="Notifications" maxWidth="1200px"
      tabs={[
        { key: 'notifications_current', label: 'Current', render: () => <NotificationsView key="current" scope="current" /> },
        { key: 'notifications_archive', label: 'Archive', render: () => <NotificationsView key="archive" scope="archive" /> },
        { key: 'notifications_reminders', label: 'Reminders', render: () => <RemindersView /> },
      ]}
    />
  )
}

function NotificationsView({ scope }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = scope === 'current'

  // A page/filter seen before this session draws at once, refreshes behind it.
  useLayoutEffect(() => {
    const snap = getLastSeen(`adminnotifs:${scope}:${kind}:${sort}:${page}`)
    if (snap) { setError(''); setSelected(new Set()); apply(snap) }
    load(!!snap)
  }, [scope, kind, sort, page])

  function apply(res) {
    setRows(res.notifications || [])
    setTotal(res.total || 0)
  }

  async function load(quiet = false) {
    if (quiet !== true) { setRows(null); setError(''); setSelected(new Set()) }
    const key = `adminnotifs:${scope}:${kind}:${sort}:${page}`
    try {
      const res = await callApi('load_notifications_page', { offset: page * PAGE_SIZE, limit: PAGE_SIZE, scope, kind, sort })
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      apply(res)
      setLastSeen(key, res)
    } catch (e) { if (quiet === true) console.error(e); else setError(e?.message || 'Failed to load') }
  }

  function pickKind(k) { setKind(k); setPage(0) }

  const selectable = current ? (rows || []).filter(n => n.dismissible !== false && !n.read) : []
  const allSelected = selectable.length > 0 && selectable.every(n => selected.has(n.id))

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectable.map(n => n.id)))
  }
  function toggleOne(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // One call, then the bell and the list refresh. An action row's clear carries its confirm.
  async function run(action, payload) {
    setBusy(true)
    try {
      const res = await callApi(action, payload)
      if (res?.error) { setError(res.error); return }
      window.dispatchEvent(new Event('vfo:notifications-changed'))
      await load()
    } catch (e) { setError(e?.message || 'Failed to clear') }
    finally { setBusy(false) }
  }
  const clearSelected = () => selected.size && run('mark_notifications_read', { notification_ids: [...selected] })
  const clearOne = n => run('mark_notification_read', { notification_id: n.id, ...(n.dismissible === false ? { confirm_action: true } : {}) })

  async function openRow(n) {
    if (n.link) {
      const sep = n.link.includes('?') ? '&' : '?'
      navigate(`${n.link}${sep}_n=${Date.now()}&_from=bell`)
    }
    if (n.dismissible !== false && !n.read) {
      try {
        await callApi('mark_notification_read', { notification_id: n.id })
        window.dispatchEvent(new Event('vfo:notifications-changed'))
      } catch { /* best-effort */ }
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(total, (page + 1) * PAGE_SIZE)
  const grid = current ? CURRENT_GRID : ARCHIVE_GRID
  const canClear = selected.size > 0 && !busy

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <select style={sel} value={sort} onChange={e => { setSort(e.target.value); setPage(0) }}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
        <button type="button" style={ghost} onClick={() => load()}>Refresh</button>
        <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>
          {current ? 'Notifications waiting on you.' : 'Already cleared or completed. Kept for 90 days, then removed.'}
        </span>
        {current && (
          <button type="button" onClick={clearSelected} disabled={!canClear} style={{ ...btnState(bigPrimary, !canClear), marginLeft: 'auto' }}>
            Clear selected{selected.size ? ` (${selected.size})` : ''}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {KINDS.map(f => <button key={f.key} type="button" style={miniTab(kind === f.key)} onClick={() => pickKind(f.key)}>{f.label}</button>)}
      </div>

      {error && <div style={errorBox}>{error}</div>}
      {rows === null && !error && <TableSkeleton cols={grid} rows={6} twoLine />}

      {rows !== null && (
        <>
          <div style={tableStyle}>
            <div style={{ ...headerRowStyle, gap: '12px', gridTemplateColumns: grid, alignItems: 'center' }}>
              {current && (
                <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectable.length}
                  title="Select every notification on this page that can be cleared in one go"
                  style={{ width: '16px', height: '16px', margin: 0, cursor: selectable.length ? 'pointer' : 'default' }} />
              )}
              <span>Notification</span><span>Type</span><span>Received</span>
              {current && <span style={{ textAlign: 'right' }}>Action</span>}
            </div>

            {rows.length === 0 && (
              <div style={emptyRow}>{current ? 'Nothing is waiting on you.' : 'Nothing here.'}</div>
            )}

            {rows.map(n => {
              const isAction = n.dismissible === false
              const isReminder = n.pipeline === 'REMINDER'
              const isSdp = n.pipeline === 'SDP_ATSG'
              const testBell = splitTestBell(n.message)
              const message = testBell ? testBell.rest : n.message
              const bar = testBell ? TEST_BELL_TEAL : isAction ? ACTION_ORANGE : isReminder ? REMINDER_VIOLET : isSdp ? SDP_BELL : 'transparent'
              const tint = n.read ? 'var(--vfo-card)' : testBell ? TEST_BELL_TINT : isAction ? 'rgba(224,103,23,0.06)' : isReminder ? 'rgba(124,58,237,0.05)' : isSdp ? SDP_BELL_TINT : 'var(--vfo-card)'
              return (
                <div key={n.id} onClick={n.link ? () => openRow(n) : undefined} {...(n.link ? rowHoverProps : {})}
                  style={{ ...(n.link ? clickableRowStyle : null), ...bodyRow, gridTemplateColumns: grid, borderLeft: `3px solid ${bar}`, background: tint }}>
                  {current && (
                    isAction ? <span /> : (
                      <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleOne(n.id)} onClick={e => e.stopPropagation()}
                        style={{ width: '16px', height: '16px', margin: '1px 0 0', cursor: 'pointer' }} />
                    )
                  )}
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <span style={{ display: 'block', fontWeight: 600 }}>{n.title}</span>
                    {testBell && <span style={{ display: 'block', fontSize: '12px', color: TEST_BELL_TEAL, fontWeight: 600, marginTop: '3px', lineHeight: 1.45 }}>Meant for: {testBell.meantFor}</span>}
                    {message && <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{message}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {testBell && <Tag color={TEST_BELL_TEAL}>Test</Tag>}
                    {isAction && <Tag color={ACTION_ORANGE}>Action</Tag>}
                    {pipelineLabel(n.pipeline) && <Tag color={isReminder ? REMINDER_VIOLET : isSdp ? SDP_BELL : PIPELINE_BLUE}>{pipelineLabel(n.pipeline)}</Tag>}
                  </span>
                  <span style={{ color: 'var(--vfo-muted)', fontSize: '12.5px', whiteSpace: 'nowrap' }}>{fmtDateTime(n.created_at)}</span>
                  {current && (
                    <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      {isAction
                        ? <ClearActionButton onClear={() => clearOne(n)} disabled={busy} />
                        : <button type="button" style={btnState(btnOutline, busy)} disabled={busy} onClick={e => { e.stopPropagation(); clearOne(n) }}>Done</button>}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', paddingTop: '14px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)' }}>Showing {from}–{to} of {total}</span>
            {pageCount > 1 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" style={btnState(ghost, page === 0)} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
                <span style={{ fontSize: '12.5px', color: 'var(--vfo-muted)' }}>Page {page + 1} of {pageCount}</span>
                <button type="button" style={btnState(ghost, page >= pageCount - 1)} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function RemindersView() {
  const browserZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'America/New_York' } })()
  const zones = COMMON_ZONES.includes(browserZone) ? COMMON_ZONES : [browserZone, ...COMMON_ZONES]

  const [upcoming, setUpcoming] = useState(null)
  const [fired, setFired] = useState([])
  const [view, setView] = useState('upcoming')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ message: '', fire_date: '', fire_time: '', timezone: browserZone })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  // Re-open draws the last reminder lists at once, refreshes behind them.
  useLayoutEffect(() => {
    const snap = getLastSeen('adminreminders:')
    if (snap) apply(snap)
    load(!!snap)
  }, [])

  function apply(res) {
    setUpcoming(res.upcoming || [])
    setFired(res.fired || [])
  }

  async function load(quiet = false) {
    try {
      const res = await callApi('reminder_load')
      if (res?.error) { if (quiet === true) console.error(res.error); else setError(res.error); return }
      apply(res)
      setLastSeen('adminreminders:', res)
    } catch (e) { if (quiet === true) console.error(e); else setError(e?.message || 'Failed to load') }
  }

  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 4000) }

  async function create() {
    if (!form.message.trim() || !form.fire_date || !form.fire_time) { flash('Fill in the reminder text, date, and time.'); return }
    setBusy(true); setError('')
    try {
      const res = await callApi('reminder_create', form)
      if (res?.error) { setError(res.error); return }
      setForm(f => ({ ...f, message: '', fire_date: '', fire_time: '' }))
      setView('upcoming')
      flash('Reminder scheduled.')
      await load()
    } catch (e) { setError(e?.message || 'Failed to create') }
    finally { setBusy(false) }
  }

  async function cancel(id) {
    setBusy(true)
    try {
      await callApi('reminder_delete', { reminder_id: id })
      await load()
    } catch (e) { setError(e?.message || 'Failed to cancel') }
    finally { setBusy(false) }
  }

  const zoneLabel = (z) => z.replace('America/', '').replace('Pacific/', '').replace(/_/g, ' ')

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap' }}>
        <button type="button" style={ghost} onClick={() => load()}>Refresh</button>
        <span style={{ fontSize: '12.5px', color: 'var(--vfo-faint)' }}>A note to yourself. It arrives in your notification bell within about 5 minutes of the chosen time.</span>
        <button type="button" onClick={() => setShowForm(s => !s)} style={{ ...(showForm ? bigSecondary : bigPrimary), marginLeft: 'auto' }}>
          {showForm ? 'Close form' : '+ New Reminder'}
        </button>
      </div>

      {showForm && (
        <div style={{ border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', background: 'var(--vfo-card)', boxShadow: 'var(--vfo-shadow-card)', padding: '20px', marginBottom: '22px' }}>
          <textarea value={form.message} maxLength={500} placeholder="What should the reminder say?"
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            style={{ ...input, width: '100%', minHeight: '64px', resize: 'vertical', marginBottom: '12px' }} />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="date" value={form.fire_date} onChange={e => setForm(f => ({ ...f, fire_date: e.target.value }))} style={input} />
            <input type="time" value={form.fire_time} onChange={e => setForm(f => ({ ...f, fire_time: e.target.value }))} style={input} />
            <select value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} style={{ ...input, minWidth: '180px' }}>
              {zones.map(z => <option key={z} value={z}>{zoneLabel(z)}{z === browserZone ? ' (your zone)' : ''}</option>)}
            </select>
            <button type="button" onClick={create} disabled={busy} style={btnState(bigPrimary, busy)}>Schedule reminder</button>
          </div>
        </div>
      )}

      {status && <div style={{ marginBottom: '14px', background: 'var(--vfo-accent-tint)', border: '1px solid var(--vfo-border-mid)', color: 'var(--vfo-accent-text)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{status}</div>}
      {error && <div style={errorBox}>{error}</div>}

      <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button type="button" style={miniTab(view === 'upcoming')} onClick={() => setView('upcoming')}>Upcoming</button>
        <button type="button" style={miniTab(view === 'fired')} onClick={() => setView('fired')}>Recently fired</button>
      </div>

      {upcoming === null && !error && <TableSkeleton cols={view === 'upcoming' ? UPCOMING_GRID : FIRED_GRID} rows={3} />}

      {upcoming !== null && view === 'upcoming' && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gap: '12px', gridTemplateColumns: UPCOMING_GRID }}>
            <span>Reminder</span><span>Set for</span><span>Your local time</span><span style={{ textAlign: 'right' }}>Action</span>
          </div>
          {upcoming.length === 0 && <div style={emptyRow}>No upcoming reminders.</div>}
          {upcoming.map(r => (
            <div key={r.id} style={{ ...bodyRow, gridTemplateColumns: UPCOMING_GRID, alignItems: 'center', borderLeft: `3px solid ${REMINDER_VIOLET}` }}>
              <span style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{r.message}</span>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '12.5px' }}>{r.fire_date} at {r.fire_time} ({zoneLabel(r.timezone)})</span>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '12.5px' }}>{fmtDateTime(r.fire_at)}</span>
              <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => cancel(r.id)} disabled={busy} style={btnState({ ...btnDanger, background: 'var(--vfo-card)' }, busy)}>Cancel</button>
              </span>
            </div>
          ))}
        </div>
      )}

      {upcoming !== null && view === 'fired' && (
        <div style={tableStyle}>
          <div style={{ ...headerRowStyle, gap: '12px', gridTemplateColumns: FIRED_GRID }}>
            <span>Reminder</span><span>Fired</span>
          </div>
          {fired.length === 0 && <div style={emptyRow}>No reminders have fired recently.</div>}
          {fired.map(r => (
            <div key={r.id} style={{ ...bodyRow, gridTemplateColumns: FIRED_GRID, borderLeft: '3px solid transparent' }}>
              <span style={{ overflowWrap: 'anywhere' }}>{r.message}</span>
              <span style={{ color: 'var(--vfo-muted)', fontSize: '12.5px' }}>{fmtDateTime(r.fired_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
