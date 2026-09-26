import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { callApi } from '../../lib/api'
import { Skeleton } from '../shared/Skeleton'

// Admin Notifications page (bell "View all"). Two sub-views:
//  - Notifications: the full paginated feed incl. read rows, filter/sort,
//    multi-select bulk clear (dismissible rows only — action-required rows
//    clear when their task completes, same rule as the bell).
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

const REMINDER_VIOLET = '#7c3aed'

function fmtDateTime(s) {
  if (!s) return ''
  try { return new Date(s).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return String(s) }
}

const card = { background: 'var(--vfo-card)', border: '1px solid var(--vfo-border-soft)', borderRadius: '16px', boxShadow: 'var(--vfo-shadow-card)', padding: '22px', marginBottom: '20px' }
const cardTitle = { fontSize: '15px', fontWeight: 700, color: 'var(--vfo-heading)', margin: '0 0 16px', paddingBottom: '8px', borderBottom: '2px solid #002973', display: 'inline-block' }
const pill = (active) => ({ padding: '7px 16px', background: active ? '#125ecc' : 'transparent', border: active ? 'none' : '1px solid var(--vfo-border-mid)', borderRadius: '999px', boxShadow: active ? '0 2px 8px rgba(18,94,204,0.28)' : 'none', color: active ? '#ffffff' : 'var(--vfo-muted)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap' })
const input = { padding: '9px 11px', borderRadius: '8px', border: '1px solid var(--vfo-border-strong)', background: 'var(--vfo-input)', color: 'var(--vfo-ink)', fontSize: '13px', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }

function ListSkeleton() {
  return Array.from({ length: 5 }).map((_, i) => (
    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '13px 4px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
      <Skeleton width={16} height={16} style={{ borderRadius: '4px' }} />
      <div style={{ flex: 1 }}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="80%" height={11} style={{ marginTop: '6px' }} />
      </div>
      <Skeleton width={110} height={11} />
    </div>
  ))
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [subTab, setSubTab] = useState(sessionStorage.getItem('adminNotifSubTab') || 'notifications')

  function pickSubTab(k) { setSubTab(k); sessionStorage.setItem('adminNotifSubTab', k) }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: '10.5px', color: '#0a85e8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 4px' }}>Admin</p>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--vfo-heading)', margin: 0 }}>Notifications</h2>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={pill(subTab === 'notifications')} onClick={() => pickSubTab('notifications')}>Notifications</button>
          <button style={pill(subTab === 'reminders')} onClick={() => pickSubTab('reminders')}>Reminders</button>
        </div>
      </div>

      {subTab === 'notifications' ? <NotificationsView navigate={navigate} /> : <RemindersView />}
    </div>
  )
}

