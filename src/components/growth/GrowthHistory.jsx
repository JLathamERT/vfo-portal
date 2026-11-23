import { useState, useEffect } from 'react'
import { callApi } from '../../lib/api'
import { TrackHero } from '../shared/TrackKit'
import { NAVY, INK, MUTED, BLUE, cardStyle, accentStrip } from './ui'
import { SkeletonText, StackedCardsSkeleton } from '../shared/Skeleton'

const EVENT_LABEL = {
  scored: 'Plan scored',
  summary_updated: 'Summary score updated',
  actions_edited: 'Possible actions edited',
  prioritized: 'Priorities updated',
  plan_built: 'One-page plan built',
  parking_moved: 'Parking Garage updated',
  progress_set: 'Progress updated',
  accountability_on: 'Accountability Mode turned on',
  accountability_off: 'Accountability Mode turned off',
  due_date_set: 'Due dates set',
}

function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—' }
function detailSummary(h) {
  const d = h.detail || {}
  if (h.event === 'scored' && d.composite != null) return ` — score ${d.composite}`
  if (d.count != null) return ` — ${d.count} ${d.count === 1 ? 'item' : 'items'}`
  return ''
}

export default function GrowthHistory({ memberNumber, onNavigate }) {
  const [history, setHistory] = useState([])
  const [archived, setArchived] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      callApi('growth_plan_load_audit', { member_number: memberNumber }),
      callApi('growth_plan_load_history', { member_number: memberNumber }),
    ]).then(([a, h]) => {
      if (!alive) return
      setHistory(a?.history || [])
      setArchived(h?.scores || [])
      setError('')
    }).catch(e => { if (alive) setError(e?.message || 'Failed to load history') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [memberNumber])

  if (loading) return <StackedCardsSkeleton cards={3} gap="14px" />
  if (error) return <GpMsg text={error} />

  return (
    <div>
      <TrackHero eyebrow="Growth Plan" title="Growth History" meta={<>Every change to this growth plan, newest first.</>} />

      <div style={cardStyle}>
        <div style={accentStrip} />
        <div style={{ padding: '18px 20px' }}>
          <div style={sectionTitle}>Activity Log</div>
          {history.length === 0
            ? <div style={emptyText}>No activity recorded yet.</div>
            : history.map(h => <HistoryRow key={h.id} h={h} />)}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={accentStrip} />
        <div style={{ padding: '18px 20px' }}>
          <div style={sectionTitle}>Past Plans</div>
          {archived.length === 0
            ? <div style={emptyText}>No archived plans yet — re-scoring archives the previous plan here.</div>
            : archived.map(s => <ArchivedRow key={s.id} s={s} memberNumber={memberNumber} />)}
        </div>
      </div>
    </div>
  )
}

function HistoryRow({ h }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '11px 0', borderTop: '1px solid var(--vfo-tint)' }}>
      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: BLUE, flexShrink: 0, marginTop: '6px' }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{EVENT_LABEL[h.event] || h.event}{detailSummary(h)}</div>
        <div style={{ fontSize: '11.5px', color: MUTED, marginTop: '3px' }}>
          {fmtDateTime(h.created_at)} · {h.actor_name || 'Unknown'}<RoleChip role={h.actor_role} />
        </div>
      </div>
    </div>
  )
}

function RoleChip({ role }) {
  const isMember = role === 'member'
  return <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase', padding: '1px 7px', borderRadius: '999px', marginLeft: '7px', color: isMember ? '#0a7d46' : '#1d4ed8', background: isMember ? '#e3f6ec' : '#e7efff' }}>{isMember ? 'Member' : 'Admin'}</span>
}

function ArchivedRow({ s, memberNumber }) {
  const [open, setOpen] = useState(false)
  const [snap, setSnap] = useState(null)
  const [loading, setLoading] = useState(false)

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && !snap) {
      setLoading(true)
      try { const res = await callApi('growth_plan_load', { member_number: memberNumber, score_id: s.id }); setSnap(res) }
      catch { setSnap({ actions: [] }) }
      finally { setLoading(false) }
    }
  }

  const onePage = (snap?.actions || []).filter(a => a.g3_status === 'one_page_plan').sort((a, b) => a.action_number - b.action_number)

  return (
    <div style={{ borderTop: '1px solid var(--vfo-tint)' }}>
      <button onClick={toggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter, sans-serif' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: INK }}>{fmtDate(s.completed_at || s.created_at)}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '12px', color: MUTED }}>Score <strong style={{ color: 'var(--vfo-heading)' }}>{s.composite_score ?? 'N/A'}</strong></span>
          <span style={{ color: MUTED, fontSize: '11px' }}>{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 0 14px' }}>
          {loading ? <SkeletonText lines={3} /> : (
            onePage.length === 0
              ? <div style={emptyText}>No one-page items in this plan.</div>
              : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '440px' }}>
                    <thead><tr><th style={th(34)}>#</th><th style={th()}>Action</th><th style={th(120)}>Owned By</th><th style={th(80)}>Value</th><th style={th(80)}>Effort</th></tr></thead>
                    <tbody>
                      {onePage.map((a, i) => (
                        <tr key={a.id}>
                          <td style={{ ...td, fontWeight: 700, color: 'var(--vfo-heading)' }}>{i + 1}</td>
                          <td style={td}>{a.action_text}</td>
                          <td style={td}>{a.owned_by || '—'}</td>
                          <td style={td}>{cap(a.value_level)}</td>
                          <td style={td}>{cap(a.effort_level)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>
      )}
    </div>
  )
}

function GpMsg({ text }) {
  return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--vfo-muted)', fontSize: '14px' }}>{text}</div>
}

const sectionTitle = { fontSize: '13px', fontWeight: 800, color: 'var(--vfo-heading)', marginBottom: '4px' }
const emptyText = { fontSize: '12.5px', color: MUTED, paddingTop: '10px' }
const th = (w) => ({ textAlign: 'left', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--vfo-faint)', padding: '6px 10px', borderBottom: '2px solid var(--vfo-tint)', width: w ? `${w}px` : 'auto' })
const td = { fontSize: '12.5px', color: INK, padding: '8px 10px', borderBottom: '1px solid var(--vfo-tint)', verticalAlign: 'top', lineHeight: 1.4 }