function NotificationsView({ navigate }) {
  const [rows, setRows] = useState(null)
  const [total, setTotal] = useState(0)
  const [scope, setScope] = useState('current')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [scope, kind, sort, page])

  async function load() {
    setRows(null); setError(''); setSelected(new Set())
    try {
      const res = await callApi('load_notifications_page', { offset: page * PAGE_SIZE, limit: PAGE_SIZE, scope, kind, sort })
      if (res?.error) { setError(res.error); return }
      setRows(res.notifications || [])
      setTotal(res.total || 0)
    } catch (e) { setError(e?.message || 'Failed to load') }
  }

  function pickScope(s) { setScope(s); setKind('all'); setPage(0) }
  function pickKind(k) { setKind(k); setPage(0) }

  const selectable = (rows || []).filter(n => n.dismissible !== false && !n.read)
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

  async function clearSelected() {
    if (!selected.size) return
    setBusy(true)
    try {
      await callApi('mark_notifications_read', { notification_ids: [...selected] })
      window.dispatchEvent(new Event('vfo:notifications-changed'))
      await load()
    } catch (e) { setError(e?.message || 'Failed to clear') }
    finally { setBusy(false) }
  }

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

  return (
    <div style={card}>
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--vfo-border-soft)', paddingBottom: '14px', marginBottom: '14px' }}>
        <button style={pill(scope === 'current')} onClick={() => pickScope('current')}>Current</button>
        <button style={pill(scope === 'archive')} onClick={() => pickScope('archive')}>Archive</button>
        <span style={{ fontSize: '11.5px', color: 'var(--vfo-faint)', alignSelf: 'center', marginLeft: '6px' }}>
          {scope === 'current' ? 'Notifications waiting on you.' : 'Already cleared or completed. Kept for 90 days, then removed.'}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {KINDS.map(f => <button key={f.key} style={pill(kind === f.key)} onClick={() => pickKind(f.key)}>{f.label}</button>)}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button style={pill(false)} onClick={() => setSort(s => s === 'newest' ? 'oldest' : 'newest')}>
            {sort === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>
          {scope === 'current' && (
            <button onClick={clearSelected} disabled={busy || selected.size === 0}
              style={{ padding: '7px 16px', borderRadius: '999px', border: 'none', background: selected.size ? 'rgba(22,163,74,0.14)' : 'var(--vfo-tint)', color: selected.size ? '#16a34a' : 'var(--vfo-faint)', fontSize: '12.5px', fontWeight: 700, cursor: selected.size && !busy ? 'pointer' : 'default' }}>
              Clear selected{selected.size ? ` (${selected.size})` : ''}
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '12px', padding: '14px', fontSize: '13px', marginBottom: '14px' }}>{error}</div>}

      {rows === null && !error && <ListSkeleton />}

      {rows !== null && !error && (
        <>
          {scope === 'current' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 4px', borderBottom: '1px solid var(--vfo-border-soft)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--vfo-muted)' }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!selectable.length} style={{ width: '16px', height: '16px', cursor: selectable.length ? 'pointer' : 'default' }} />
              <span>Select all clearable on this page</span>
            </div>
          )}

          {rows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '36px', color: 'var(--vfo-faint)', fontSize: '13px' }}>Nothing here.</div>
          )}

          {rows.map(n => {
            const isAction = n.dismissible === false
            const isReminder = n.pipeline === 'REMINDER'
            const canSelect = scope === 'current' && !isAction && !n.read
            return (
              <div key={n.id}
                style={{
                  display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '13px 4px 13px 8px',
                  borderBottom: '1px solid var(--vfo-border-soft)',
                  borderLeft: isAction ? '3px solid #e06717' : isReminder ? `3px solid ${REMINDER_VIOLET}` : '3px solid transparent',
                  background: isAction && !n.read ? 'rgba(224,103,23,0.06)' : isReminder && !n.read ? 'rgba(124,58,237,0.05)' : 'transparent',
                }}>
                {canSelect ? (
                  <input type="checkbox" checked={selected.has(n.id)} onChange={() => toggleOne(n.id)}
                    style={{ width: '16px', height: '16px', marginTop: '2px', cursor: 'pointer', flexShrink: 0 }} />
                ) : scope === 'current' ? (
                  <span title={isAction && !n.read ? 'Clears automatically when its task is completed' : undefined}
                    style={{ width: '16px', flexShrink: 0 }} />
                ) : null}
                <div onClick={() => openRow(n)} style={{ flex: 1, minWidth: 0, cursor: n.link ? 'pointer' : 'default' }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--vfo-ink)' }}>{n.title}</div>
                  {n.message && <div style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', marginTop: '3px', lineHeight: 1.5 }}>{n.message}</div>}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px', flexWrap: 'wrap' }}>
                    {isAction && <span style={{ fontSize: '9px', color: '#fff', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', background: '#e06717', letterSpacing: '0.4px' }}>ACTION</span>}
                    {isReminder && <span style={{ fontSize: '9px', color: '#fff', fontWeight: 700, padding: '1px 6px', borderRadius: '3px', background: REMINDER_VIOLET, letterSpacing: '0.4px' }}>REMINDER</span>}
                    {n.pipeline && !isReminder && <span style={{ fontSize: '10px', color: '#0095ff', fontWeight: 600, padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,149,255,0.15)' }}>{n.pipeline}</span>}
                    {isAction && !n.read && <span style={{ fontSize: '10.5px', color: 'var(--vfo-faint)' }}>Clears when its task is completed</span>}
                  </div>
                </div>
                <span style={{ fontSize: '11px', color: 'var(--vfo-faint)', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>{fmtDateTime(n.created_at)}</span>
              </div>
            )
          })}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '14px' }}>
            <span style={{ fontSize: '12px', color: 'var(--vfo-muted)' }}>Showing {from}–{to} of {total}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={pill(false)} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>Prev</button>
              <span style={{ fontSize: '12px', color: 'var(--vfo-muted)', alignSelf: 'center' }}>Page {page + 1} of {pageCount}</span>
              <button style={pill(false)} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1}>Next</button>
            </div>
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
  const [form, setForm] = useState({ message: '', fire_date: '', fire_time: '', timezone: browserZone })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await callApi('reminder_load')
      if (res?.error) { setError(res.error); return }
      setUpcoming(res.upcoming || [])
      setFired(res.fired || [])
    } catch (e) { setError(e?.message || 'Failed to load') }
  }

  function flash(msg) { setStatus(msg); setTimeout(() => setStatus(''), 4000) }

  async function create() {
    if (!form.message.trim() || !form.fire_date || !form.fire_time) { flash('Fill in the reminder text, date, and time.'); return }
    setBusy(true); setError('')
    try {
      const res = await callApi('reminder_create', form)
      if (res?.error) { setError(res.error); return }
      setForm(f => ({ ...f, message: '', fire_date: '', fire_time: '' }))
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
    <>
      <div style={card}>
        <div style={cardTitle}>New reminder</div>
        <p style={{ fontSize: '12.5px', color: 'var(--vfo-muted)', margin: '0 0 14px' }}>
          Schedule a note to yourself. It arrives in your notification bell within about 5 minutes of the chosen time.
        </p>
        <textarea value={form.message} maxLength={500} placeholder="What should the reminder say?"
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          style={{ ...input, width: '100%', minHeight: '64px', resize: 'vertical', marginBottom: '12px' }} />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" value={form.fire_date} onChange={e => setForm(f => ({ ...f, fire_date: e.target.value }))} style={input} />
          <input type="time" value={form.fire_time} onChange={e => setForm(f => ({ ...f, fire_time: e.target.value }))} style={input} />
          <select value={form.timezone} onChange={e => setForm(f => ({ ...f, timezone: e.target.value }))} style={{ ...input, minWidth: '180px' }}>
            {zones.map(z => <option key={z} value={z}>{zoneLabel(z)}{z === browserZone ? ' (your zone)' : ''}</option>)}
          </select>
          <button onClick={create} disabled={busy}
            style={{ padding: '9px 22px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #125ecc 0%, #0a85e8 100%)', boxShadow: '0 2px 8px rgba(18,94,204,0.28)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            Schedule reminder
          </button>
        </div>
        {status && <div style={{ marginTop: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{status}</div>}
        {error && <div style={{ marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: '10px', padding: '10px 14px', fontSize: '13px' }}>{error}</div>}
      </div>

      <div style={card}>
        <div style={cardTitle}>Upcoming</div>
        {upcoming === null && (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} style={{ padding: '12px 4px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width={180} height={11} style={{ marginTop: '6px' }} />
            </div>
          ))
        )}
        {upcoming !== null && upcoming.length === 0 && (
          <div style={{ padding: '18px 4px', color: 'var(--vfo-faint)', fontSize: '13px' }}>No upcoming reminders.</div>
        )}
        {(upcoming || []).map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', padding: '12px 4px', borderBottom: '1px solid var(--vfo-border-soft)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13.5px', color: 'var(--vfo-ink)', fontWeight: 600 }}>{r.message}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '3px' }}>
                {r.fire_date} at {r.fire_time} ({zoneLabel(r.timezone)}) — your local time: {fmtDateTime(r.fire_at)}
              </div>
            </div>
            <button onClick={() => cancel(r.id)} disabled={busy}
              style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--vfo-border-mid)', background: 'transparent', color: '#d93025', fontSize: '12.5px', cursor: busy ? 'default' : 'pointer', flexShrink: 0 }}>Cancel</button>
          </div>
        ))}
      </div>

      {fired.length > 0 && (
        <div style={card}>
          <div style={cardTitle}>Recently fired</div>
          {fired.map(r => (
            <div key={r.id} style={{ padding: '12px 4px', borderBottom: '1px solid var(--vfo-border-soft)', opacity: 0.6 }}>
              <div style={{ fontSize: '13px', color: 'var(--vfo-ink)' }}>{r.message}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--vfo-muted)', marginTop: '3px' }}>Fired {fmtDateTime(r.fired_at)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
